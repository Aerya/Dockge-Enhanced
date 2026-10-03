import assert from "node:assert/strict";
import test from "node:test";
import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";
import { Stack } from "./stack";
import type { DockgeServer } from "./dockge-server";

test("a displayed name leaves the Compose identity and Restic stack path unchanged", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "dockge-stack-alias-"));
    try {
        const stacksDir = path.join(root, "stacks");
        const stackDir = path.join(stacksDir, "technical-stack");
        await fs.mkdir(stackDir, { recursive: true });
        await fs.writeFile(path.join(stackDir, "compose.yaml"), "services:\n  demo:\n    image: busybox:stable\n");
        const server = {
            stacksDir,
            config: { dataDir: path.join(root, "data") },
        } as DockgeServer;
        const stack = new Stack(server, "technical-stack");
        const composeOptions = stack.getComposeOptions("ps");

        await stack.saveNote("Keep this note");
        assert.equal(await stack.saveDisplayName("  My media stack  "), "My media stack");
        const metadataPath = path.join(stackDir, ".dockge-meta.json");
        const snapshot = await fs.readFile(metadataPath, "utf8");
        assert.equal(JSON.parse(snapshot).note, "Keep this note");
        assert.equal(JSON.parse(snapshot).displayName, "My media stack");
        assert.equal(stack.name, "technical-stack");
        assert.equal(stack.path, stackDir);
        assert.deepEqual(stack.getComposeOptions("ps"), composeOptions);
        assert.deepEqual(await fs.readdir(stacksDir), [ "technical-stack" ]);
        assert.equal((new Stack(server, "technical-stack").toSimpleJSON("") as { displayName: string }).displayName, "My media stack");

        await stack.saveDisplayName("");
        assert.equal((stack.toSimpleJSON("") as { displayName: string }).displayName, "");
        // Restic restores the same metadata file under the unchanged technical stack path.
        await fs.writeFile(metadataPath, snapshot);
        assert.equal((new Stack(server, "technical-stack").toSimpleJSON("") as { displayName: string }).displayName, "My media stack");
        assert.equal(stack.name, "technical-stack");
    } finally {
        await fs.rm(root, {
            recursive: true,
            force: true,
        });
    }
});

test("an external stack alias does not change its Compose project or registration", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "dockge-external-alias-"));
    try {
        const externalDir = path.join(root, "external");
        await fs.mkdir(externalDir);
        const server = {
            stacksDir: path.join(root, "stacks"),
            config: { dataDir: path.join(root, "data") },
        } as DockgeServer;
        const stack = new Stack(server, "external-stack", "services: {}", "", true, "", externalDir, "original-project");
        const composeOptions = stack.getComposeOptions("ps");
        await stack.saveDisplayName("Friendly external");
        assert.equal(stack.name, "external-stack");
        assert.equal(stack.path, externalDir);
        assert.deepEqual(stack.getComposeOptions("ps"), composeOptions);
        assert.equal((stack.toSimpleJSON("") as { displayName: string }).displayName, "Friendly external");
        assert.equal(JSON.parse(await fs.readFile(path.join(root, "data", "external-stack-meta", "external-stack.json"), "utf8")).displayName, "Friendly external");
    } finally {
        await fs.rm(root, {
            recursive: true,
            force: true,
        });
    }
});

test("displayed names reject control characters and excessive length", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "dockge-alias-invalid-"));
    try {
        const server = {
            stacksDir: root,
            config: { dataDir: root },
        } as DockgeServer;
        const stack = new Stack(server, "technical-stack", undefined, undefined, true);
        await assert.rejects(stack.saveDisplayName("line\nbreak"));
        await assert.rejects(stack.saveDisplayName("x".repeat(81)));
        await assert.rejects(stack.saveDisplayName(123));
    } finally {
        await fs.rm(root, {
            recursive: true,
            force: true,
        });
    }
});
