// Explicit opt-in: creates three disposable Compose stacks through Enhanced's Stack API.
// No volumes, published ports, image builds or global cleanup.
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { Stack } from "../backend/stack";
import type { DockgeServer } from "../backend/dockge-server";
import type { DockgeSocket } from "../backend/util-server";
import { networkRestartDocker, readNetworkRestartContainers } from "../backend/network-restart";
import { previewNetworkRestart, restartNetworkDependents } from "../backend/network-restart-manager";

if (process.env.DOCKGE_NETWORK_RESTART_TEST !== "1") {
    throw new Error("Explicit DOCKGE_NETWORK_RESTART_TEST=1 required");
}
await networkRestartDocker([ "image", "inspect", "--format", "{{.Id}}", "busybox:stable" ]);
const root = await mkdtemp(join(tmpdir(), "enhanced-network-test-"));
const prefix = "enhanced-net-" + randomBytes(5).toString("hex");
const stacksDir = join(root, "stacks");
await mkdir(stacksDir);
const server = { stacksDir,
    config: { dataDir: join(root, "data") },
    externalStacks: { list: async () => [],
        get: async () => null } } as unknown as DockgeServer;
const socket = { id: prefix,
    endpoint: "",
    connected: true,
    emitAgent: () => {} } as unknown as DockgeSocket;
const stacks: Stack[] = [];
let clean = true;
try {
    const before = await readNetworkRestartContainers();
    for (const [ suffix, parent ] of [[ "vpn", "" ], [ "app", "vpn" ], [ "child", "app" ], [ "off", "vpn" ]]) {
        const name = prefix + "-" + suffix;
        const compose = [
            "services:", "  app:", "    image: busybox:stable", "    pull_policy: never",
            "    container_name: " + name, "    command: [sleep, '3600']", "    stop_grace_period: 1s",
            "    healthcheck:", "      test: [CMD, \"true\"]", "      interval: 1s", "      timeout: 1s", "      retries: 5",
            ...(parent ? [ "    network_mode: container:" + prefix + "-" + parent ] : []), "",
        ].join("\n");
        const stack = new Stack(server, name, compose, "", true);
        stacks.push(stack);
        await stack.save(true);
        await stack.start(socket);
    }
    await stacks[3].stop(socket);
    const initial = await previewNetworkRestart(server, prefix + "-vpn");
    assert.equal(initial.containers.length, 3);
    const consumer = initial.containers.find(c => c.name === prefix + "-app")!;
    await networkRestartDocker([ "pause", consumer.id ]);
    try {
        await assert.rejects(previewNetworkRestart(server, prefix + "-vpn"), /unmanaged/);
    } finally {
        await networkRestartDocker([ "unpause", consumer.id ]);
    }
    const composeBefore = await Promise.all(stacks.map(s => readFile(join(s.path, "compose.yaml"), "utf8")));
    const times = async () => Promise.all(initial.containers.map(c => networkRestartDocker([ "inspect", "--format", "{{.State.StartedAt}}", c.id ])));
    const startedBefore = await times();
    // Outside Docker, current-container identity is supplied only for this fixture;
    // the real manager still executes inventory, locks, prerequisites and Docker calls.
    const { resolveCurrentContainer } = await import("../backend/current-container");
    const original = process.env.DOCKGE_CONTAINER_ID;
    process.env.DOCKGE_CONTAINER_ID = before.find(c => c.name === "dockge-enhanced")?.id || "";
    assert.ok((await resolveCurrentContainer()).Id);
    try {
        await restartNetworkDependents(server, prefix + "-vpn", initial.token);
    } finally {
        if (original === undefined) {
            delete process.env.DOCKGE_CONTAINER_ID;
        } else {
            process.env.DOCKGE_CONTAINER_ID = original;
        }
    }
    const startedAfter = await times();
    assert.ok(startedAfter.every((time, i) => time !== startedBefore[i]));
    assert.deepEqual(await Promise.all(stacks.map(s => readFile(join(s.path, "compose.yaml"), "utf8"))), composeBefore);
    const after = await previewNetworkRestart(server, prefix + "-vpn");
    assert.deepEqual(after.containers.map(c => c.id), initial.containers.map(c => c.id));
    assert.ok(after.containers.every(c => c.health === "healthy"));
    assert.equal((await networkRestartDocker([ "inspect", "--format", "{{.State.Status}}", prefix + "-off" ])).trim(), "exited");
    console.log("PASS four real separate stacks: provider-first restart, transitive consumers, stopped preserved, paused refused, stable IDs, healthy, unchanged Compose");
} finally {
    for (const stack of stacks.reverse()) {
        try {
            await networkRestartDocker([ "compose", "--project-directory", stack.path, "-f", join(stack.path, "compose.yaml"), "down", "--remove-orphans" ]);
        } catch {
            clean = false;
        }
    }
    const remaining = await readNetworkRestartContainers();
    assert.equal(remaining.filter(c => c.name.startsWith(prefix)).length, 0);
    if (clean) {
        await rm(root, { recursive: true,
            force: true });
    }
    if (clean) {
        console.log("PASS disposable stacks and data removed; pre-existing images retained");
    }
}
if (!clean) {
    throw new Error("Fixture cleanup incomplete: " + root);
}
