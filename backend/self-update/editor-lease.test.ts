import assert from "node:assert/strict";
import test from "node:test";
import { COMPOSE_EDIT_LEASE_TTL_MS, ComposeEditLeaseManager } from "./editor-lease";

test("dirty compose edit blocks self-update only while its heartbeat is alive", () => {
    const manager = ComposeEditLeaseManager.getInstance();
    manager.clearForTests();
    const now = 1_000_000;
    manager.update({ sessionId: "session-12345678", stackName: "jellyfin", dirty: true }, now);
    assert.equal(manager.hasBlockingLease(now + COMPOSE_EDIT_LEASE_TTL_MS - 1), true);
    assert.equal(manager.hasBlockingLease(now + COMPOSE_EDIT_LEASE_TTL_MS + 1), false);
});

test("explicit defer survives release until its deadline", () => {
    const manager = ComposeEditLeaseManager.getInstance();
    manager.clearForTests();
    const now = 2_000_000;
    manager.update({ sessionId: "session-abcdefgh", stackName: "radarr", dirty: true, holdMinutes: 30 }, now);
    manager.release("session-abcdefgh", false, now + 5_000);
    assert.equal(manager.hasBlockingLease(now + 29 * 60_000), true);
    assert.equal(manager.hasBlockingLease(now + 31 * 60_000), false);
});

test("save-and-update release can clear an explicit defer immediately", () => {
    const manager = ComposeEditLeaseManager.getInstance();
    manager.clearForTests();
    const now = 3_000_000;
    manager.update({ sessionId: "session-zxyw9876", stackName: "sonarr", dirty: true, holdMinutes: 60 }, now);
    manager.release("session-zxyw9876", true, now + 1_000);
    assert.equal(manager.hasBlockingLease(now + 1_001), false);
});
