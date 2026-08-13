import test from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { BackupRunLock, normalizeStackBackupPolicy, readDiskUsage } from "./backup-manager";

test("defaults unknown stack policies to hot mode", () => {
    assert.deepEqual(normalizeStackBackupPolicy(undefined), { mode: "hot" });
    assert.deepEqual(normalizeStackBackupPolicy({ mode: "invalid" }), { mode: "hot" });
});

test("keeps stop mode without hook fields", () => {
    assert.deepEqual(normalizeStackBackupPolicy({
        mode: "stop",
        hookService: "database",
        preHook: "dump",
    }), { mode: "stop" });
});

test("trims application hook settings", () => {
    assert.deepEqual(normalizeStackBackupPolicy({
        mode: "hooks",
        hookService: " database ",
        preHook: " pg_dumpall ",
        postHook: "   ",
    }), {
        mode: "hooks",
        hookService: "database",
        preHook: "pg_dumpall",
        postHook: undefined,
    });
});

test("blocks a second backup when overlap protection is enabled", () => {
    const lock = new BackupRunLock();
    assert.equal(lock.acquire(true), true);
    assert.equal(lock.acquire(true), false);
    assert.equal(lock.isActive(), true);
    lock.release();
    assert.equal(lock.isActive(), false);
});

test("allows concurrent backups when overlap protection is disabled", () => {
    const lock = new BackupRunLock();
    assert.equal(lock.acquire(false), true);
    assert.equal(lock.acquire(false), true);
    lock.release();
    assert.equal(lock.isActive(), true);
    lock.release();
    assert.equal(lock.isActive(), false);
});

test("mesure un chemin sans interpréter ses caractères comme une commande", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "dockge-du-"));
    const marker = path.join(root, "commande-executee");
    const volume = path.join(root, `volume;touch ${path.basename(marker)}`);
    try {
        await fs.mkdir(volume);
        await fs.writeFile(path.join(volume, "data.bin"), Buffer.alloc(4096));
        assert.match(await readDiskUsage(volume), /^\S+/);
        await assert.rejects(fs.access(marker));
    } finally {
        await fs.rm(root, { recursive: true, force: true });
    }
});
