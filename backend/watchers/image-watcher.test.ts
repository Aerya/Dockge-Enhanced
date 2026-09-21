import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import {
  assertRegistryHost,
  buildImageUpdateComposePlan,
  buildManifestUrl,
  buildRollbackComposeRecreateArgs,
  composeExecInvocation,
  isMandatoryManagedUpdate,
  isRetryableRegistryStatus,
  pendingAutomaticImageUpdateMayRun,
  registryRetryDelayMs,
  resolveAutomaticImageUpdateAction,
} from "./image-watcher";
import { targetedComposeRecreateArgsForTargets } from "../compose-network-namespace";

const sharedNamespaceCompose = JSON.stringify({
  services: {
    provider: { image: "example/provider:latest", container_name: "provider-container" },
    browser: { image: "example/browser:latest", network_mode: "container:provider-container" },
    solver: { image: "example/solver:latest", network_mode: "service:provider" },
  },
});

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
  const window = { start: "03:00", end: "05:00", days: [ 1 ] };

  assert.equal(resolveAutomaticImageUpdateAction({ mode: "immediate" }, false, window, false), "pending");
  assert.equal(resolveAutomaticImageUpdateAction({ mode: "scheduled", time: "02:00" }, false, window, false), "pending");
  assert.equal(resolveAutomaticImageUpdateAction(undefined, true, window, false), "pending");
  assert.equal(resolveAutomaticImageUpdateAction(undefined, false, window, false), null);
});

test("le créneau global applique les mises à jour en mode planifié", () => {
  const window = { start: "03:00", end: "05:00", days: [ 1 ] };

  assert.equal(resolveAutomaticImageUpdateAction({ mode: "immediate" }, false, window, true), "scheduled");
  assert.equal(resolveAutomaticImageUpdateAction({ mode: "scheduled", time: "02:00" }, false, window, true), "scheduled");
  assert.equal(resolveAutomaticImageUpdateAction(undefined, true, window, true), "scheduled");
  assert.equal(resolveAutomaticImageUpdateAction({ mode: "immediate" }, false, window, true, true), null);
});

test("les mises à jour en attente reprennent correctement si le créneau global est retiré", () => {
  assert.equal(pendingAutomaticImageUpdateMayRun({ mode: "immediate" }, false, null, true, "06:00"), true);
  assert.equal(pendingAutomaticImageUpdateMayRun({ mode: "scheduled", time: "02:00" }, false, null, true, "01:59"), false);
  assert.equal(pendingAutomaticImageUpdateMayRun({ mode: "scheduled", time: "02:00" }, false, null, true, "02:00"), true);
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
