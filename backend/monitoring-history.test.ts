import assert from "node:assert/strict";
import test from "node:test";
import { cpuPercentFromDelta, historyBucketSeconds, historyStartDate } from "./monitoring-history";
import { parseMonitoringHistoryRange } from "./routers/monitoring-router";

test("le CPU hôte est calculé par delta /proc/stat", () => {
    assert.equal(cpuPercentFromDelta({ idle: 100,
        total: 200 }, { idle: 140,
        total: 300 }), 60);
    assert.equal(cpuPercentFromDelta({ idle: 100,
        total: 200 }, { idle: 100,
        total: 200 }), null);
});

test("les plages historiques gèrent jours, mois et années sans backfill", () => {
    const now = new Date("2026-10-05T12:00:00.000Z");
    assert.equal(historyStartDate(7, "days", now).toISOString(), "2026-09-28T12:00:00.000Z");
    assert.equal(historyStartDate(1, "months", now).toISOString(), "2026-09-05T12:00:00.000Z");
    assert.equal(historyStartDate(1, "years", now).toISOString(), "2025-10-05T12:00:00.000Z");
});

test("les mois et années calendaires bornent le jour à la fin du mois cible", () => {
    assert.equal(
        historyStartDate(1, "months", new Date("2026-03-31T12:34:56.789Z")).toISOString(),
        "2026-02-28T12:34:56.789Z",
    );
    assert.equal(
        historyStartDate(3, "months", new Date("2026-05-31T12:34:56.789Z")).toISOString(),
        "2026-02-28T12:34:56.789Z",
    );
    assert.equal(
        historyStartDate(1, "years", new Date("2024-02-29T12:34:56.789Z")).toISOString(),
        "2023-02-28T12:34:56.789Z",
    );
});

test("le downsampling borne une longue plage à environ 750 points", () => {
    const from = new Date("2025-10-05T12:00:00.000Z");
    const to = new Date("2026-10-05T12:00:00.000Z");
    const bucket = historyBucketSeconds(from, to);
    assert.ok((to.getTime() - from.getTime()) / 1000 / bucket <= 750);
    assert.equal(bucket % 300, 0);
});

test("l'API valide strictement presets et plages personnalisées", () => {
    const now = new Date("2026-10-05T12:00:00.000Z");
    assert.equal(parseMonitoringHistoryRange({ preset: "24h" }, now).amount, 1);
    assert.equal(parseMonitoringHistoryRange({ amount: "2",
        unit: "weeks" }, now).unit, "weeks");
    assert.throws(() => parseMonitoringHistoryRange({ preset: "forever" }, now), /preset invalide/);
    assert.throws(() => parseMonitoringHistoryRange({ amount: "0",
        unit: "days" }, now), /requis/);
    assert.throws(() => parseMonitoringHistoryRange({ amount: "11",
        unit: "years" }, now), /trop grande/);
});
