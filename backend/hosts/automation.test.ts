import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { HOST_DEFAULTS, hostSettings, HostManager } from "./manager";
import { queueHostOperation, validHostSchedule, type HostOperationEvent } from "./operations";
import { notifyDetection, operationNotification, sendHostNotification } from "./notifications";
import { Settings } from "../settings";
import { ImageWatcher } from "../watchers/image-watcher";
import { DiscordNotifier } from "../notification/discord";
import { AppriseNotifier } from "../notification/apprise";
import { AuditLogger } from "../audit-log";
import { R } from "redbean-node";

const schedule = { enabled: true,
    days: [ 0, 6 ],
    hour: 2,
    minute: 30,
    scope: "security" };
const event: HostOperationEvent = { hostId: "a".repeat(64),
    id: "b".repeat(32),
    state: "complete",
    at: Date.now() / 1000,
    scope: "security",
    automatic: true,
    count: 2 };

test("schedule payload is bounded and cannot add executable fields", async () => {
    assert.equal(validHostSchedule(schedule), true);
    for (const invalid of [ { ...schedule,
        days: [ true ] }, { ...schedule,
        days: [ 0, 0 ] }, { ...schedule,
        hour: 24 }, { ...schedule,
        minute: -1 }, { ...schedule,
        scope: "shell" }, { ...schedule,
        command: "id" } ]) {
        assert.equal(validHostSchedule(invalid), false);
        await assert.rejects(queueHostOperation({ action: "schedule",
            schedule: invalid }, event.hostId));
    }
    const directory = await mkdtemp(path.join(tmpdir(), "host-schedule-"));
    const previous = process.env.DOCKGE_HOST_REQUEST_DIR;
    process.env.DOCKGE_HOST_REQUEST_DIR = directory;
    try {
        const queued = await queueHostOperation({ action: "schedule",
            schedule }, event.hostId);
        const saved = JSON.parse(await readFile(path.join(directory, `${queued.id}.json`), "utf8"));
        assert.deepEqual(saved.schedule, schedule);
        assert.equal(saved.hostId, event.hostId);
        assert.ok(saved.expires > Date.now() / 1000 && saved.expires < Date.now() / 1000 + 121);
        assert.equal((await readdir(directory)).length, 1);
    } finally {
        if (previous === undefined) {
            delete process.env.DOCKGE_HOST_REQUEST_DIR;
        } else {
            process.env.DOCKGE_HOST_REQUEST_DIR = previous;
        }
        await rm(directory, { recursive: true,
            force: true });
    }
});

test("notification options require real booleans and a known severity", () => {
    assert.throws(() => hostSettings({ ...HOST_DEFAULTS,
        notificationEvents: { ...HOST_DEFAULTS.notificationEvents,
            operationFailure: "false" } }));
    assert.throws(() => hostSettings({ ...HOST_DEFAULTS,
        notificationSeverity: "NONE" }));
    assert.equal(hostSettings({ ...HOST_DEFAULTS,
        notificationSeverity: "CRITICAL" }).notificationSeverity, "CRITICAL");
    assert.equal(operationNotification({ ...event,
        state: "failed" }), "operationFailure");
    assert.equal(operationNotification({ ...event,
        state: "simulated" }), null);
});

test("detections deduplicate, reset after recovery and retry failures; operation notifications are not rate-limited", async t => {
    const stored = new Map();
    t.mock.method(Settings, "get", async (key: string) => key === "uiLocale" ? "fr" : stored.get(key));
    t.mock.method(Settings, "set", async (key: string, value: unknown) => {
        stored.set(key, value);
    });
    t.mock.method(ImageWatcher, "getInstance", () => ({ settings: { discordWebhooks: [ "test" ],
        appriseServerUrl: "",
        appriseUrls: [] } }));
    let deliver = false;
    const sent: { title: string;
        description: string }[] = [];
    t.mock.method(DiscordNotifier.prototype, "sendEmbed", async (payload: { title: string;
        description: string }) => {
        sent.push(payload);
        return deliver;
    });
    t.mock.method(AppriseNotifier.prototype, "send", async () => false);
    await notifyDetection("updates", "test-host", [ "p: 1 → 2" ]);
    assert.equal(stored.size, 0);
    deliver = true;
    await notifyDetection("updates", "test-host", [ "p: 1 → 2" ]);
    await notifyDetection("updates", "test-host", [ "p: 1 → 2" ]);
    await notifyDetection("updates", "test-host", [ "p: 1 → 3" ]);
    assert.equal(sent.length, 2);
    await notifyDetection("updates", "test-host", []);
    await notifyDetection("updates", "test-host", [ "p: 1 → 3" ]);
    assert.equal(sent.length, 3);
    assert.equal(await sendHostNotification("operationSuccess", "test-host", "", event), true);
    assert.equal(await sendHostNotification("operationSuccess", "test-host", "", event), true);
    assert.match(sent.at(-1)!.description, /Automatique · security · Paquets: 2/);
});

test("background operation polling retains failed deliveries and marks a successful retry once", async t => {
    const manager = new HostManager();
    // Existing persisted events must be retried even when the executor is temporarily unreachable.
    Object.assign(manager, { report: { host: "test-host",
        hostId: event.hostId } });
    t.mock.method(manager, "settings", async () => ({ ...HOST_DEFAULTS,
        enabled: true,
        notifications: true }));
    const row = { event_key: `${event.hostId}:${event.id}:${event.state}`,
        event: JSON.stringify(event),
        at: Date.now(),
        audited: 0,
        notified: 0 };
    t.mock.method(R, "getAll", async () => row.notified && row.audited ? [] : [ row ]);
    t.mock.method(R, "exec", async (sql: string) => {
        if (sql.includes("SET notified")) {
            row.notified = 1;
        }
        if (sql.includes("SET audited")) {
            row.audited = 1;
        }
        return 1;
    });
    const audit = t.mock.method(AuditLogger.prototype, "log", async () => {});
    t.mock.method(Settings, "get", async () => "en");
    t.mock.method(ImageWatcher, "getInstance", () => ({ settings: { discordWebhooks: [ "test" ],
        appriseServerUrl: "",
        appriseUrls: [] } }));
    let deliver = false;
    const send = t.mock.method(DiscordNotifier.prototype, "sendEmbed", async () => deliver);
    t.mock.method(AppriseNotifier.prototype, "send", async () => false);
    await manager.pollOperations();
    assert.equal(row.notified, 0);
    assert.equal(row.audited, 1);
    deliver = true;
    Object.assign(manager, { operationRead: 0 });
    await manager.pollOperations();
    assert.equal(row.notified, 1);
    Object.assign(manager, { operationRead: 0 });
    await manager.pollOperations();
    assert.equal(send.mock.callCount(), 2);
    assert.equal(audit.mock.callCount(), 1);
});
