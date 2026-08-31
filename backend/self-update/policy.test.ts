import assert from "node:assert/strict";
import test from "node:test";
import { isAllowedTargetImage, isPathInside, isSelfUpdateActive, normalizeSelfRepository } from "./policy";

test("every non-terminal self-update phase is locked", () => {
    for (const state of [ "scheduled", "backing-up", "verifying-backup", "updating", "waiting-health", "rolling-back" ] as const) assert.equal(isSelfUpdateActive(state), true, state);
    for (const state of [ "idle", "succeeded", "failed", "rolled-back", "rollback-failed" ] as const) assert.equal(isSelfUpdateActive(state), false, state);
});

test("the target repository must exactly match the configured repository", () => {
    const digest = `sha256:${"a".repeat(64)}`;
    assert.equal(isAllowedTargetImage(`ghcr.io/aerya/dockge-enhanced@${digest}`, "aerya/dockge-enhanced"), true);
    assert.equal(isAllowedTargetImage(`ghcr.io/other/dockge-enhanced@${digest}`, "aerya/dockge-enhanced"), false);
    assert.equal(isAllowedTargetImage("dockge-enhanced:test-v2", "aerya/dockge-enhanced", [ "dockge-enhanced:test-v2" ]), true);
    assert.equal(normalizeSelfRepository("ghcr.io/MyFork/Dockge-Enhanced"), "myfork/dockge-enhanced");
});

test("Compose configuration paths cannot escape their working directory", () => {
    assert.equal(isPathInside("/srv/dockge", "/srv/dockge/compose.yaml"), true);
    assert.equal(isPathInside("/srv/dockge", "/srv/other/compose.yaml"), false);
    assert.equal(isPathInside("/srv/dockge", "/srv/dockge/../other/compose.yaml"), false);
});
