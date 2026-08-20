import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { rateLimit } from "express-rate-limit";
import { createServer } from "node:http";
import { execFileSync } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { configureHttpDirectTransport, directHttpRepositoryId, serveDirectHttpArchive } from "./http-direct-transport";
import { exportStackImage, importStackImage } from "./stack-image-transfer";
import { stackTransferTransport } from "./stack-transfer-transport";

function docker(...args: string[]): string {
    return execFileSync("docker", args, { encoding: "utf8" });
}

let dockerAvailable = true;
try {
    docker("image", "inspect", "busybox:stable");
} catch {
    dockerAvailable = false;
}

test("copies a tagged local Docker image over verified direct HTTP", { skip: !dockerAvailable }, async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "dockge-image-transfer-"));
    const image = `dockge-image-transfer-test:${Date.now()}`;
    configureHttpDirectTransport(root);
    const app = express();
    app.use("/api/transfer/http", rateLimit({ windowMs: 60_000,
        limit: 100 }));
    app.get("/api/transfer/http/:id", (request, response) => void serveDirectHttpArchive(request, response));
    app.head("/api/transfer/http/:id", (request, response) => void serveDirectHttpArchive(request, response));
    const server = createServer(app);
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const repositoryId = directHttpRepositoryId(`http://127.0.0.1:${address.port}`);
    let snapshotId = "";
    try {
        docker("image", "tag", "busybox:stable", image);
        const archive = await exportStackImage(image, repositoryId);
        snapshotId = archive.snapshotId;
        assert.ok(archive.size > 0);
        docker("image", "rm", image);
        await importStackImage(repositoryId, archive);
        assert.match(docker("image", "inspect", image, "--format", "{{.Id}}"), /^sha256:/);
    } finally {
        try {
            docker("image", "rm", image);
        } catch { /* already removed */ }
        if (snapshotId) {
            await stackTransferTransport.cleanup(repositoryId, [ snapshotId ]).catch(() => {});
        }
        await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
        await fs.rm(root, { recursive: true,
            force: true });
    }
});
