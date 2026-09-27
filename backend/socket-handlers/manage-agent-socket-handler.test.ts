import test from "node:test";
import assert from "node:assert/strict";
import {
    normalizeAgentDisplayName,
    normalizeAgentOfflineAlertSuppressed,
} from "./manage-agent-socket-handler";

test("normalizes optional agent display names", () => {
    assert.equal(normalizeAgentDisplayName(undefined), "");
    assert.equal(normalizeAgentDisplayName("  NAS principal  "), "NAS principal");
});

test("rejects invalid agent display names", () => {
    assert.throws(() => normalizeAgentDisplayName(42), /must be a string/);
    assert.throws(() => normalizeAgentDisplayName("a".repeat(101)), /100 characters/);
});

test("accepts only boolean offline-alert suppression values", () => {
    assert.equal(normalizeAgentOfflineAlertSuppressed(true), true);
    assert.equal(normalizeAgentOfflineAlertSuppressed(false), false);
    assert.throws(() => normalizeAgentOfflineAlertSuppressed("true"), /must be a boolean/);
});

