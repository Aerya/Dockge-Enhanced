import assert from "node:assert/strict";
import test from "node:test";
import { assertNotSelfStack, assertStackPauseAllowed } from "./stack-pause-policy";

const state = (backup: boolean, restore: boolean, mode?: string) => ({
    isBackupRunActive: () => backup,
    isRestoreRunActive: () => restore,
    settings: { stackPolicies: mode ? { demo: { mode } } : {} as Record<string, { mode: string }> },
});

test("pausing never interrupts an active backup or restore", () => {
    assert.throws(() => assertStackPauseAllowed(state(true, false), "demo", true));
    assert.throws(() => assertStackPauseAllowed(state(false, true), "demo", true));
});

test("stop and hook backup policies cannot be paused, hot backups can", () => {
    assert.throws(() => assertStackPauseAllowed(state(false, false, "stop"), "demo", true));
    assert.throws(() => assertStackPauseAllowed(state(false, false, "hooks"), "demo", true));
    assert.doesNotThrow(() => assertStackPauseAllowed(state(false, false, "hot"), "demo", true));
    assert.doesNotThrow(() => assertStackPauseAllowed(state(false, false, "hooks"), "demo", false));
});

test("Enhanced cannot pause its own Compose project", () => {
    assert.throws(() => assertNotSelfStack("container-id", [ "other-id", "container-id" ]));
    assert.throws(() => assertNotSelfStack(undefined, [ "other-id" ]));
    assert.doesNotThrow(() => assertNotSelfStack("container-id", [ "other-id" ]));
});
