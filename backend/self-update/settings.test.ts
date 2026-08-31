import test from "node:test";
import assert from "node:assert/strict";
import { normalizeSelfUpdateSettings, selfUpdateMayRun } from "./settings";

test("existing installations keep manual self-update by default", () => {
    assert.equal(normalizeSelfUpdateSettings({}).mode, "manual");
    assert.equal(selfUpdateMayRun(normalizeSelfUpdateSettings({})), false);
});

test("sidecar immediate updates are allowed unless paused", () => {
    const settings = normalizeSelfUpdateSettings({ mode: "sidecar" });
    assert.equal(selfUpdateMayRun(settings), true);
    settings.pause = { enabled: true, until: null };
    assert.equal(selfUpdateMayRun(settings), false);
});

test("window updates wait for the configured time", () => {
    const settings = normalizeSelfUpdateSettings({ mode: "sidecar", schedule: { type: "window", start: "03:00", end: "05:00" } });
    assert.equal(selfUpdateMayRun(settings, new Date(2026, 0, 1, 4, 0)), true);
    assert.equal(selfUpdateMayRun(settings, new Date(2026, 0, 1, 6, 0)), false);
});

test("window updates only run on selected weekdays", () => {
    const settings = normalizeSelfUpdateSettings({ mode: "sidecar", schedule: { type: "window", start: "03:00", end: "05:00", days: [ 1 ] } });
    assert.equal(selfUpdateMayRun(settings, new Date("2026-08-31T04:00:00")), true);
    assert.equal(selfUpdateMayRun(settings, new Date("2026-09-01T04:00:00")), false);
});
