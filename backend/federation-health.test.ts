import test from "node:test";
import assert from "node:assert/strict";
import {
    FederationIngressGuard,
    federationCircuitRetryDelayMs,
    isKnexPoolTimeout,
    safeFederationErrorMessage,
} from "./federation-health";

test("blocks an inbound federation handshake storm", () => {
    const guard = new FederationIngressGuard(1_000, 3, 5_000);
    assert.equal(guard.registerAttempt("peer", 1_000).allowed, true);
    assert.equal(guard.registerAttempt("peer", 1_100).allowed, true);
    assert.equal(guard.registerAttempt("peer", 1_200).allowed, true);
    const blocked = guard.registerAttempt("peer", 1_300);
    assert.equal(blocked.allowed, false);
    assert.equal(blocked.tripped, true);
});

test("adds bounded jitter to circuit retry", () => {
    assert.equal(federationCircuitRetryDelayMs(5_000, 0), 5_000);
    assert.equal(federationCircuitRetryDelayMs(5_000, 1), 15_000);
});

test("detects Knex pool exhaustion", () => {
    assert.equal(isKnexPoolTimeout(new Error("KnexTimeoutError: Timeout acquiring a connection")), true);
    assert.equal(isKnexPoolTimeout(new Error("ordinary timeout")), false);
});

test("redacts secrets from federation errors", () => {
    const safe = safeFederationErrorMessage("https://user:pass@example.test/?token=abc password=secret");
    assert.doesNotMatch(safe, /abc|secret|user:pass/);
    assert.match(safe, /\[redacted\]/);
});
