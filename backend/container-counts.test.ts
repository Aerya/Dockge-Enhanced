import { strict as assert } from "node:assert";
import { test } from "node:test";
import { countContainerStates } from "./container-counts";

test("counts Docker containers independently of their Compose stack", () => {
    assert.deepEqual(countContainerStates([ "running", "running", "exited", "created", "paused" ]), {
        total: 5,
        running: 2,
        stopped: 2,
        paused: 1,
    });
});
