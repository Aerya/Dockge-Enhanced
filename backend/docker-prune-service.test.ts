import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import {
    automaticCandidateAllowed,
    CleanupExecutionLock,
    dockerCleanupDue,
    imagePruneSucceeded,
    pruneableContainer,
    pruneableNetwork,
    shouldNotifyCleanupDeferral,
    summarizeImagePruneResults,
    validateVolumeAutomationSettings,
    withCleanupExecutionLock,
} from "./docker-prune-service";
import { dockerDaemonAvailable } from "./docker-operation-state";

test("keeps active containers and proposes only stopped states", () => {
    assert.equal(pruneableContainer({ State: "running" }), false);
    assert.equal(pruneableContainer({ State: "paused" }), false);
    assert.equal(pruneableContainer({ State: "exited" }), true);
    assert.equal(pruneableContainer({ State: "created" }), true);
});

test("une erreur de suppression d'image rend le nettoyage incomplet", () => {
    assert.equal(imagePruneSucceeded({ errors: [] }, { errors: [] }), true);
    assert.equal(imagePruneSucceeded({ errors: [ "image protégée" ] }, { errors: [] }), false);
    const outcome = summarizeImagePruneResults(
        { summary: "0 image supprimée",
            errors: [ "sha256:deadbeef: suppression refusée" ] },
        { summary: "1 image supprimée",
            errors: [] },
    );
    assert.equal(outcome.success, false);
    assert.match(outcome.message, /suppression refusée/);
});

test("le backend refuse les volumes sans confirmation explicite", () => {
    assert.throws(() => validateVolumeAutomationSettings({
        enabled: false,
        categories: { images: true,
            networks: false,
            volumes: true,
            buildCache: false },
        volumeAutomationConfirmed: false,
    }), /confirmation renforcée/);
    assert.doesNotThrow(() => validateVolumeAutomationSettings({
        enabled: true,
        categories: { images: true,
            networks: false,
            volumes: true,
            buildCache: false },
        volumeAutomationConfirmed: true,
    }));
});

test("les protections et exclusions retirent réellement un élément des candidats automatiques", () => {
    const now = Date.parse("2026-10-05T12:00:00.000Z");
    const candidate = {
        id: "resource-id",
        name: "resource-name",
        createdAt: "2026-10-01T12:00:00.000Z",
    };
    assert.equal(automaticCandidateAllowed(candidate, [], 24, now), true);
    assert.equal(automaticCandidateAllowed({ ...candidate,
        protected: true }, [], 24, now), false);
    assert.equal(automaticCandidateAllowed({ ...candidate,
        excluded: true }, [], 24, now), false);
    assert.equal(automaticCandidateAllowed(candidate, [ "resource-name" ], 24, now), false);
    assert.equal(automaticCandidateAllowed(candidate, [ "resource-id" ], 24, now), false);
});

test("deux nettoyages ne peuvent pas acquérir le verrou simultanément", () => {
    const lock = new CleanupExecutionLock();
    assert.equal(lock.tryAcquire(), true);
    assert.equal(lock.tryAcquire(), false);
    lock.release();
    assert.equal(lock.tryAcquire(), true);
    lock.release();
});

test("le verrou partagé rejette une seconde exécution concurrente", async () => {
    let releaseFirst: (() => void) | undefined;
    const gate = new Promise<void>(resolve => {
        releaseFirst = resolve;
    });
    const first = withCleanupExecutionLock(async () => gate);
    await assert.rejects(
        withCleanupExecutionLock(async () => undefined),
        /déjà en cours/,
    );
    releaseFirst?.();
    await first;
});

test("l'ancienne route de purge ne peut plus appeler docker image prune -a", () => {
    const source = fs.readFileSync(path.join(process.cwd(), "backend/routers/docker-resources-router.ts"), "utf8");
    assert.doesNotMatch(source, /dockerArgs\(\[\s*["']image["'],\s*["']prune["'],\s*["']-a["']/);
    assert.match(source, /router\.post\("\/images\/prune-unused"[\s\S]*runDanglingPrune\(false[\s\S]*runUnusedPrune\(false/);
    assert.match(source, /router\.delete\("\/images\/:imageId"[\s\S]*removeImageSafely\(id, force\)/);
});

test("toutes les suppressions d'images du moteur revalident la protection juste avant rmi", () => {
    const source = fs.readFileSync(path.join(process.cwd(), "backend/watchers/auto-prune-manager.ts"), "utf8");
    assert.match(source, /async removeImageSafely[\s\S]*assertImageRemovalAllowed\(target\)[\s\S]*execFileAsync\("docker", \[ "rmi"/);
    assert.equal((source.match(/execFileAsync\("docker", \[ "rmi"/g) ?? []).length, 1);
    assert.match(source, /runDanglingPrune[\s\S]*removeImageSafely\(id\)/);
    assert.match(source, /runUnusedPrune[\s\S]*removeImageSafely\(nameTag\)/);
});

test("le preview demande les Image IDs complets", () => {
    const source = fs.readFileSync(path.join(process.cwd(), "backend/docker-image-inventory.ts"), "utf8");
    assert.match(source, /"images", "-a", "--no-trunc"/);
});

test("le nettoyage unifié rattrape une échéance manquée sans boucle", () => {
    const now = Date.parse("2026-10-05T12:00:00Z");
    assert.equal(dockerCleanupDue(new Date(now - 25 * 3_600_000).toISOString(), 24, now), true);
    assert.equal(dockerCleanupDue(new Date(now - 7 * 24 * 3_600_000).toISOString(), 24, now), true);
    assert.equal(dockerCleanupDue(new Date(now - 23 * 3_600_000).toISOString(), 24, now), false);
});

test("les notifications de report sont limitées sauf changement de raison", () => {
    const now = Date.parse("2026-10-05T12:00:00.000Z");
    assert.equal(shouldNotifyCleanupDeferral(undefined, undefined, "backup en cours", now), true);
    assert.equal(shouldNotifyCleanupDeferral("backup en cours", "2026-10-05T11:30:00.000Z", "backup en cours", now), false);
    assert.equal(shouldNotifyCleanupDeferral("backup en cours", "2026-10-05T10:59:59.000Z", "backup en cours", now), true);
    assert.equal(shouldNotifyCleanupDeferral("backup en cours", "2026-10-05T11:55:00.000Z", "scan Trivy en cours", now), true);
});

test("le cache de build respecte toujours le délai de grâce", () => {
    const source = fs.readFileSync(path.join(process.cwd(), "backend/docker-prune-service.ts"), "utf8");
    assert.doesNotMatch(source, /buildCache:\s*\[\s*"builder",\s*"prune",\s*"-a",\s*"-f"\s*\]/);
    assert.match(source, /"builder", "prune", "-a", "-f", "--filter", `until=\$\{settings\.graceHours\}h`/);
});

test("le contrôle initial attend que le daemon Docker soit disponible", async () => {
    assert.equal(await dockerDaemonAvailable(async () => undefined), true);
    assert.equal(await dockerDaemonAvailable(async () => {
        throw new Error("daemon indisponible");
    }), false);
});

test("protects system, swarm, ingress and connected networks", () => {
    assert.equal(pruneableNetwork({
        Name: "bridge",
        Containers: {},
    }), false);
    assert.equal(pruneableNetwork({
        Name: "custom",
        Scope: "swarm",
        Containers: {},
    }), false);
    assert.equal(pruneableNetwork({
        Name: "custom",
        Ingress: true,
        Containers: {},
    }), false);
    assert.equal(pruneableNetwork({
        Name: "custom",
        Containers: { abc: {} },
    }), false);
    assert.equal(pruneableNetwork({
        Name: "custom",
        Scope: "local",
        Containers: {},
    }), true);
});
