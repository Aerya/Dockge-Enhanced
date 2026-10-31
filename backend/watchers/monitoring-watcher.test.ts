import test, { after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { CrashEvent, HealthEvent } from "./monitoring-watcher";

const directory = await mkdtemp(join(tmpdir(), "dockge-monitoring-events-"));
const previousDataDir = process.env.DOCKGE_DATA_DIR;
process.env.DOCKGE_DATA_DIR = directory;
const { MonitoringWatcher } = await import("./monitoring-watcher");
after(async () => {
    if (previousDataDir === undefined) {
        delete process.env.DOCKGE_DATA_DIR;
    } else {
        process.env.DOCKGE_DATA_DIR = previousDataDir;
    }
    await rm(directory, { recursive: true,
        force: true });
});

interface TestWatcher {
    handleDockerEventLine(line: string): void;
    saveCrashEvents(): Promise<void>;
    saveHealthEvents(): Promise<void>;
    loadCrashEvents(): Promise<void>;
    loadHealthEvents(): Promise<void>;
}

function fixture() {
    const watcher = new MonitoringWatcher();
    const internal = watcher as unknown as TestWatcher;
    const crashAlerts: CrashEvent[] = [];
    const healthAlerts: HealthEvent[] = [];
    const heals: string[] = [];
    const pending: Promise<void>[] = [];
    const saveCrash = internal.saveCrashEvents.bind(watcher);
    const saveHealth = internal.saveHealthEvents.bind(watcher);
    Object.assign(watcher, {
        saveCrashEvents: () => {
            const saving = saveCrash();
            pending.push(saving);
            return saving;
        },
        saveHealthEvents: () => {
            const saving = saveHealth();
            pending.push(saving);
            return saving;
        },
        sendCrashAlert: async (event: CrashEvent) => {
            crashAlerts.push(event);
        },
        sendHealthAlert: async (event: HealthEvent) => {
            healthAlerts.push(event);
        },
        applyHealthAction: async (_mode: string, _name: string, id: string) => {
            heals.push(id);
            return { ok: true,
                message: "test restart" };
        },
    });
    watcher.settings = { ...watcher.settings,
        crashLoopEnabled: true,
        healthcheckEnabled: true,
        crashLoopThreshold: 2 };
    return { watcher,
        internal,
        crashAlerts,
        healthAlerts,
        heals,
        emit: (event: unknown) => internal.handleDockerEventLine(JSON.stringify(event)),
        flush: async () => {
            await new Promise(resolve => setImmediate(resolve));
            await Promise.all(pending);
        } };
}

for (const modern of [ true, false ]) {
    test(`${modern ? "modern" : "legacy"} events trigger alerts, persist history and respect cooldowns`, async () => {
        const f = fixture();
        const event = (action: string) => ({
            ...(modern ? { Action: action } : { status: action,
                id: "legacy-container-id" }),
            Actor: {
                ...(modern ? { ID: "modern-container-id" } : {}),
                Attributes: { name: "fixture",
                    "com.docker.compose.project": "fixture-stack",
                    "com.docker.compose.service": "app" },
            },
        });
        const expectedId = modern ? "modern-container-id" : "legacy-container-id";
        f.emit(event("die"));
        assert.equal(f.crashAlerts.length, 0);
        f.emit(event("die"));
        f.emit(event("health_status: unhealthy"));
        await f.flush();
        assert.equal(f.crashAlerts.length, 1);
        assert.equal(f.healthAlerts.length, 1);
        assert.equal(f.crashAlerts[0].containerId, expectedId);
        assert.equal(f.healthAlerts[0].containerId, expectedId);
        assert.equal(f.healthAlerts[0].stackName, "fixture-stack");
        assert.equal(f.healthAlerts[0].serviceName, "app");
        assert.equal(f.heals.length, 0);
        for (const filename of [ "crash-events.json", "health-events.json" ]) {
            assert.equal(JSON.parse(await readFile(join(directory, filename), "utf8"))[0].containerId, expectedId);
        }
        const restored = fixture();
        await restored.internal.loadCrashEvents();
        await restored.internal.loadHealthEvents();
        assert.equal(restored.watcher.getRecentCrashEvents()[0].containerId, expectedId);
        assert.equal(restored.watcher.getRecentHealthEvents()[0].containerId, expectedId);
        f.emit(event("die"));
        f.emit(event("die"));
        f.emit(event("health_status: unhealthy"));
        await f.flush();
        assert.equal(f.crashAlerts.length, 1);
        assert.equal(f.healthAlerts.length, 1);
    });
}

test("modern fields take precedence and unnamed containers use Actor.ID", async () => {
    const f = fixture();
    f.watcher.settings.healthcheckAutoHealMode = "restart_container";
    f.emit({ Action: "health_status: unhealthy",
        status: "die",
        id: "stale",
        Actor: { ID: "0123456789abcdef" } });
    await f.flush();
    assert.deepEqual(f.heals, [ "0123456789abcdef" ]);
    assert.equal(f.healthAlerts[0].containerName, "0123456789ab");
    assert.equal(f.healthAlerts[0].actionStatus, "success");
    assert.equal(f.crashAlerts.length, 0);
});

test("healthy, starting, unrelated, malformed and disabled events do not alert or heal", async () => {
    const f = fixture();
    for (const Action of [ "health_status: healthy", "health_status: starting", "start", "" ]) {
        f.emit({ Action,
            Actor: { ID: "fixture" } });
    }
    f.internal.handleDockerEventLine("invalid json");
    f.emit(null);
    f.emit({});
    f.watcher.settings.crashLoopEnabled = false;
    f.watcher.settings.healthcheckEnabled = false;
    for (const Action of [ "die", "die", "health_status: unhealthy" ]) {
        f.emit({ Action });
    }
    await f.flush();
    assert.deepEqual(f.crashAlerts, []);
    assert.deepEqual(f.healthAlerts, []);
    assert.deepEqual(f.heals, []);
});

test("real Docker CLI events reach the notification and history paths", { skip: !process.env.MONITORING_EVENT_FIXTURE }, async () => {
    const f = fixture();
    const lines = (await readFile(process.env.MONITORING_EVENT_FIXTURE!, "utf8")).trim().split("\n");
    // Flush between events: persistence is asynchronous, as in the live stream.
    for (const line of lines) {
        f.internal.handleDockerEventLine(line);
        await f.flush();
    }
    assert.equal(f.crashAlerts.length, 1);
    assert.equal(f.healthAlerts.length, 1);
    assert.equal(f.healthAlerts[0].containerName, "monitoring-smoke-unhealthy");
    assert.equal(f.crashAlerts[0].containerName, "monitoring-smoke-crash");
    assert.ok(f.healthAlerts[0].containerId.length >= 12);
    assert.ok(f.crashAlerts[0].containerId.length >= 12);
});
