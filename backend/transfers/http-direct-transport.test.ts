import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { createServer } from "node:http";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { Readable, Writable } from "node:stream";
import {
    cleanupDirectHttpArchives,
    configureHttpDirectTransport,
    directHttpRepositoryId,
    restoreDirectHttpArchive,
    resumeDirectHttpArchive,
    serveDirectHttpArchive,
    uploadDirectHttpArchive,
    verifyDirectHttpArchive,
} from "./http-direct-transport";

test("transfers an archive over authenticated HTTP with Range and SHA-256 verification", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "dockge-http-direct-"));
    configureHttpDirectTransport(root);
    const app = express();
    app.get("/api/transfer/http/:id", (request, response) => void serveDirectHttpArchive(request, response));
    app.head("/api/transfer/http/:id", (request, response) => void serveDirectHttpArchive(request, response));
    const server = createServer(app);
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    try {
        const address = server.address();
        assert.ok(address && typeof address === "object");
        const repositoryId = directHttpRepositoryId(`http://127.0.0.1:${address.port}`);
        const payload = Buffer.from("direct-http-transfer-".repeat(4096));
        const snapshotId = await uploadDirectHttpArchive(repositoryId, Readable.from(payload));
        await verifyDirectHttpArchive(repositoryId, snapshotId);
        assert.deepEqual(await resumeDirectHttpArchive(repositoryId, snapshotId), { offset: 0,
            size: payload.length });

        const descriptor = JSON.parse(Buffer.from(snapshotId.slice("http-snapshot:".length), "base64url").toString("utf8")) as { id: string; token: string };
        const ranged = await fetch(`http://127.0.0.1:${address.port}/api/transfer/http/${descriptor.id}`, { headers: { Authorization: `Bearer ${descriptor.token}`,
            Range: "bytes=100-" } });
        assert.equal(ranged.status, 206);
        assert.equal(Buffer.from(await ranged.arrayBuffer()).equals(payload.subarray(100)), true);
        const denied = await fetch(`http://127.0.0.1:${address.port}/api/transfer/http/${descriptor.id}`, { headers: { Authorization: "Bearer invalid" } });
        assert.equal(denied.status, 401);

        const downloads = path.join(root, "transfers", "http-direct", "downloads");
        await fs.mkdir(downloads, { recursive: true });
        await fs.writeFile(path.join(downloads, `${descriptor.id}.part`), payload.subarray(0, 100));
        assert.deepEqual(await resumeDirectHttpArchive(repositoryId, snapshotId), { offset: 100,
            size: payload.length });

        const chunks: Buffer[] = [];
        const output = new Writable({ write(chunk, _encoding, callback) {
            chunks.push(Buffer.from(chunk));
            callback();
        } });
        await restoreDirectHttpArchive(repositoryId, snapshotId, output);
        assert.equal(Buffer.concat(chunks).equals(payload), true);
        await cleanupDirectHttpArchives([ snapshotId ]);
    } finally {
        await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
        await fs.rm(root, { recursive: true,
            force: true });
    }
});
