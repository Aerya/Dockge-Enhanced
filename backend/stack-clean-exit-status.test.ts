import assert from "node:assert/strict";
import test from "node:test";
import { EXITED, RUNNING, UNKNOWN } from "../common/util-common";
import { resolveMixedComposeStatus, Stack } from "./stack";

test("clean-exit init container does not mark a running stack as stopped", () => {
    assert.equal(resolveMixedComposeStatus([
        { status: "running" },
        { status: "exited",
            exitCode: 0 },
    ]), RUNNING);
});

test("an intentionally stopped service preserves the existing active-stack behavior", () => {
    assert.equal(resolveMixedComposeStatus([
        { status: "exited",
            exitCode: 0 },
        { status: "running" },
    ]), RUNNING);
});

test("failed, paused and restarting containers cannot appear as a healthy stack", () => {
    for (const state of [
        { status: "exited",
            exitCode: 1 },
        { status: "paused" },
        { status: "restarting" },
    ]) {
        assert.equal(resolveMixedComposeStatus([ { status: "running" }, state ]), EXITED);
    }
});

test("incomplete state is unknown and a fully exited project remains stopped", () => {
    assert.equal(resolveMixedComposeStatus([]), UNKNOWN);
    assert.equal(resolveMixedComposeStatus([ { status: "running" }, { status: "exited" } ]), UNKNOWN);
    assert.equal(resolveMixedComposeStatus([ { status: "exited",
        exitCode: 0 } ]), EXITED);
});

test("non-mixed Compose statuses do not need container inspection", async () => {
    assert.equal(await Stack.resolveComposeStatus("test-project", "running(2)"), RUNNING);
    assert.equal(await Stack.resolveComposeStatus("test-project", "exited(2)"), EXITED);
});
