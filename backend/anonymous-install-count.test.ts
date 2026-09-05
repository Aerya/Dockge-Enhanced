import test from "node:test";
import assert from "node:assert/strict";
import { getUsageCountAssetUrl, getUsageCountMonth, shouldAttemptUsageCount } from "./anonymous-install-count";

test("génère un asset mensuel GitHub sans identifiant d'installation", () => {
    const now = new Date("2026-09-05T10:00:00.000Z");
    assert.equal(getUsageCountMonth(now), "2026-09");
    assert.equal(
        getUsageCountAssetUrl("2026-09"),
        "https://github.com/Aerya/Dockge-Enhanced/releases/download/usage-count/2026-09.txt",
    );
});

test("ne compte une installation qu'une fois par mois", () => {
    const now = new Date("2026-09-05T10:00:00.000Z");
    assert.equal(shouldAttemptUsageCount({ lastCountedMonth: "2026-09", lastAttemptAt: null }, now), false);
    assert.equal(shouldAttemptUsageCount({ lastCountedMonth: "2026-08", lastAttemptAt: null }, now), true);
});

test("borne les retries lorsque l'asset mensuel n'est pas encore disponible", () => {
    const now = new Date("2026-09-05T10:00:00.000Z");
    assert.equal(shouldAttemptUsageCount({ lastCountedMonth: null, lastAttemptAt: "2026-09-05T03:00:00.000Z" }, now), false);
    assert.equal(shouldAttemptUsageCount({ lastCountedMonth: null, lastAttemptAt: "2026-09-04T20:00:00.000Z" }, now), true);
});

test("refuse un endpoint de comptage non HTTPS", () => {
    assert.throws(() => getUsageCountAssetUrl("2026-09", "http://example.test/count"), /HTTPS/);
});
