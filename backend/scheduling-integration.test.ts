import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { setSchedulingTimezone } from "./scheduling-timezone";
import type { ScheduleRule, StackSchedule } from "./watchers/stack-scheduler";
import type { Cron } from "croner";

test("scheduled ImageWatcher updates execute in the chosen zone and persist consumption of pending work", async t => {
    const root = await mkdtemp(path.join(os.tmpdir(), "dockge-timezone-"));
    const previousData = process.env.DOCKGE_DATA_DIR;
    const previousStacks = process.env.DOCKGE_STACKS_DIR;
    process.env.DOCKGE_DATA_DIR = path.join(root, "data");
    process.env.DOCKGE_STACKS_DIR = path.join(root, "stacks");
    await mkdir(path.join(root, "data", "self-update"), { recursive: true });
    await mkdir(path.join(root, "stacks", "example"), { recursive: true });
    await writeFile(path.join(root, "stacks", "example", "compose.yaml"), "services:\n  app:\n    image: fixture:latest\n");
    await writeFile(path.join(root, "data", "self-update", "settings.json"), JSON.stringify({ mode: "manual" }));
    t.after(async () => {
        setSchedulingTimezone(undefined);
        if (previousData === undefined) {
            delete process.env.DOCKGE_DATA_DIR;
        } else {
            process.env.DOCKGE_DATA_DIR = previousData;
        }
        if (previousStacks === undefined) {
            delete process.env.DOCKGE_STACKS_DIR;
        } else {
            process.env.DOCKGE_STACKS_DIR = previousStacks;
        }
        await rm(root, { recursive: true,
            force: true });
    });
    const { ImageWatcher } = await import("./watchers/image-watcher");
    const watcher = new ImageWatcher(path.join(root, "data"));
    const internal = watcher as unknown as {
        applyPendingUpdates(): Promise<void>;
        performAutoUpdate(): Promise<boolean>;
    };
    let applied = 0;
    t.mock.method(internal, "performAutoUpdate", async () => {
        applied++;
        return true;
    });
    const key = "example::fixture:latest";
    watcher.settings.autoUpdateConfig = { [key]: { mode: "scheduled",
        time: "02:32" } };
    watcher.settings.pendingAutoUpdates = [ key ];
    t.mock.timers.enable({ apis: [ "Date" ],
        now: new Date("2026-01-10T01:32:00Z") });
    setSchedulingTimezone("UTC");
    await internal.applyPendingUpdates();
    assert.equal(applied, 0);
    assert.deepEqual(watcher.settings.pendingAutoUpdates, [ key ]);
    setSchedulingTimezone("Europe/Paris");
    await internal.applyPendingUpdates();
    assert.equal(applied, 1);
    assert.deepEqual(watcher.settings.pendingAutoUpdates, []);
    await internal.applyPendingUpdates();
    assert.equal(applied, 1, "same pending update is not executed twice");
    const reloaded = new ImageWatcher(path.join(root, "data"));
    await reloaded.loadSettings();
    assert.equal(reloaded.settings.autoUpdateConfig?.[key].time, "02:32");
    assert.deepEqual(reloaded.settings.pendingAutoUpdates, []);
    t.mock.timers.reset();

    const { StackScheduler } = await import("./watchers/stack-scheduler");
    const scheduler = new StackScheduler() as unknown as {
        enabled: boolean;
        jobs: Map<string, Cron>;
        schedules: Record<string, StackSchedule>;
        reschedule(): void;
        isBiweeklyOccurrence(rule: ScheduleRule, now: Date): boolean;
    };
    const schedule: StackSchedule = { start: { mode: "daily",
        time: "04:15" },
    stop: { mode: "off" } };
    scheduler.schedules = { example: schedule };
    scheduler.enabled = true;
    try {
        scheduler.reschedule();
        const initial = scheduler.jobs.get("example:start");
        assert.ok(initial);
        setSchedulingTimezone("Asia/Shanghai");
        assert.notEqual(scheduler.jobs.get("example:start"), initial);
        assert.equal(scheduler.jobs.size, 1);
        assert.deepEqual(scheduler.schedules.example, schedule, "changing zone never rewrites existing rules");
        const rule: ScheduleRule = { mode: "biweekly",
            time: "00:15",
            anchorDate: "2026-10-19" };
        assert.equal(scheduler.isBiweeklyOccurrence(rule, new Date("2026-10-18T16:15:00Z")), true);
        assert.equal(scheduler.isBiweeklyOccurrence(rule, new Date("2026-10-25T16:15:00Z")), false);
        assert.equal(scheduler.isBiweeklyOccurrence(rule, new Date("2026-11-01T16:15:00Z")), true);
    } finally {
        scheduler.enabled = false;
        scheduler.reschedule();
    }
});
