import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import os from "node:os";
import * as fs from "node:fs/promises";
import axios from "axios";
import {
    ImageWatcher,
    imageStatusStore,
    assertRegistryHost,
    buildImageUpdateComposePlan,
    hasRunningImageDrift,
    immediateUpdateKeys,
    IMMEDIATE_IMAGE_CHECK_CRON,
    reuseCyclePromise,
    registryRateLimitCooldownMs,
    buildManifestUrl,
    buildRollbackComposeRecreateArgs,
    composeExecInvocation,
    isMandatoryManagedUpdate,
    isManualBatchCandidate,
    isRetryableRegistryStatus,
    pendingAutomaticImageUpdateMayRun,
    registryRetryDelayMs,
    requestRegistryWithRetry,
    resolveAutomaticImageUpdateAction,
    extractWatchableImagesFromComposeModel,
    confirmedMissingImmediateTargets,
    imageCheckErrorMessage,
    isSelfUpdateBlockingImageMutations,
    isRetryableRegistryError,
    touchImageUpdatedStackMetadata,
    updateVerificationResult,
} from "./image-watcher";
import { beginSelfUpdatePreparation, endSelfUpdatePreparation } from "../self-update/operation-coordinator";
import { targetedComposeRecreateArgsForTargets } from "../compose-network-namespace";
import { resolveDataDir } from "../data-dir";

test("une mise à jour ImageWatcher actualise uniquement lastUpdated d'une stack native", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "dockge-image-meta-"));
    const stackDir = path.join(root, "native");
    await fs.mkdir(stackDir, { recursive: true });
    await fs.writeFile(path.join(stackDir, "compose.yaml"), "services: {}\n");
    const metaPath = path.join(stackDir, ".dockge-meta.json");
    const existing = {
        createdAt: "2026-01-01T00:00:00.000Z",
        lastStartedAt: "2026-01-02T00:00:00.000Z",
        note: "kept",
        displayName: "Friendly",
    };
    await fs.writeFile(metaPath, JSON.stringify(existing));

    await touchImageUpdatedStackMetadata(root, "native", {
        composePath: path.join(stackDir, "compose.yaml"),
        isExternal: false,
    }, "2026-10-10T10:00:00.000Z", root);

    assert.deepEqual(JSON.parse(await fs.readFile(metaPath, "utf8")), {
        ...existing,
        lastUpdated: "2026-10-10T10:00:00.000Z",
    });
    await fs.rm(root, { recursive: true,
        force: true });
});

test("une mise à jour ImageWatcher écrit les métadonnées privées d'une stack externe", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "dockge-image-external-meta-"));
    const composePath = path.join(root, "external-source", "compose.yaml");
    await fs.mkdir(path.dirname(composePath), { recursive: true });
    await fs.writeFile(composePath, "services: {}\n");

    await touchImageUpdatedStackMetadata(root, "external", { composePath,
        isExternal: true }, "2026-10-10T11:00:00.000Z");

    assert.deepEqual(JSON.parse(await fs.readFile(path.join(root, "external-stack-meta", "external.json"), "utf8")), {
        lastUpdated: "2026-10-10T11:00:00.000Z",
    });
    await fs.rm(root, { recursive: true,
        force: true });
});

test("les métadonnées externes refusent un nom de stack qui sortirait de leur répertoire", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "dockge-image-external-meta-"));
    await assert.rejects(
        touchImageUpdatedStackMetadata(root, "../outside", {
            composePath: path.join(root, "external-source", "compose.yaml"),
            isExternal: true,
        }),
        /Invalid stack metadata path/,
    );
    await fs.rm(root, { recursive: true,
        force: true });
});

test("l'historique ne remplace pas un digest local absent par un digest distant", () => {
    assert.deepEqual(updateVerificationResult({
        image: "fixture/image:latest",
        stack: "fixture",
        localDigest: "",
        remoteDigest: "sha256:remote",
        hasUpdate: false,
        lastChecked: "",
    }), {
        verification: "unverified",
        digest: "",
        error: "Mise à jour appliquée, mais aucun digest local comparable n'est disponible.",
    });
});

test("une erreur de contrôle après recréation reste distincte d'un échec Compose", () => {
    assert.deepEqual(updateVerificationResult({
        image: "fixture/image:latest",
        stack: "fixture",
        localDigest: "",
        remoteDigest: "",
        hasUpdate: false,
        lastChecked: "",
        error: "DNS unavailable",
    }), {
        verification: "unverified",
        digest: "",
        error: "Mise à jour appliquée, mais le digest exécuté n'a pas pu être vérifié : DNS unavailable",
    });
});

test("une image encore signalée obsolète après Compose est appliquée mais non vérifiée", () => {
    assert.deepEqual(updateVerificationResult({
        image: "fixture/image:latest",
        stack: "fixture",
        localDigest: "sha256:old",
        remoteDigest: "sha256:new",
        hasUpdate: true,
        lastChecked: "",
    }), {
        verification: "unverified",
        digest: "",
        error: "Mise à jour Compose terminée, mais l'image exécutée ne correspond pas encore au digest attendu.",
    });
});

test("#475 conserve les réglages ImageWatcher sans DOCKGE_DATA_DIR après recréation logique", async () => {
    const persistentDataDir = await fs.mkdtemp(path.join(os.tmpdir(), "dockge-image-settings-"));
    const resolved = resolveDataDir({
        standardDataDir: persistentDataDir,
        legacyDataDir: path.join(persistentDataDir, "missing-legacy"),
        exists: directory => directory === persistentDataDir,
        readDirectory: () => [],
    });
    const first = new ImageWatcher(resolved);
    first.restart = () => {};
    await first.saveSettings({ enabled: true,
        intervalHours: 1 }, false);

    const settingsPath = path.join(persistentDataDir, "watcher-settings.json");
    assert.deepEqual(JSON.parse(await fs.readFile(settingsPath, "utf8")), {
        ...first.settings,
        enabled: true,
        intervalHours: 1,
    });

    const recreated = new ImageWatcher(resolved);
    await recreated.loadSettings();
    assert.equal(recreated.settings.enabled, true);
    assert.equal(recreated.settings.intervalHours, 1);
    await fs.rm(persistentDataDir, { recursive: true,
        force: true });
});

test("un scan ImageWatcher lent ne bloque pas le self-update, contrairement à une recréation", async () => {
    const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "dockge-image-operation-"));
    const watcher = new ImageWatcher(dataDir);
    const internal = watcher as unknown as {
        _checkRunning: boolean;
        _updatingImages: Set<string>;
        manualBatch: { running: boolean;
            current: string | null };
    };
    internal._checkRunning = true;
    assert.equal(watcher.hasDockerOperationInProgress(), false);
    internal._updatingImages.add("stack::image");
    assert.equal(watcher.hasDockerOperationInProgress(), true);
    internal._updatingImages.clear();
    internal.manualBatch = { running: true,
        current: "stack::image" };
    assert.equal(watcher.hasDockerOperationInProgress(), true);
    await fs.rm(dataDir, { recursive: true,
        force: true });
});

test("une mise à jour d'image est reportée pendant la préparation ou l'exécution d'un self-update", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "dockge-self-update-image-lock-"));
    try {
        assert.equal(await isSelfUpdateBlockingImageMutations(root), false);

        assert.equal(beginSelfUpdatePreparation(), true);
        assert.equal(await isSelfUpdateBlockingImageMutations(root), true);
        endSelfUpdatePreparation();

        await fs.mkdir(path.join(root, "self-update"), { recursive: true });
        await fs.writeFile(path.join(root, "self-update", "status.json"), JSON.stringify({ state: "updating" }));
        assert.equal(await isSelfUpdateBlockingImageMutations(root), true);

        await fs.writeFile(path.join(root, "self-update", "status.json"), JSON.stringify({ state: "scheduled" }));
        assert.equal(await isSelfUpdateBlockingImageMutations(root), false);

        await fs.writeFile(path.join(root, "self-update", "status.json"), JSON.stringify({ state: "succeeded" }));
        assert.equal(await isSelfUpdateBlockingImageMutations(root), false);
    } finally {
        endSelfUpdatePreparation();
        await fs.rm(root, { recursive: true,
            force: true });
    }
});

const sharedNamespaceCompose = JSON.stringify({
    services: {
        provider: { image: "example/provider:latest",
            container_name: "provider-container" },
        browser: { image: "example/browser:latest",
            network_mode: "container:provider-container" },
        solver: { image: "example/solver:latest",
            network_mode: "service:provider" },
    },
});

/* eslint-disable @stylistic/indent -- this watcher test uses two-space indentation */
test("exclut du contrôle les services marqués dockge.imageupdates.check=false", () => {
  const model = {
    services: {
      included: { image: "example/shared:latest" },
      excluded: {
        image: "example/shared:latest",
        labels: { "dockge.imageupdates.check": "false" },
      },
      excludedList: {
        image: "example/other:latest",
        labels: [ "dockge.imageupdates.check=false", "custom=kept" ],
      },
    },
  };
  assert.deepEqual(extractWatchableImagesFromComposeModel(model), [ "example/shared:latest" ]);
  assert.deepEqual(buildImageUpdateComposePlan(JSON.stringify(model), "example/shared:latest").services, [ "included" ]);
  assert.throws(
    () => buildImageUpdateComposePlan(JSON.stringify(model), "example/other:latest"),
    /is not used by a service/,
  );
});

test("respecte les labels hérités par ancre YAML lors du repli", () => {
  assert.deepEqual(extractWatchableImagesFromComposeModel({
    services: {
      excluded: {
        "<<": { image: "example/inherited:latest",
labels: { "dockge.imageupdates.check": "false" } },
      },
      included: {
        "<<": { image: "example/inherited:latest",
labels: { "dockge.imageupdates.check": "false" } },
        labels: { "dockge.imageupdates.check": "true" },
      },
    },
  }), [ "example/inherited:latest" ]);
});

test("le lot manuel exclut l'auto-mise à jour et les images non applicables", () => {
  const status = {
    image: "nginx:latest",
    stack: "web",
    localDigest: "",
    remoteDigest: "",
    hasUpdate: true,
    lastChecked: "",
  };
  assert.equal(isManualBatchCandidate(status), true);
  assert.equal(isManualBatchCandidate({
    ...status,
    hasUpdate: false,
  }), false);
  assert.equal(isManualBatchCandidate({
    ...status,
    error: "registry unavailable",
  }), false);
  assert.equal(isManualBatchCandidate({
    ...status,
    image: "ghcr.io/aerya/dockge-enhanced:latest",
  }), false);
});

test("le lot manuel traite les images en série et s'arrête au premier échec", async () => {
  const watcher = ImageWatcher.getInstance();
  const originalUpdate = watcher.manualUpdate;
  const previous = new Map(imageStatusStore);
  const calls: string[] = [];
  const base = {
    localDigest: "",
    remoteDigest: "",
    hasUpdate: true,
    lastChecked: "",
  };
  imageStatusStore.clear();
  imageStatusStore.set("a::one:latest", {
    ...base,
    stack: "a",
    image: "one:latest",
  });
  imageStatusStore.set("b::two:latest", {
    ...base,
    stack: "b",
    image: "two:latest",
  });
  imageStatusStore.set("c::three:latest", {
    ...base,
    stack: "c",
    image: "three:latest",
  });
  watcher.manualUpdate = async (key, respectPaused) => {
    assert.equal(respectPaused, true);
    calls.push(key);
    return key !== "b::two:latest";
  };
  try {
    assert.equal(watcher.startManualUpdateBatch().total, 3);
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(calls, [ "a::one:latest", "b::two:latest" ]);
    assert.deepEqual(watcher.getManualUpdateBatch().batch, {
      running: false,
      total: 3,
      completed: 1,
      current: null,
      error: "Update failed, stack paused, or already in progress: b::two:latest",
    });
  } finally {
    watcher.manualUpdate = originalUpdate;
    imageStatusStore.clear();
    for (const [ key, status ] of previous) {
      imageStatusStore.set(key, status);
    }
  }
});
/* eslint-enable @stylistic/indent */

test("construit Compose avec des arguments séparés", () => {
    const composePath = path.join("/opt/stacks", "demo", "compose file.yaml");
    assert.deepEqual(composeExecInvocation(composePath, [ "pull", "web;touch marker" ]), {
        cwd: path.join("/opt/stacks", "demo"),
        args: [ "compose", "-f", "compose file.yaml", "pull", "web;touch marker" ],
    });
});

test("conserve tous les fichiers et le nom de projet d’une stack externe multi-Compose", () => {
    const composePath = "/srv/demo/compose.yaml";
    assert.deepEqual(composeExecInvocation(composePath, [ "config", "--images" ], "original-project", [
        "/srv/demo/compose.yaml",
        "/srv/demo/compose.prod.yaml",
    ], "/srv/demo", [ "/srv/secrets/demo.env" ]), {
        cwd: "/srv/demo",
        args: [
            "compose", "--project-directory", "/srv/demo", "--project-name", "original-project",
            "--env-file", "/srv/secrets/demo.env",
            "-f", "compose.yaml", "-f", "compose.prod.yaml", "config", "--images",
        ],
    });
});

test("construit uniquement des URLs de manifest registry valides", () => {
    assert.equal(
        buildManifestUrl("ghcr.io", "aerya/dockge-enhanced", "latest"),
        "https://ghcr.io/v2/aerya/dockge-enhanced/manifests/latest",
    );
    assert.equal(assertRegistryHost("registry.local:5000"), "registry.local:5000");
    assert.throws(() => buildManifestUrl("registry.example/path", "team/app", "latest"), /registry invalide/);
    assert.throws(() => buildManifestUrl("registry.example", "team/../app", "latest"), /Nom d’image invalide/);
    assert.throws(() => buildManifestUrl("registry.example", "team/app", "latest?url=http://127.0.0.1"), /Tag d’image invalide/);
});

test("met toujours à jour le Dozzle géré par Enhanced", () => {
    assert.equal(isMandatoryManagedUpdate({
        stack: "dozzle-dockge-enhanced",
        image: "amir20/dozzle:latest",
    }), true);
    assert.equal(isMandatoryManagedUpdate({
        stack: "mon-dozzle",
        image: "amir20/dozzle:latest",
    }), false);
});

test("le créneau global met toutes les mises à jour automatiques en attente", () => {
    const window = { start: "03:00",
        end: "05:00",
        days: [ 1 ] };

    assert.equal(resolveAutomaticImageUpdateAction({ mode: "immediate" }, false, window, false), "pending");
    assert.equal(resolveAutomaticImageUpdateAction({ mode: "scheduled",
        time: "02:00" }, false, window, false), "pending");
    assert.equal(resolveAutomaticImageUpdateAction(undefined, true, window, false), "pending");
    assert.equal(resolveAutomaticImageUpdateAction(undefined, false, window, false), null);
});

test("le créneau global applique les mises à jour en mode planifié", () => {
    const window = { start: "03:00",
        end: "05:00",
        days: [ 1 ] };

    assert.equal(resolveAutomaticImageUpdateAction({ mode: "immediate" }, false, window, true), "scheduled");
    assert.equal(resolveAutomaticImageUpdateAction({ mode: "scheduled",
        time: "02:00" }, false, window, true), "scheduled");
    assert.equal(resolveAutomaticImageUpdateAction(undefined, true, window, true), "scheduled");
    assert.equal(resolveAutomaticImageUpdateAction({ mode: "immediate" }, false, window, true, true), null);
});

test("les mises à jour en attente reprennent correctement si le créneau global est retiré", () => {
    assert.equal(pendingAutomaticImageUpdateMayRun({ mode: "immediate" }, false, null, true, "06:00"), true);
    assert.equal(pendingAutomaticImageUpdateMayRun({ mode: "scheduled",
        time: "02:00" }, false, null, true, "01:59"), false);
    assert.equal(pendingAutomaticImageUpdateMayRun({ mode: "scheduled",
        time: "02:00" }, false, null, true, "02:00"), true);
    assert.equal(pendingAutomaticImageUpdateMayRun(undefined, true, null, true, "06:00"), true);
});

test("automatic image updates recreate namespace consumers with the provider", () => {
    assert.deepEqual(buildImageUpdateComposePlan(sharedNamespaceCompose, "example/provider:latest"), {
        services: [ "provider" ],
        recreateArgs: [ "up", "-d", "--force-recreate", "--no-deps", "provider", "browser", "solver" ],
    });
});

test("manual image updates use the same namespace-safe recreate plan", () => {
    assert.deepEqual(
        targetedComposeRecreateArgsForTargets([ "provider", "browser", "solver" ]),
        [ "up", "-d", "--force-recreate", "--no-deps", "provider", "browser", "solver" ],
    );
});

test("image rollback recreates namespace consumers with the restored provider", () => {
    assert.deepEqual(
        buildRollbackComposeRecreateArgs(sharedNamespaceCompose, [ "provider" ]),
        [ "up", "-d", "--force-recreate", "--no-deps", "provider", "browser", "solver" ],
    );
});

test("image updates fail explicitly before recreation when Compose config is unreadable", () => {
    assert.throws(
        () => buildImageUpdateComposePlan("invalid", "example/provider:latest"),
        /Unable to resolve Compose network namespace dependencies/,
    );
});

test("registry rate limits and transient unavailability are retryable", () => {
    assert.equal(isRetryableRegistryStatus(429), true);
    assert.equal(isRetryableRegistryStatus(503), true);
    assert.equal(isRetryableRegistryStatus(401), false);
    assert.equal(isRetryableRegistryStatus(404), false);
    assert.equal(isRetryableRegistryStatus(200), false);
});

test("retries a manifest timeout once without treating authentication failures as transient", () => {
    assert.equal(isRetryableRegistryError(new axios.AxiosError("timeout of 15000ms exceeded", "ECONNABORTED")), true);
    assert.equal(isRetryableRegistryError(new axios.AxiosError("unauthorized", undefined, undefined, undefined, {
        status: 401,
        statusText: "Unauthorized",
        headers: {},
        config: {} as never,
        data: {},
    })), false);
});

test("explains 401 errors without exposing configured credentials", () => {
    const error = new axios.AxiosError("Request failed with status code 401", undefined, undefined, undefined, {
        status: 401,
        statusText: "Unauthorized",
        headers: {},
        config: {} as never,
        data: {},
    });
    const message = imageCheckErrorMessage("ghcr.io/example/private:latest", error);
    assert.match(message, /ghcr\.io/);
    assert.match(message, /ghcr\.io\/example\/private:latest/);
    assert.match(message, /identifiants configurés/);
    assert.doesNotMatch(message, /token|password|secret/i);
});

test("removes only confirmed missing immediate targets", () => {
    const entries = {
        "removed-stack::nginx:latest": { mode: "immediate" as const },
        "temporary-unavailable::nginx:latest": { mode: "immediate" as const },
        "existing::removed:latest": { mode: "immediate" as const },
        "existing::kept:latest": { mode: "immediate" as const },
        "scheduled::old:latest": { mode: "scheduled" as const },
        "malformed::": { mode: "immediate" as const },
    };
    const stale = confirmedMissingImmediateTargets(entries, new Map([
        [ "removed-stack", { images: new Set<string>() } ],
        [ "temporary-unavailable", {} ],
        [ "existing", { images: new Set([ "kept:latest" ]) } ],
        [ "scheduled", { images: new Set<string>() } ],
    ]));
    assert.deepEqual(stale.sort(), [ "existing::removed:latest", "removed-stack::nginx:latest" ]);
});

test("Retry-After in seconds or milliseconds-style numbers is honored", () => {
    assert.equal(registryRetryDelayMs("2", 1), 2000);
    assert.equal(registryRetryDelayMs("1.5", 1), 1500);
    assert.equal(registryRetryDelayMs(3, 2), 3000);
});

test("Retry-After as an HTTP date is honored", () => {
    const future = new Date(Date.now() + 5000).toUTCString();
    const delay = registryRetryDelayMs(future, 1);
    assert.ok(delay > 3000 && delay <= 5000, `unexpected delay: ${delay}`);
});

test("without a usable Retry-After, the backoff stays exponential", () => {
    assert.equal(registryRetryDelayMs(undefined, 1), 1000);
    assert.equal(registryRetryDelayMs("", 2), 2000);
    assert.equal(registryRetryDelayMs("n/a", 3), 4000);
    assert.equal(registryRetryDelayMs("-5", 1), 1000);
});

test("the retry delay is always capped", () => {
    assert.equal(registryRetryDelayMs("3600", 1), 20000);
    assert.equal(registryRetryDelayMs(undefined, 8, 5000), 5000);
});

test("a manifest request is retried after real 429 and 503 failures", async () => {
    const responses = [
        {
            status: 429,
            retryAfter: "0.001",
        },
        {
            status: 503,
            retryAfter: "0.002",
        },
    ];
    const delays: number[] = [];
    const warnings: string[] = [];
    let attempts = 0;

    const result = await requestRegistryWithRetry(async () => {
        attempts += 1;
        const response = responses.shift();
        if (!response) {
            return "manifest";
        }
        throw Object.assign(new Error(`HTTP ${response.status}`), {
            isAxiosError: true,
            response: {
                status: response.status,
                headers: {
                    "retry-after": response.retryAfter,
                },
            },
        });
    }, {
        label: "registry.example/team/image:latest",
        wait: async delay => {
            delays.push(delay);
        },
        warn: message => {
            warnings.push(message);
        },
    });

    assert.equal(result, "manifest");
    assert.equal(attempts, 3);
    assert.deepEqual(delays, [ 1, 2 ]);
    assert.match(warnings[0], /HTTP 429, reprise 2\/3/);
    assert.match(warnings[1], /HTTP 503, reprise 3\/3/);
});

test("une stack partageant :latest garde une mise à jour si son conteneur utilise l'ancien ID", () => {
    const newest = `sha256:${"a".repeat(64)}`;
    const previous = `sha256:${"b".repeat(64)}`;
    // Deux services sur le même hôte et le même tag après MàJ du premier.
    assert.equal(hasRunningImageDrift(newest, [ newest ]), false);
    assert.equal(hasRunningImageDrift(newest, [ previous ]), true);
    assert.equal(hasRunningImageDrift(newest, [ newest, previous ]), true);
    assert.equal(hasRunningImageDrift(newest, []), false);
    assert.equal(hasRunningImageDrift("", [ previous ]), false);
    assert.equal(hasRunningImageDrift(newest, [ "not-a-digest" ]), false);
});

test("seules les images configurées en immédiat participent aux contrôles ciblés", () => {
    const entries = {
        "hub::ghcr.io/aerya/powerwatch:latest": { mode: "immediate" as const },
        "web::nginx:latest": { mode: "scheduled" as const,
            time: "04:00" },
        "db::postgres:latest": { mode: "ignored" as const },
        "powerwatch::ghcr.io/aerya/powerwatch:latest": { mode: "immediate" as const },
    };
    assert.deepEqual(immediateUpdateKeys(entries), [
        "hub::ghcr.io/aerya/powerwatch:latest",
        "powerwatch::ghcr.io/aerya/powerwatch:latest",
    ]);
});

test("la politique immédiate vérifie les tags toutes les cinq minutes", () => {
    assert.equal(IMMEDIATE_IMAGE_CHECK_CRON, "*/5 * * * *");
});

test("un même manifest distant est demandé une fois par cycle et plateforme", async () => {
    const cache = new Map<string, Promise<string>>();
    let requests = 0;
    const load = async () => {
        requests += 1;
        return "sha256:new";
    };
    const first = reuseCyclePromise(cache, "ghcr.io/aerya/powerwatch:latest|linux/amd64", load);
    const second = reuseCyclePromise(cache, "ghcr.io/aerya/powerwatch:latest|linux/amd64", load);
    assert.equal(await first, "sha256:new");
    assert.equal(await second, "sha256:new");
    assert.equal(requests, 1);
    await reuseCyclePromise(cache, "ghcr.io/aerya/powerwatch:latest|linux/arm64", load);
    assert.equal(requests, 2);
    const freshCycle = new Map<string, Promise<string>>();
    await reuseCyclePromise(freshCycle, "ghcr.io/aerya/powerwatch:latest|linux/amd64", load);
    assert.equal(requests, 3);
});

test("HTTP 429 suspend la surveillance ciblée selon Retry-After sans toucher aux autres erreurs", () => {
    assert.equal(registryRateLimitCooldownMs(200, null), 0);
    assert.equal(registryRateLimitCooldownMs(503, null), 0);
    assert.equal(registryRateLimitCooldownMs(429, null), 600_000);
    assert.equal(registryRateLimitCooldownMs(429, "900"), 900_000);
});
