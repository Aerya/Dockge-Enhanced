import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { executeNetworkRestart, planNetworkRestart, readNetworkRestartContainers, type NetworkRestartContainer } from "./network-restart";
import { restartNetworkDependents } from "./network-restart-manager";
import { tryReserveDockerUpdate, activeDockerUpdateOperation } from "./self-update/operation-coordinator";
import { hasActiveStackMutations, withStackMutation } from "./stack-mutation";
import type { DockgeServer } from "./dockge-server";

const row = (id: string, stack: string, mode = "bridge", state = "running"): NetworkRestartContainer => ({ id,
    name: id,
    stack,
    project: stack,
    service: id,
    mode,
    state,
    health: "healthy" });
const rows = [ row("vpn", "vpn"), row("app", "media", "container:vpn"), row("child", "other", "container:app"), row("off", "other", "container:vpn", "exited") ];

test("persisted detached self-update blocks before Docker, while scheduled does not", async () => {
    const root = await mkdtemp(join(tmpdir(), "network-restart-state-"));
    const server = { config: { dataDir: root },
        externalStacks: { get: async () => {
            throw new Error("preview reached");
        } } } as unknown as DockgeServer;
    try {
        await mkdir(join(root, "self-update"));
        await writeFile(join(root, "self-update", "status.json"), JSON.stringify({ state: "updating" }));
        await assert.rejects(restartNetworkDependents(server, "vpn", "a".repeat(64)), /busy/);
        assert.equal(activeDockerUpdateOperation(), null);
        await writeFile(join(root, "self-update", "status.json"), JSON.stringify({ state: "scheduled" }));
        await assert.rejects(restartNetworkDependents(server, "vpn", "a".repeat(64)), /preview reached/);
        assert.equal(activeDockerUpdateOperation(), null);
    } finally {
        await rm(root, { recursive: true,
            force: true });
    }
});

test("cross-stack plan follows transitive Docker namespaces, preserves stopped containers and rejects unsafe targets", () => {
    const plan = planNetworkRestart(rows, "vpn");
    assert.deepEqual(plan.containers.map(c => c.id), [ "vpn", "app", "child" ]);
    assert.equal(planNetworkRestart([ ...rows ].reverse(), "vpn").token, plan.token);
    assert.notEqual(planNetworkRestart(rows.map(c => c.id === "child" ? { ...c,
        mode: "container:vpn" } : c), "vpn").token, plan.token);
    assert.throws(() => planNetworkRestart([ rows[0], { ...rows[1],
        stack: undefined }], "vpn"), /unmanaged/);
    assert.throws(() => planNetworkRestart([ rows[0], { ...rows[1],
        state: "paused" }], "vpn"), /unmanaged/);
    assert.throws(() => planNetworkRestart([{ ...rows[0],
        mode: "container:app" }, rows[1] ], "vpn"), /cycle/);
    assert.throws(() => planNetworkRestart([ rows[3] ], "other"), /empty/);
    assert.doesNotThrow(() => planNetworkRestart([ ...rows, row("unrelated", "other", "container:missing", "exited") ], "vpn"));
});

test("inventory is bounded to batches of 16 and fails closed on inspection errors", async () => {
    const sizes: number[] = [];
    const result = await readNetworkRestartContainers(async args => {
        if (args[0] === "ps") {
            return Array.from({ length: 33 }, (_, i) => String(i)).join("\n");
        }
        sizes.push(args.length - 4);
        return args.slice(4).map(id => JSON.stringify(row(id, "demo"))).join("\n");
    });
    assert.equal(result.length, 33);
    assert.deepEqual(sizes, [ 16, 16, 1 ]);
    await assert.rejects(readNetworkRestartContainers(async () => {
        throw new Error("denied");
    }), /denied/);
});

test("restart waits for health before consumers, never pulls or recreates, and stops after a failure", async () => {
    const plan = planNetworkRestart(rows, "vpn");
    const commands: string[][] = [];
    let restarted = false;
    let polls = 0;
    const run = async (args: string[]) => {
        commands.push(args);
        const id = args.at(-1)!;
        if (args[1] === "restart") {
            restarted = true;
            return id;
        }
        const item = rows.find(c => c.id === id)!;
        return JSON.stringify({ ...item,
            health: id === "vpn" && restarted && polls++ === 0 ? "starting" : "healthy" });
    };
    const waits: number[] = [];
    assert.deepEqual(await executeNetworkRestart(plan, run, async ms => {
        waits.push(ms);
    }), [ "vpn", "app", "child" ]);
    assert.deepEqual(waits, [ 500 ]);
    assert.deepEqual(commands.filter(c => c[1] === "restart").map(c => c.at(-1)), [ "vpn", "app", "child" ]);
    assert.ok(commands.every(c => [ "inspect", "restart" ].includes(c[1])));
    let calls = 0;
    await assert.rejects(executeNetworkRestart(plan, async args => {
        if (args[1] === "restart") {
            calls++;
            throw new Error("Docker failed");
        }
        return JSON.stringify(rows[0]);
    }), /Docker failed/);
    assert.equal(calls, 1);
});

test("stale state, unhealthy provider and stuck healthcheck never restart consumers", async () => {
    const plan = planNetworkRestart(rows, "vpn");
    await assert.rejects(executeNetworkRestart(plan, async () => JSON.stringify({ ...rows[0],
        state: "paused" })), /changed/);
    let restarted = false;
    let time = 0;
    const run = async (args: string[]) => {
        assert.equal(args.at(-1), "vpn");
        if (args[1] === "restart") {
            restarted = true;
            return "vpn";
        }
        return JSON.stringify({ ...rows[0],
            health: restarted ? "starting" : "healthy" });
    };
    await assert.rejects(executeNetworkRestart(plan, run, async ms => {
        time += ms;
    }, () => time), /timeout/);
    restarted = false;
    await assert.rejects(executeNetworkRestart(plan, async args => {
        if (args[1] === "restart") {
            restarted = true;
            return "vpn";
        }
        return JSON.stringify({ ...rows[0],
            health: restarted ? "unhealthy" : "healthy" });
    }), /unhealthy/);
});

test("manager reserves before awaiting, respects persisted self-update and releases all locks on failure", async () => {
    const server = { config: { dataDir: "/isolated" } } as DockgeServer;
    const plan = planNetworkRestart(rows, "vpn");
    let release!: () => void;
    const barrier = new Promise<void>(resolve => {
        release = resolve;
    });
    let fail = false;
    let blocked = false;
    const dependencies = {
        preview: async () => plan,
        getStack: async (_server: DockgeServer, name: string) => ({ operationProject: name,
            checkNetworkRestartPrerequisites: async () => {} }),
        current: async () => ({ Id: "enhanced" }),
        blocked: async () => blocked,
        execute: async () => {
            assert.equal(hasActiveStackMutations(), true);
            await barrier;
            if (fail) {
                throw new Error("failed");
            }
            return [ "vpn" ];
        },
    };
    // Check an independently initiated operation, outside the lock owner's async context.
    const first = restartNetworkDependents(server, "vpn", plan.token, dependencies);
    assert.equal(activeDockerUpdateOperation(), "image-update");
    assert.equal(tryReserveDockerUpdate("self-update"), null);
    await assert.rejects(restartNetworkDependents(server, "vpn", plan.token, dependencies), /busy/);
    await new Promise(resolve => setImmediate(resolve));
    await assert.rejects(withStackMutation("media", async () => {}), /Another operation/);
    release();
    await first;
    assert.equal(hasActiveStackMutations(), false);
    assert.equal(activeDockerUpdateOperation(), null);
    fail = true;
    await assert.rejects(restartNetworkDependents(server, "vpn", plan.token, dependencies), /failed/);
    assert.equal(hasActiveStackMutations(), false);
    blocked = true;
    await assert.rejects(restartNetworkDependents(server, "vpn", plan.token, dependencies), /busy/);
    assert.equal(activeDockerUpdateOperation(), null);
    blocked = false;
    await assert.rejects(restartNetworkDependents(server, "vpn", "0".repeat(64), dependencies), /changed/);
    dependencies.current = async () => ({ Id: "vpn" });
    await assert.rejects(restartNetworkDependents(server, "vpn", plan.token, dependencies), /self/);
    assert.equal(activeDockerUpdateOperation(), null);
});
