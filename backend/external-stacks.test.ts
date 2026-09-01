import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";
import { ExternalStackManager, selectAllowedMounts } from "./external-stacks";
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

test("importe une stack externe autorisée sans déplacer son Compose", async () => {
    const value = await fixture();
    try {
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
        await assert.rejects(value.manager.import("outside", "outside", compose), /allowed root/);
        await assert.rejects(value.manager.import("traversal", "demo", path.join(value.allowed, "..", "outside", "compose.yaml")), /allowed root/);
    } finally {
        await fs.rm(value.root, { recursive: true, force: true });
    }
});

test("une stack externe conserve son répertoire et son projet Compose", async () => {
    const value = await fixture();
    try {
        await value.manager.import("external-demo", "original-project", value.composeFile);
        const server = { stacksDir: path.join(value.root, "stacks"), externalStacks: value.manager } as never;
        const stack = await Stack.getStack(server, "external-demo");
        assert.equal(stack.path, value.stackDir);
        assert.equal(stack.isExternal, true);
        assert.deepEqual(stack.getComposeOptions("ps"), [ "compose", "--project-name", "original-project", "ps" ]);
    } finally {
        await fs.rm(value.root, { recursive: true, force: true });
    }
});

test("affiche uniquement les bind mounts qui couvrent les racines externes autorisées", () => {
    const mounts = selectAllowedMounts([
        { Type: "bind", Source: "/srv/apps", Destination: "/srv/apps" },
        { Type: "bind", Source: "/var/lib/dockge", Destination: "/app/data" },
        { Type: "volume", Name: "cache", Destination: "/cache" },
    ], [ "/srv/apps/radarr" ]);

    assert.deepEqual(mounts, [ { source: "/srv/apps", destination: "/srv/apps" } ]);
});
