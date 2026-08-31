import test from "node:test";
import assert from "node:assert/strict";
import { isUpdatePaused, isWithinMaintenanceWindow, updatePauseExpires } from "./update-policy";

test("an expired pause resumes automatic updates", () => {
    const now = new Date("2026-08-31T12:00:00.000Z");
    assert.equal(isUpdatePaused({ enabled: true, until: "2026-08-31T11:59:59.000Z" }, now), false);
    assert.equal(updatePauseExpires({ enabled: true, until: "2026-08-31T11:59:59.000Z" }, now), true);
});

test("an indefinite pause blocks automatic updates", () => {
    assert.equal(isUpdatePaused({ enabled: true, until: null }), true);
});

test("maintenance windows support overnight ranges", () => {
    assert.equal(isWithinMaintenanceWindow("03:00", "05:00", new Date(2026, 0, 1, 4, 0)), true);
    assert.equal(isWithinMaintenanceWindow("03:00", "05:00", new Date(2026, 0, 1, 5, 0)), false);
    assert.equal(isWithinMaintenanceWindow("23:00", "02:00", new Date(2026, 0, 1, 1, 0)), true);
});
