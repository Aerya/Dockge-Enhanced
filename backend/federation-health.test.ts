import test from "node:test";
import assert from "node:assert/strict";
import {
    FederationAvailabilityAlertTracker,
    FederationIngressGuard,
    federationCircuitRetryDelayMs,
    federationIncidentUsesCooldown,
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

test("uses outage episodes instead of time cooldown for circuit alerts", () => {
    assert.equal(federationIncidentUsesCooldown("reconnect-circuit-open"), false);
    assert.equal(federationIncidentUsesCooldown("authentication-failed"), true);
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

test("sends one availability alert per continuous outage", () => {
    const tracker = new FederationAvailabilityAlertTracker();

    assert.equal(tracker.shouldNotify("garuda:5001"), true);
    assert.equal(tracker.shouldNotify("garuda:5001"), false);
    assert.equal(tracker.hasActiveIncident("garuda:5001"), true);

    tracker.markOnline("garuda:5001");
    assert.equal(tracker.hasActiveIncident("garuda:5001"), false);
    assert.equal(tracker.shouldNotify("garuda:5001"), true);
});

test("suppresses availability alerts for intermittent peers", () => {
    const tracker = new FederationAvailabilityAlertTracker();

    assert.equal(tracker.shouldNotify("garuda:5001", true), false);
    assert.equal(tracker.hasActiveIncident("garuda:5001"), false);
    assert.equal(tracker.shouldNotify("garuda:5001", false), true);
});

