import test from "node:test";
import assert from "node:assert/strict";
import { MonitoringWatcher } from "./watchers/monitoring-watcher";
import { markRolloutDraining, registerPendingRollout, releasePendingRollout } from "./stack-mutation";

test("monitoring does not alert or restart intentionally draining replicas; real failures still heal", async () => {
    for (const mode of [ "notify", "restart_service", "stack_aware" ]) {
        let alerts = 0;
        let heals = 0;
        const watcher = Object.assign(Object.create(MonitoringWatcher.prototype), {
            settings: { healthcheckCooldownMinutes: 1,
                healthcheckAutoHealMode: mode },
            healthCooldowns: new Map(),
            recentHealthEvents: [],
            saveHealthEvents: async () => {},
            sendHealthAlert: async () => {
                alerts++;
            },
            applyHealthAction: async () => {
                heals++;
                return { ok: true,
                    message: "fixture" };
            },
        }) as { onContainerUnhealthy(event: object, name: string, id: string): Promise<void> };
        const release = markRolloutDraining([ "old-replica" ]);
        try {
            await watcher.onContainerUnhealthy({}, "old", "old-replica");
            assert.equal(alerts, 0);
            assert.equal(heals, 0);
            await watcher.onContainerUnhealthy({}, "new", "new-replica");
            assert.equal(alerts, 1);
            assert.equal(heals, mode === "notify" ? 0 : 1);
        } finally {
            release();
        }
    }
});

test("a failed replacement is reported but auto-heal does not race durable rollback", async () => {
    let alerts = 0;
    let heals = 0;
    const events: { actionStatus: string }[] = [];
    const watcher = Object.assign(Object.create(MonitoringWatcher.prototype), {
        settings: { healthcheckCooldownMinutes: 1,
            healthcheckAutoHealMode: "restart_container" },
        healthCooldowns: new Map(),
        recentHealthEvents: events,
        saveHealthEvents: async () => {},
        sendHealthAlert: async () => {
            alerts++;
        },
        applyHealthAction: async () => {
            heals++;
        },
    }) as { onContainerUnhealthy(event: object, name: string, id: string): Promise<void> };
    registerPendingRollout("/fixture/rollout-monitoring", "test");
    try {
        await watcher.onContainerUnhealthy({ Actor: { Attributes: { "com.docker.compose.project.working_dir": "/fixture/rollout-monitoring" } } }, "failed-new", "new-id");
        assert.equal(alerts, 1);
        assert.equal(heals, 0);
        assert.equal(events[0].actionStatus, "skipped");
    } finally {
        releasePendingRollout("/fixture/rollout-monitoring", "test");
    }
});
