import assert from "node:assert/strict";
import test from "node:test";
import { isHostMountPoint, Stack } from "./stack";
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
        getStartGuardStatus: async () => ({ ready }),
        updateStatus: async () => { stack.status = status; },
        stopInBackground: async () => { stops++; status = EXITED; stack.status = status; return 0; },
        startScheduled: async () => { starts++; status = RUNNING; stack.status = status; return 0; },
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

test("recognizes a host mount point without trusting a directory", () => {
    const mountInfo = "36 25 0:32 / /host/mnt/torrent rw,relatime - ext4 /dev/sda1 rw\n37 25 0:33 / /host/mnt/media rw,relatime - ext4 /dev/sdb1 rw";
    assert.equal(isHostMountPoint(mountInfo, "/mnt/torrent"), true);
    assert.equal(isHostMountPoint(mountInfo, "/mnt/torrent/missing"), false);
});
