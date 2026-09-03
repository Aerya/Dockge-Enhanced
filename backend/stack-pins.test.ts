import test from "node:test";
import assert from "node:assert/strict";
import { applyStackPin, normalizePinnedStacks } from "./stack-pins";

test("normalizes persisted stack pins", () => {
    assert.deepEqual(
        normalizePinnedStacks(JSON.stringify([ "alpha", "alpha", "", 42, " beta " ])),
        [ "alpha", "beta" ],
    );
});

test("adds and removes a stack pin without altering others", () => {
    assert.deepEqual(applyStackPin([ "alpha" ], "beta", true), [ "alpha", "beta" ]);
    assert.deepEqual(applyStackPin([ "alpha", "beta" ], "alpha", false), [ "beta" ]);
});

test("rejects invalid pin input", () => {
    assert.throws(() => applyStackPin([], "", true));
    assert.throws(() => applyStackPin([], "alpha", "yes"));
});
