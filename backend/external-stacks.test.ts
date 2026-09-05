import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";
import { DiscoveredExternalStack, ExternalStackManager, isManagedComposeProject, isSafeExternalDataPath, selectAllowedMounts, selectManagedStackRoots } from "./external-stacks";
import { Stack } from "./stack";

async function fixture() {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "dockge-external-stacks-"));
    const allowed = path.join(root, "allowed");
    const stackDir = path.join(allowed, "demo");
    await fs.mkdir(stackDir, { recursive: true });
    const composeFile = path.join(stackDir, "compose.yaml");
    await fs.writeFile(composeFile, "services: {}\n");
    return { root, allowed, stackDir, composeFile, manager: new ExternalStackManager(path.join(root, "data"), path.join(root, "stacks"), [ allowed ]) };
}

function discovered(value: Awaited<ReturnType<typeof fixture>>, project = "demo", configFiles = [ value.composeFile ]): DiscoveredExternalStack {
    return {
        project,
        status: "running",
        composeFile: value.composeFile,
        configFiles,
        configFilesNeedingAccess: [],
        envFiles: [],
        envFilesNeedingAccess: [],
        workingDir: value.stackDir,
        envFile: path.join(value.stackDir, ".env"),
        envStatus: "absent",
        mounts: [],
        dataPaths: [],
        dataPathsNeedingAccess: [],
        autoAccessAllowed: true,
        pathStatus: "accessible",
        imported: false,
        importedName: null,
    };
}

function stubDiscovery(value: Awaited<ReturnType<typeof fixture>>, entry: DiscoveredExternalStack): void {
    value.manager.discover = async () => [ entry ];
}

test("importe une stack externe autorisée sans déplacer son Compose", async () => {
    const value = await fixture();
    try {
        stubDiscovery(value, discovered(value));
        const imported = await value.manager.import("external-demo", "demo", value.composeFile);
        assert.equal(imported.workingDir, value.stackDir);
        assert.equal(await fs.readFile(value.composeFile, "utf8"), "services: {}\n");
        assert.equal((await value.manager.get("external-demo"))?.composeFile, value.composeFile);
    } finally {
        await fs.rm(value.root, { recursive: true, force: true });
    }
});

test("refuse un chemin hors allowlist et les traversées", async () => {
    const value = await fixture();
    try {
        const outside = path.join(value.root, "outside");
        await fs.mkdir(outside);
        const compose = path.join(outside, "compose.yaml");
        await fs.writeFile(compose, "services: {}\n");
        const entry = discovered(value, "outside", [ compose ]);
        entry.composeFile = compose;
        entry.workingDir = outside;
        stubDiscovery(value, entry);
        await assert.rejects(value.manager.import("outside", "outside", compose), /allowed root/);

        entry.project = "demo";
        stubDiscovery(value, entry);
        await assert.rejects(value.manager.import("traversal", "demo", path.join(value.allowed, "..", "outside", "compose.yaml")), /allowed root/);
    } finally {
        await fs.rm(value.root, { recursive: true, force: true });
    }
});

test("une stack externe conserve son répertoire, son projet et sa chaîne multi-Compose", async () => {
    const value = await fixture();
    try {
        const prodFile = path.join(value.stackDir, "compose.prod.yaml");
        await fs.writeFile(prodFile, "services:\n  demo:\n    image: alpine:latest\n");
        stubDiscovery(value, discovered(value, "original-project", [ value.composeFile, prodFile ]));
        await value.manager.import("external-demo", "original-project", value.composeFile);
        const server = { stacksDir: path.join(value.root, "stacks"), externalStacks: value.manager, config: { dataDir: path.join(value.root, "data") } } as never;
        const stack = await Stack.getStack(server, "external-demo");
        assert.equal(stack.path, value.stackDir);
        assert.equal(stack.isExternal, true);
        assert.deepEqual(stack.getComposeOptions("ps"), [
            "compose", "--project-directory", value.stackDir, "--project-name", "original-project",
            "-f", value.composeFile,
            "-f", prodFile,
            "ps",
        ]);
    } finally {
        await fs.rm(value.root, { recursive: true, force: true });
    }
});


test("conserve les fichiers -f situés hors du project directory mais dans une racine autorisée", async () => {
    const value = await fixture();
    try {
        const sharedDir = path.join(value.allowed, "shared");
        await fs.mkdir(sharedDir);
        const override = path.join(sharedDir, "compose.shared.yml");
        await fs.writeFile(override, "services:\n  demo:\n    environment:\n      SHARED: yes\n");
        stubDiscovery(value, discovered(value, "original-project", [ value.composeFile, override ]));

        const imported = await value.manager.import("external-demo", "original-project", value.composeFile);
        assert.deepEqual(imported.configFiles, [ value.composeFile, override ]);
        const server = { stacksDir: path.join(value.root, "stacks"), externalStacks: value.manager, config: { dataDir: path.join(value.root, "data") } } as never;
        const stack = await Stack.getStack(server, "external-demo");
        assert.deepEqual(stack.getComposeOptions("config"), [
            "compose", "--project-directory", value.stackDir, "--project-name", "original-project",
            "-f", value.composeFile,
            "-f", override,
            "config",
        ]);
        await assert.rejects(value.manager.assertDeletableSourcePath(imported, value.stackDir), /config files outside its source directory/);
    } finally {
        await fs.rm(value.root, { recursive: true, force: true });
    }
});

test("l'édition d'une stack externe écrit son Compose/.env d'origine sans créer d'override implicite", async () => {
    const value = await fixture();
    try {
        const prodFile = path.join(value.stackDir, "compose.prod.yaml");
        const prodBefore = "services:\n  demo:\n    environment:\n      MODE: prod\n";
        await fs.writeFile(prodFile, prodBefore);
        stubDiscovery(value, discovered(value, "original-project", [ value.composeFile, prodFile ]));
        await value.manager.import("external-demo", "original-project", value.composeFile);

        const stacksDir = path.join(value.root, "stacks");
        const server = { stacksDir, externalStacks: value.manager, config: { dataDir: path.join(value.root, "data") } } as never;
        const stack = await Stack.getStack(server, "external-demo");
        stack.setComposeContent("services:\n  demo:\n    image: alpine:3.22\n", "MODE=prod\n", "services:\n  ignored: {}\n");
        await stack.save(false);

        assert.match(await fs.readFile(value.composeFile, "utf8"), /alpine:3\.22/);
        assert.equal(await fs.readFile(path.join(value.stackDir, ".env"), "utf8"), "MODE=prod\n");
        assert.equal(await fs.readFile(prodFile, "utf8"), prodBefore);
        await assert.rejects(fs.stat(path.join(value.stackDir, "compose.override.yaml")), /ENOENT/);
        await assert.rejects(fs.stat(path.join(stacksDir, "external-demo")), /ENOENT/);
    } finally {
        await fs.rm(value.root, { recursive: true, force: true });
    }
});

test("préserve un nom Compose arbitraire, le project directory et un --env-file explicite", async () => {
    const value = await fixture();
    try {
        const nested = path.join(value.stackDir, "config");
        await fs.mkdir(nested);
        const composeFile = path.join(nested, "stack.prod.yml");
        const envDir = path.join(value.allowed, "env");
        await fs.mkdir(envDir);
        const envFile = path.join(envDir, "demo.production.env");
        await fs.writeFile(composeFile, "services:\n  demo:\n    image: alpine:latest\n");
        await fs.writeFile(envFile, "MODE=production\n");
        const entry = discovered(value, "original-project", [ composeFile ]);
        entry.composeFile = composeFile;
        entry.envFiles = [ envFile ];
        entry.envFile = envFile;
        entry.envStatus = "present";
        stubDiscovery(value, entry);

        const imported = await value.manager.import("external-demo", "original-project", composeFile);
        assert.equal(imported.workingDir, value.stackDir);
        assert.deepEqual(imported.envFiles, [ envFile ]);

        const server = { stacksDir: path.join(value.root, "stacks"), externalStacks: value.manager, config: { dataDir: path.join(value.root, "data") } } as never;
        const stack = await Stack.getStack(server, "external-demo");
        assert.equal(stack.composeENV, "MODE=production\n");
        assert.deepEqual(stack.getComposeOptions("config"), [
            "compose", "--project-directory", value.stackDir, "--project-name", "original-project",
            "--env-file", envFile,
            "-f", composeFile,
            "config",
        ]);

        stack.setComposeContent("services:\n  demo:\n    image: alpine:3.22\n", "MODE=updated\n");
        await stack.save(false);
        assert.equal(await fs.readFile(envFile, "utf8"), "MODE=updated\n");
        await assert.rejects(fs.stat(path.join(value.stackDir, ".env")), /ENOENT/);
    } finally {
        await fs.rm(value.root, { recursive: true, force: true });
    }
});

test("stocke les métadonnées Enhanced hors du dossier source externe", async () => {
    const value = await fixture();
    try {
        stubDiscovery(value, discovered(value));
        await value.manager.import("external-demo", "demo", value.composeFile);
        const dataDir = path.join(value.root, "data");
        const server = { stacksDir: path.join(value.root, "stacks"), externalStacks: value.manager, config: { dataDir } } as never;
        const stack = await Stack.getStack(server, "external-demo");
        await stack.saveNote("note externe");
        await assert.rejects(fs.stat(path.join(value.stackDir, ".dockge-meta.json")), /ENOENT/);
        const metadata = JSON.parse(await fs.readFile(path.join(dataDir, "external-stack-meta", "external-demo.json"), "utf8"));
        assert.equal(metadata.note, "note externe");
    } finally {
        await fs.rm(value.root, { recursive: true, force: true });
    }
});

test("refuse de supprimer une source externe si le chemin confirmé ne correspond plus", async () => {
    const value = await fixture();
    try {
        stubDiscovery(value, discovered(value));
        const imported = await value.manager.import("external-demo", "demo", value.composeFile);
        await assert.rejects(value.manager.assertDeletableSourcePath(imported, path.join(value.allowed, "other")), /does not match/);
    } finally {
        await fs.rm(value.root, { recursive: true, force: true });
    }
});

test("filtre les chemins de données dangereux avant auto-autorisation", () => {
    assert.equal(isSafeExternalDataPath("/srv/apps/demo/data"), true);
    assert.equal(isSafeExternalDataPath("/var/lib/docker/volumes/demo/_data"), true);
    assert.equal(isSafeExternalDataPath("/etc/ssh"), false);
    assert.equal(isSafeExternalDataPath("/var/run/docker.sock"), false);
    assert.equal(isSafeExternalDataPath("/srv/apps/a,b"), false);
    assert.equal(isSafeExternalDataPath("relative/path"), false);
});

test("affiche uniquement les bind mounts qui couvrent les racines externes autorisées", () => {
    const mounts = selectAllowedMounts([
        { Type: "bind", Source: "/srv/apps", Destination: "/srv/apps" },
        { Type: "bind", Source: "/var/lib/dockge", Destination: "/app/data" },
        { Type: "volume", Name: "cache", Destination: "/cache" },
    ], [ "/srv/apps/radarr" ]);

    assert.deepEqual(mounts, [ { source: "/srv/apps", destination: "/srv/apps" } ]);
});


test("reconnaît le bind hôte du répertoire de stacks géré", () => {
    const roots = selectManagedStackRoots([
        { Type: "bind", Source: "/volume1/docker/dockge-enhanced/stacks", Destination: "/opt/stacks" },
        { Type: "bind", Source: "/volume1/docker", Destination: "/opt" },
    ], "/opt/stacks");

    assert.deepEqual(roots, [
        "/opt/stacks",
        "/volume1/docker/dockge-enhanced/stacks",
    ]);
    assert.equal(isManagedComposeProject(
        "/volume1/docker/dockge-enhanced/stacks/mealie",
        [ "/volume1/docker/dockge-enhanced/stacks/mealie/compose.yaml" ],
        roots,
    ), true);
    assert.equal(isManagedComposeProject(
        "/srv/external/mealie",
        [ "/srv/external/mealie/compose.yaml" ],
        roots,
    ), false);
});

test("mappe aussi un stacksDir imbriqué dans un bind parent", () => {
    const roots = selectManagedStackRoots([
        { Type: "bind", Source: "/home/aerya/docker/dockge-enhanced", Destination: "/opt/dockge" },
    ], "/opt/dockge/stacks");

    assert.deepEqual(roots, [
        "/home/aerya/docker/dockge-enhanced/stacks",
        "/opt/dockge/stacks",
    ]);
});
