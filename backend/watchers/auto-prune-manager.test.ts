import test from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
    AutoPruneManager,
    AutoPruneSettings,
    dueAutoPruneTasks,
    executeDueAutoPruneTasks,
    imageCreatedOldEnough,
    imageIsUsed,
    isObsoleteSelfImage,
    isPruneDue,
    normalizeImageId,
    nextPruneRun,
    protectedImageIds,
    sameImageId,
    selfUpdateProtectedImages,
    shouldPruneTaggedImage,
} from "./auto-prune-manager";

const activeId = `sha256:${"a".repeat(64)}`;
const previousId = `sha256:${"b".repeat(64)}`;
const oldId = `sha256:${"c".repeat(64)}`;
const targetDigest = `sha256:${"d".repeat(64)}`;

test("normalise et rapproche un ID Docker tronqué de son SHA complet", () => {
    const shortId = activeId.slice("sha256:".length, "sha256:".length + 12);
    assert.equal(normalizeImageId(shortId), `sha256:${shortId}`);
    assert.equal(sameImageId(shortId, activeId), true);
    assert.equal(imageIsUsed(shortId, new Set([ activeId ])), true);
    assert.equal(imageIsUsed(oldId, new Set([ activeId ])), false);
});

test("le délai de grâce utilise la date ISO inspectée et refuse CreatedAt CET/CEST", () => {
    const now = Date.parse("2026-10-05T12:00:00.000Z");
    assert.equal(imageCreatedOldEnough("2026-10-01T10:00:00.000Z", 24, now), true);
    assert.equal(imageCreatedOldEnough("Sun Oct 04 2026 10:00:00 CEST", 24, now), false);
    assert.equal(imageCreatedOldEnough("Sun Oct 04 2026 10:00:00 CET", 24, now), false);
});

test("la purge devient due exactement à lastRun + intervalle", () => {
    const previous = "2026-09-29T01:00:22.813Z";
    assert.equal(isPruneDue(previous, 24, Date.parse("2026-09-30T01:00:00.000Z")), false);
    assert.equal(isPruneDue(previous, 24, Date.parse("2026-09-30T01:00:23.000Z")), true);
    assert.equal(isPruneDue(previous, 24, Date.parse("2026-09-29T23:59:00.000Z")), false);
    assert.equal(isPruneDue(previous, 48, Date.parse("2026-09-30T01:00:00.000Z")), false);
    assert.equal(isPruneDue(undefined, 24), true);
    assert.equal(nextPruneRun(previous, 24), "2026-09-30T01:00:22.813Z");
});

test("les échéances rattrapent une seule fois même après plusieurs intervalles", () => {
    const now = Date.parse("2026-10-05T12:00:00Z");
    const settings: AutoPruneSettings = {
        danglingEnabled: true,
        danglingIntervalHours: 24 as const,
        lastDanglingRun: new Date(now - 10 * 24 * 3_600_000).toISOString(),
        unusedEnabled: true,
        unusedIntervalHours: 48 as const,
        unusedExclusions: [],
        lastUnusedRun: new Date(now - 3_600_000).toISOString(),
    };
    assert.deepEqual(dueAutoPruneTasks(settings, now), [ "dangling" ]);
});

test("un heartbeat simulé après veille rattrape une fois, mais ne fait rien avant l'échéance", async () => {
    const lastRun = "2026-10-05T10:00:00.000Z";
    const settings = {
        danglingEnabled: true,
        danglingIntervalHours: 24 as const,
        lastDanglingRun: lastRun,
        unusedEnabled: false,
        unusedIntervalHours: 24 as const,
        unusedExclusions: [],
    };
    let calls = 0;
    await executeDueAutoPruneTasks(settings, Date.parse("2026-10-06T09:59:59.000Z"), undefined, async () => {
        calls++;
    });
    assert.equal(calls, 0);
    await executeDueAutoPruneTasks(settings, Date.parse("2026-10-08T10:00:00.000Z"), undefined, async () => {
        calls++;
    });
    assert.equal(calls, 1);
});

test("un heartbeat exécute dangling puis unused séquentiellement", async () => {
    const now = Date.parse("2026-10-05T12:00:00Z");
    const order: string[] = [];
    const result = await executeDueAutoPruneTasks({
        danglingEnabled: true,
        danglingIntervalHours: 24,
        unusedEnabled: true,
        unusedIntervalHours: 24,
        unusedExclusions: [],
    }, now, undefined, async task => {
        order.push(`start-${task}`);
        await Promise.resolve();
        order.push(`end-${task}`);
    });
    assert.deepEqual(order, [ "start-dangling", "end-dangling", "start-unused", "end-unused" ]);
    assert.deepEqual(result.executed, [ "dangling", "unused" ]);
});

test("un blocker reporte toutes les tâches sans les exécuter", async () => {
    let calls = 0;
    const settings: AutoPruneSettings = {
        danglingEnabled: true,
        danglingIntervalHours: 24 as const,
        unusedEnabled: true,
        unusedIntervalHours: 24 as const,
        unusedExclusions: [],
    };
    const blocked = await executeDueAutoPruneTasks(settings, Date.now(), "backup en cours", async () => {
        calls++;
    });
    assert.equal(calls, 0);
    assert.deepEqual(blocked.deferred, [ "dangling", "unused" ]);
    assert.equal(settings.lastDanglingRun, undefined);
    assert.equal(settings.lastUnusedRun, undefined);
    const retried = await executeDueAutoPruneTasks(settings, Date.now(), undefined, async () => {
        calls++;
    });
    assert.equal(calls, 2);
    assert.deepEqual(retried.executed, [ "dangling", "unused" ]);
});

test("la suspension du scheduler historique conserve ses réglages", () => {
    const manager = new AutoPruneManager();
    const before = manager.getSettings();
    manager.setSchedulingSuspended(true);
    const after = manager.getSettings();
    assert.equal(after.danglingEnabled, before.danglingEnabled);
    assert.equal(after.unusedEnabled, before.unusedEnabled);
    assert.deepEqual(after.unusedExclusions, before.unusedExclusions);
});

test("la purge des images avec tag respecte conteneurs, exclusions et rollbacks", () => {
    const image = {
        Repository: "ghcr.io/aerya/dockge-enhanced",
        Tag: "latest",
        ID: activeId,
    };
    assert.equal(shouldPruneTaggedImage(image, new Set([ activeId ]), []), false);
    assert.equal(shouldPruneTaggedImage(image, new Set(), [ "ghcr.io/aerya/dockge-enhanced:latest" ]), false);
    assert.equal(shouldPruneTaggedImage(image, new Set(), [ activeId ]), false);
    assert.equal(shouldPruneTaggedImage(image, new Set(), []), true);
    assert.equal(shouldPruneTaggedImage({
        ...image,
        Tag: "<none>",
    }, new Set(), []), false);
    assert.equal(shouldPruneTaggedImage({
        ...image,
        Repository: "dockge-rollback-test",
    }, new Set(), []), false);
});

test("les anciennes images Enhanced par digest attendent la validation du self-update", () => {
    const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), "dockge-prune-test-"));
    const now = Date.parse("2026-09-30T12:00:00Z");
    const status = {
        state: "succeeded",
        finishedAt: new Date(now - 49 * 3_600_000).toISOString(),
        targetImage: `ghcr.io/aerya/dockge-enhanced@${targetDigest}`,
    };
    try {
        fs.mkdirSync(path.join(stateDir, "recovery"));
        fs.writeFileSync(path.join(stateDir, "status.json"), JSON.stringify(status));
        fs.writeFileSync(path.join(stateDir, "recovery", `${"d".repeat(32)}.json`), JSON.stringify({ previousImageId: previousId }));

        const inspected = [{
            Id: activeId,
            RepoTags: [ "ghcr.io/aerya/dockge-enhanced:latest" ],
            RepoDigests: [ `ghcr.io/aerya/dockge-enhanced@${targetDigest}` ],
        }];
        const protectedIds = selfUpdateProtectedImages(new Set([ activeId ]), inspected, stateDir, now);
        assert.deepEqual(protectedIds, new Set([ activeId, previousId ]));
        const image = {
            Id: oldId,
            RepoTags: [],
            RepoDigests: [ `ghcr.io/aerya/dockge-enhanced@${"sha256:" + "e".repeat(64)}` ],
        };
        assert.equal(isObsoleteSelfImage(image, protectedIds!), true);
        assert.equal(isObsoleteSelfImage({
            ...image,
            Id: previousId,
        }, protectedIds!), false);
        assert.equal(isObsoleteSelfImage({
            ...image,
            RepoTags: [ "ghcr.io/aerya/dockge-enhanced:latest" ],
        }, protectedIds!), false);

        fs.writeFileSync(path.join(stateDir, "status.json"), JSON.stringify({
            ...status,
            finishedAt: new Date(now - 47 * 3_600_000).toISOString(),
        }));
        assert.equal(selfUpdateProtectedImages(new Set([ activeId ]), inspected, stateDir, now), null);
        fs.writeFileSync(path.join(stateDir, "status.json"), JSON.stringify({
            ...status,
            state: "updating",
        }));
        assert.equal(selfUpdateProtectedImages(new Set([ activeId ]), inspected, stateDir, now), null);
    } finally {
        fs.rmSync(stateDir, {
            recursive: true,
            force: true,
        });
    }
});

test("un digest de manifeste ne peut pas être confondu avec l'Image ID", () => {
    const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), "dockge-prune-digest-test-"));
    const now = Date.parse("2026-10-05T12:00:00Z");
    try {
        fs.mkdirSync(path.join(stateDir, "recovery"));
        fs.writeFileSync(path.join(stateDir, "status.json"), JSON.stringify({
            state: "succeeded",
            finishedAt: new Date(now - 49 * 3_600_000).toISOString(),
            targetImage: `ghcr.io/aerya/dockge-enhanced@${targetDigest}`,
        }));
        fs.writeFileSync(path.join(stateDir, "recovery", `${"f".repeat(32)}.json`), JSON.stringify({ previousImageId: previousId }));

        assert.equal(selfUpdateProtectedImages(new Set([ targetDigest ]), [{
            Id: targetDigest,
            RepoDigests: [ `ghcr.io/aerya/dockge-enhanced@${activeId}` ],
        }], stateDir, now), null);
    } finally {
        fs.rmSync(stateDir, { recursive: true,
            force: true });
    }
});

test("une image de rollback dangling reste protégée", () => {
    const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), "dockge-prune-rollback-test-"));
    try {
        fs.mkdirSync(path.join(stateDir, "recovery"));
        fs.writeFileSync(path.join(stateDir, "recovery", `${"1".repeat(32)}.json`), JSON.stringify({ previousImageId: previousId }));
        const protectedIds = protectedImageIds([{ Repository: "<none>",
            Tag: "<none>",
            ID: previousId }], new Set(), stateDir);
        assert.equal(imageIsUsed(previousId, protectedIds), true);

        const rollbackTagged = protectedImageIds([{ Repository: "dockge-rollback-20261005",
            Tag: "keep",
            ID: oldId }], new Set(), stateDir);
        assert.equal(imageIsUsed(oldId, rollbackTagged), true);
    } finally {
        fs.rmSync(stateDir, { recursive: true,
            force: true });
    }
});
