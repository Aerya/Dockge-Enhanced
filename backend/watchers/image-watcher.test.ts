import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import {
  assertRegistryHost,
  buildManifestUrl,
  composeExecInvocation,
  isMandatoryManagedUpdate,
} from "./image-watcher";

test("construit Compose avec des arguments séparés", () => {
  const composePath = path.join("/opt/stacks", "demo", "compose file.yaml");
  assert.deepEqual(composeExecInvocation(composePath, [ "pull", "web;touch marker" ]), {
    cwd: path.join("/opt/stacks", "demo"),
    args: [ "compose", "-f", "compose file.yaml", "pull", "web;touch marker" ],
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
