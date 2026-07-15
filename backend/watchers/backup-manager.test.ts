import test from "node:test";
import assert from "node:assert/strict";
import { normalizeStackBackupPolicy } from "./backup-manager";

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
