import assert from "node:assert/strict";
import test from "node:test";
import { EXITED, PAUSED, RUNNING, UNKNOWN } from "../common/util-common";
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

test("failed and restarting containers cannot appear as a healthy stack", () => {
    for (const state of [
        { status: "exited",
            exitCode: 1 },
        { status: "restarting" },
    ]) {
        assert.equal(resolveMixedComposeStatus([ { status: "running" }, state ]), EXITED);
    }
});

test("paused containers are reported as paused, never running", async () => {
    assert.equal(resolveMixedComposeStatus([ { status: "paused" } ]), PAUSED);
    assert.equal(resolveMixedComposeStatus([ { status: "running" }, { status: "paused" } ]), PAUSED);
    assert.equal(await Stack.resolveComposeStatus("test-project", "paused(2)"), PAUSED);
});

test("incomplete state is unknown and a fully exited project remains stopped", () => {
    assert.equal(resolveMixedComposeStatus([]), UNKNOWN);
    assert.equal(resolveMixedComposeStatus([ { status: "running" }, { status: "exited" } ]), UNKNOWN);
    assert.equal(resolveMixedComposeStatus([ { status: "exited",
        exitCode: 0 } ]), EXITED);
});

test("ignored services do not degrade the global stack status", () => {
    assert.equal(resolveMixedComposeStatus([
        { status: "running" },
        { status: "exited",
            exitCode: 1,
            ignored: true },
        { status: "paused",
            ignored: true },
    ]), RUNNING);
});

test("an all-ignored stack still reports a meaningful status", () => {
    assert.equal(resolveMixedComposeStatus([
        { status: "exited",
            exitCode: 0,
            ignored: true },
    ]), EXITED);
});

test("non-mixed Compose statuses do not need container inspection", async () => {
    assert.equal(await Stack.resolveComposeStatus("test-project", "running(2)"), RUNNING);
    assert.equal(await Stack.resolveComposeStatus("test-project", "exited(2)"), EXITED);
});
