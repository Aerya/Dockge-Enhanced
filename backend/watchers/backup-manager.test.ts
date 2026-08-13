import test from "node:test";
import assert from "node:assert/strict";
import { BackupRunLock, normalizeStackBackupPolicy } from "./backup-manager";

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
