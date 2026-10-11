import assert from "node:assert/strict";
import test from "node:test";
import type { SelfUpdateOperation } from "./types";
import { sidecarWatchState, updaterContainerFailure } from "./sidecar-watch";

const now = Date.parse("2026-10-11T20:00:00.000Z");
const operation: SelfUpdateOperation = {
    id: "a".repeat(32),
    state: "updating",
    message: "Downloading target Dockge-Enhanced image",
    startedAt: new Date(now - 25 * 60_000).toISOString(),
    stageStartedAt: new Date(now - 21 * 60_000).toISOString(),
    finishedAt: null,
    targetImage: "ghcr.io/aerya/dockge-enhanced:latest",
    rollbackAttempted: false,
    stage: "pull-target",
};

test("a long-running pull is flagged for inspection, never silently declared failed", () => {
    assert.equal(sidecarWatchState(operation, now), "stalled-pull");
    assert.equal(sidecarWatchState({ ...operation,
        stageStartedAt: new Date(now - 60_000).toISOString() }, now), "check");
    assert.equal(sidecarWatchState({ ...operation,
        state: "succeeded" }, now), null);
    assert.equal(sidecarWatchState({ ...operation,
        state: "waiting-health",
        stage: "health-check" }, now), "check");
    assert.equal(sidecarWatchState({ ...operation,
        state: "rolling-back",
        stage: "rollback" }, now), "check");
    assert.equal(sidecarWatchState({ ...operation,
        state: "scheduled" }, now), null);
});

test("a dead updater exposes the Docker GC failure instead of a stale pull state", () => {
    assert.deepEqual(updaterContainerFailure("{\"Running\":false,\"ExitCode\":1,\"Error\":\"gc failed\"}"), {
        stopped: true,
        detail: "gc failed",
    });
    assert.deepEqual(updaterContainerFailure("{\"Running\":true,\"ExitCode\":0,\"Error\":\"\"}"), {
        stopped: false,
        detail: "",
    });
});
