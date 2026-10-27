import test from "node:test";
import assert from "node:assert/strict";
import { buildCacheCleanupSummary, cleanupNotification, imageCleanupCounts } from "./cleanup";
import { ImageRemovalProtectedError, recordImageRemovalFailure, type PruneImageDecision } from "../watchers/auto-prune-manager";

test("long Docker output becomes a bounded localized report with instance and reclaimed space", () => {
    const raw = `Deleted build cache objects:\n${"private-cache-id\n".repeat(1000)}\nTotal reclaimed space: 647.7MB\nDEPRECATED: The legacy builder is deprecated and will be removed in a future release.\n`;
    for (const language of [ "fr", "en", "de", "es", "zh-CN" ]) {
        const result = cleanupNotification({ event: "partial",
            hostname: "test-instance",
            language,
            categories: [ "images", "networks", "buildCache" ],
            summaries: {
                images: { imagePasses: [{ kind: "dangling",
                    counts: { removed: 76,
                        used: 5,
                        tooRecent: 304 } },
                { kind: "unused",
                    counts: { removed: 20,
                        used: 15,
                        active: 1,
                        rollback: 1,
                        recovery: 2,
                        tooRecent: 29,
                        error: 1 } }],
                failed: true },
                networks: { removed: 1 },
                buildCache: buildCacheCleanupSummary(raw),
            },
            durationSeconds: 61 });
        assert.match(result.title, /^\[test-instance\]/);
        assert.match(result.footer, /test-instance/);
        assert.match(result.body, /647\.7MB/);
        assert.match(result.body, /Buildx/);
        assert.doesNotMatch(result.body, /private-cache-id|Deleted build|DEPRECATED/);
        assert.ok(result.body.length < 1500);
        if (language === "fr") {
            assert.match(result.body, /Réseaux/);
            assert.match(result.body, /supprimées : 76/);
            assert.match(result.body, /trop récentes : 304/);
            assert.match(result.body, /erreurs : 1/);
        }
    }
});

test("warnings do not become failures and absent reclaim amounts are never invented", () => {
    assert.deepEqual(buildCacheCleanupSummary("unknown output"), { reclaimed: undefined,
        legacyWarning: false });
    const result = cleanupNotification({ event: "completed",
        hostname: "",
        language: "fr",
        categories: [ "buildCache" ],
        summaries: { buildCache: buildCacheCleanupSummary("Total reclaimed space: 0B") } });
    assert.match(result.title, /✅/);
    assert.match(result.body, /0B/);
    const manual = cleanupNotification({ event: "completed",
        automatic: false,
        hostname: "fixture",
        language: "fr",
        categories: [] });
    assert.match(manual.title, /manuel/);
    assert.doesNotMatch(manual.title, /automatique/);
});

test("started, deferred and failed reports identify the instance without unbounded raw output", () => {
    for (const event of [ "started", "deferred", "failed" ] as const) {
        const result = cleanupNotification({ event,
            hostname: "fixture",
            language: "fr",
            categories: [ "networks", "buildCache" ],
            reason: "x".repeat(5000) });
        assert.match(result.title, /\[fixture\]/);
        assert.ok(result.body.length < 600);
        if (event === "started") {
            assert.match(result.body, /Réseaux, Cache de construction/);
        }
    }
});

test("typed revalidation protections are skips; arbitrary Docker errors still fail", () => {
    for (const outcome of [ "used", "active", "rollback", "recovery", "excluded" ] as const) {
        const decision: PruneImageDecision = { id: "fixture",
            references: [],
            outcome: "error" };
        const errors: string[] = [];
        recordImageRemovalFailure(new ImageRemovalProtectedError(outcome, "protected"), decision, errors);
        assert.equal(decision.outcome, outcome);
        assert.deepEqual(errors, []);
        assert.deepEqual(imageCleanupCounts([ decision ]), { [outcome]: 1 });
    }
    const decision: PruneImageDecision = { id: "fixture",
        references: [],
        outcome: "removed" };
    const errors: string[] = [];
    recordImageRemovalFailure(new Error("Docker unavailable"), decision, errors);
    assert.equal(decision.outcome, "error");
    assert.equal(errors.length, 1);
});
