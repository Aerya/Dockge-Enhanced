import assert from "node:assert/strict";
import test from "node:test";
import { getHostMountGeneration, isHostMountPoint, resolveHostMountPoint, Stack } from "./stack";
import { StartGuardWatcher } from "./watchers/start-guard-watcher";
import { EXITED, RUNNING } from "../common/util-common";

test("keeps legacy stacks unguarded", () => {
    assert.deepEqual(Stack.normalizeStartGuard(undefined), { enabled: false, conditions: [], watch: false, onFailure: "stop", onRecovery: "start", failureDelaySeconds: 10, recoveryDelaySeconds: 5 });
    assert.deepEqual(Stack.normalizeStartGuard({ enabled: true, conditions: [] }), { enabled: true, conditions: [], watch: false, onFailure: "stop", onRecovery: "start", failureDelaySeconds: 10, recoveryDelaySeconds: 5 });
});

test("validates only safe host mount and systemd prerequisites", () => {
    assert.deepEqual(Stack.normalizeStartGuard({
        enabled: true,
        conditions: [
            { type: "mount", target: " /mnt/torrent " },
            { type: "systemd", target: "rclone-synology.service" },
        ],
        watch: true,
        failureDelaySeconds: 30,
        recoveryDelaySeconds: 15,
    }), {
        enabled: true,
        conditions: [
            { type: "mount", target: "/mnt/torrent" },
            { type: "systemd", target: "rclone-synology.service" },
        ],
        watch: true,
        onFailure: "stop",
        onRecovery: "start",
        failureDelaySeconds: 30,
        recoveryDelaySeconds: 15,
    });
    assert.throws(() => Stack.normalizeStartGuard({ enabled: true, conditions: [ { type: "mount", target: "relative" } ] }, true));
    assert.throws(() => Stack.normalizeStartGuard({ enabled: true, conditions: [ { type: "systemd", target: "bad.service;id" } ] }, true));
    assert.throws(() => Stack.normalizeStartGuard({ enabled: true, conditions: [], failureDelaySeconds: -1 }, true));
    assert.throws(() => Stack.normalizeStartGuard({ enabled: true, conditions: [], onRecovery: "restart" }, true));
    assert.deepEqual(Stack.normalizeStartGuard({ enabled: true, conditions: [ { type: "mount", target: "relative" } ] }), { enabled: false, conditions: [], watch: false, onFailure: "stop", onRecovery: "start", failureDelaySeconds: 10, recoveryDelaySeconds: 5 });
});

test("watcher stops after failure delay and only restarts its own stop", async () => {
    let ready = false;
    let status = RUNNING;
    let stops = 0;
    let starts = 0;
    const guard = Stack.normalizeStartGuard({ enabled: true, watch: true, conditions: [ { type: "mount", target: "/mnt/media" } ], failureDelaySeconds: 10, recoveryDelaySeconds: 5 });
    const stack = {
        name: "media",
        status,
        getStartGuardStatus: async () => ({ ready, conditions: [] }),
        updateStatus: async () => { stack.status = status; },
        stopInBackground: async () => { stops++; status = EXITED; stack.status = status; return 0; },
        startScheduled: async () => { starts++; status = RUNNING; stack.status = status; return 0; },
        recreateScheduled: async () => { starts++; status = RUNNING; stack.status = status; return 0; },
    };
    const watcher = new StartGuardWatcher();
    const checkStack = (watcher as unknown as { checkStack: (candidate: typeof stack, value: typeof guard, now: number) => Promise<void> }).checkStack.bind(watcher);

    await checkStack(stack, guard, 0);
    await checkStack(stack, guard, 9_999);
    assert.equal(stops, 0);
    await checkStack(stack, guard, 10_000);
    assert.equal(stops, 1);

    ready = true;
    await checkStack(stack, guard, 10_001);
    await checkStack(stack, guard, 15_000);
    assert.equal(starts, 0);
    await checkStack(stack, guard, 15_001);
    assert.equal(starts, 1);

    watcher.cancelForManualAction("media");
    assert.equal((watcher as unknown as { states: Map<string, unknown> }).states.has("media"), false);
});

test("watcher recreates a running stack after a brief mount outage", async () => {
    let ready = true;
    let generation = "0:42:fuse.sshfs";
    let recreates = 0;
    const guard = Stack.normalizeStartGuard({ enabled: true, watch: true, conditions: [ { type: "mount", target: "/mnt/media" } ], failureDelaySeconds: 10, recoveryDelaySeconds: 5 });
    const stack = {
        name: "media",
        status: RUNNING,
        getStartGuardStatus: async () => ({ ready, conditions: [ { type: "mount", target: "/mnt/media", ok: ready, message: "", ...(ready ? { mountGeneration: generation } : {}) } ] }),
        updateStatus: async () => undefined,
        stopInBackground: async () => 0,
        startScheduled: async () => 0,
        recreateScheduled: async () => { recreates++; return 0; },
    };
    const watcher = new StartGuardWatcher();
    const checkStack = (watcher as unknown as { checkStack: (candidate: typeof stack, value: typeof guard, now: number) => Promise<void> }).checkStack.bind(watcher);

    await checkStack(stack, guard, 0);
    ready = false;
    await checkStack(stack, guard, 1_000);
    ready = true;
    generation = "0:43:fuse.sshfs";
    await checkStack(stack, guard, 2_000);
    await checkStack(stack, guard, 7_000);
    assert.equal(recreates, 1);
});

test("watcher detects a remount that happens between two checks", async () => {
    let generation = "0:42:fuse.sshfs";
    let recreates = 0;
    const guard = Stack.normalizeStartGuard({ enabled: true, watch: true, conditions: [ { type: "mount", target: "/mnt/media" } ], recoveryDelaySeconds: 5 });
    const stack = {
        name: "media",
        status: RUNNING,
        getStartGuardStatus: async () => ({ ready: true, conditions: [ { type: "mount", target: "/mnt/media", ok: true, message: "", mountGeneration: generation } ] }),
        updateStatus: async () => undefined,
        stopInBackground: async () => 0,
        startScheduled: async () => 0,
        recreateScheduled: async () => { recreates++; return 0; },
    };
    const watcher = new StartGuardWatcher();
    const checkStack = (watcher as unknown as { checkStack: (candidate: typeof stack, value: typeof guard, now: number) => Promise<void> }).checkStack.bind(watcher);

    await checkStack(stack, guard, 0);
    generation = "0:43:fuse.sshfs";
    await checkStack(stack, guard, 1_000);
    await checkStack(stack, guard, 6_000);
    assert.equal(recreates, 1);
});

test("resolves the most specific host mount and never falls back after it disappears", () => {
    const mounted = "1 0 0:1 / /host rw - ext4 /dev/root rw\n2 1 0:2 / /host/home rw - ext4 /dev/root rw\n3 2 0:3 / /host/home/user/Montages/NAS rw - fuse.sshfs sshfs rw";
    const target = "/home/user/Montages/NAS/Torrent/foo";
    assert.equal(resolveHostMountPoint(mounted, target), "/home/user/Montages/NAS");
    assert.equal(resolveHostMountPoint(mounted, "/home/user/Montages/NAS"), "/home/user/Montages/NAS");
    assert.equal(isHostMountPoint(mounted, "/home/user/Montages/NAS"), true);
    assert.equal(getHostMountGeneration(mounted, "/home/user/Montages/NAS"), "0:3:fuse.sshfs");
    const disappeared = "1 0 0:1 / /host rw - ext4 /dev/root rw\n2 1 0:2 / /host/home rw - ext4 /dev/root rw";
    assert.equal(isHostMountPoint(disappeared, "/home/user/Montages/NAS"), false);
    assert.equal(isHostMountPoint(mounted, "/home/user/Montages/NAS"), true);
});
