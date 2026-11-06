import assert from "node:assert/strict";
import test from "node:test";
import { containerUptime } from "./container-lifecycle";

test("uptime starts at the last start, not container creation", () => {
    const now = Date.parse("2026-11-06T12:00:00Z");
    assert.equal(containerUptime("2026-11-06T10:59:58Z", "running", now), "1:00:02");
    assert.equal(containerUptime("2026-11-06T11:59:58Z", "running", now), "0:00:02");
    assert.equal(containerUptime("2026-11-04T12:00:00Z", "running", now), "48:00:00");
});

test("no invented uptime for stopped, never started or older-agent containers", () => {
    for (const state of [ "created", "exited", "dead", "paused", "restarting" ]) {
        assert.equal(containerUptime("2026-11-06T10:00:00Z", state), null);
    }
    for (const date of [ null, undefined, "invalid", "0001-01-01T00:00:00Z", "2999-01-01T00:00:00Z" ]) {
        assert.equal(containerUptime(date, "running"), null);
    }
});
