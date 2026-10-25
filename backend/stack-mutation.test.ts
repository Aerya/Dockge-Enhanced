import test from "node:test";
import assert from "node:assert/strict";
import { withStackMutation, stackMutation, markRolloutDraining, isRolloutDraining } from "./stack-mutation";

test("stack mutations exclude concurrent actions but allow nested calls and other projects", async () => {
    let finish!: () => void;
    const gate = new Promise<void>(resolve => {
        finish = resolve;
    });
    const first = withStackMutation("app", async () => {
        await withStackMutation("app", async () => {});
        await gate;
    });
    await assert.rejects(withStackMutation("app", async () => {}), /operation is active/);
    await withStackMutation("unrelated", async () => {});
    finish();
    await first;
    await withStackMutation("app", async () => {});
});

test("method reservations are released on exceptions", async () => {
    class Fixture {
        operationProject = "failure";
        @stackMutation
        async run(fail: boolean) {
            if (fail) {
                throw new Error("fixture failure");
            }
            return 42;
        }
    }
    const fixture = new Fixture();
    await assert.rejects(fixture.run(true), /fixture failure/);
    assert.equal(await fixture.run(false), 42);
});

test("only the explicitly drained old replicas bypass healing, until cleanup", () => {
    const release = markRolloutDraining([ "old" ]);
    assert.equal(isRolloutDraining("old"), true);
    assert.equal(isRolloutDraining("new"), false);
    release();
    assert.equal(isRolloutDraining("old"), false);
});
