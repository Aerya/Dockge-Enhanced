import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { PassThrough, Readable } from "node:stream";
import test from "node:test";
import {
    cacheManagedReplicationSnapshot,
    cleanupManagedReplicationSnapshots,
    configureManagedReplicationTransport,
    restoreManagedReplicationSnapshot,
    verifyManagedReplicationSnapshot,
} from "./managed-replication-transport";

test("caches, verifies, restores and removes an automatically managed replica snapshot", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "dockge-managed-replica-"));
    configureManagedReplicationTransport(root);
    const payload = Buffer.from("managed replication payload");
    try {
        const cached = await cacheManagedReplicationSnapshot("replica-test", async output => {
            await new Promise<void>((resolve, reject) => {
                const input = Readable.from(payload);
                input.once("error", reject);
                output.once("error", reject);
                input.once("end", resolve);
                input.pipe(output, { end: false });
            });
        });
        await verifyManagedReplicationSnapshot(cached.repositoryId, cached.snapshotId);
        const restored: Buffer[] = [];
        const output = new PassThrough();
        output.on("data", chunk => restored.push(chunk as Buffer));
        await restoreManagedReplicationSnapshot(cached.repositoryId, cached.snapshotId, output);
        assert.deepEqual(Buffer.concat(restored), payload);
        await cleanupManagedReplicationSnapshots(cached.repositoryId, [ cached.snapshotId ]);
        await assert.rejects(verifyManagedReplicationSnapshot(cached.repositoryId, cached.snapshotId));
    } finally {
        await fs.rm(root, { recursive: true,
            force: true });
    }
});
