import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import os from "node:os";
import { promises as fs } from "node:fs";
import { ExternalStackManager } from "../external-stacks";
import {
    assertRegistryHost,
    buildManifestUrl,
    collectWatchedComposeStacks,
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

test("préserve le project name Compose d'une stack externe", () => {
    const composePath = path.join("/opt/external", "demo", "compose.yaml");
    assert.deepEqual(composeExecInvocation(composePath, [ "up", "-d" ], "production-demo"), {
        cwd: path.join("/opt/external", "demo"),
        args: [ "compose", "--project-name", "production-demo", "-f", "compose.yaml", "up", "-d" ],
    });
});

test("ajoute les stacks externes enregistrées à la surveillance des images", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "dockge-image-watcher-external-"));
    try {
        const stacksDir = path.join(root, "stacks");
        const externalDir = path.join(root, "external", "radarr");
        const dataDir = path.join(root, "data");
        await fs.mkdir(path.join(stacksDir, "managed"), { recursive: true });
        await fs.mkdir(externalDir, { recursive: true });
        await fs.writeFile(path.join(stacksDir, "managed", "compose.yaml"), "services: {}\n");
        const externalCompose = path.join(externalDir, "compose.yaml");
        await fs.writeFile(externalCompose, "services: {}\n");
        const manager = new ExternalStackManager(dataDir, stacksDir, [ path.join(root, "external") ]);
        await manager.import("external-radarr", "radarr-production", externalCompose);

        const watched = await collectWatchedComposeStacks(stacksDir, manager);
        assert.deepEqual(watched.get("managed"), { composePath: path.join(stacksDir, "managed", "compose.yaml") });
        assert.deepEqual(watched.get("external-radarr"), { composePath: externalCompose,
            project: "radarr-production" });
    } finally {
        await fs.rm(root, { recursive: true,
            force: true });
    }
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
