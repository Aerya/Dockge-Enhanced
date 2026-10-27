import test from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { AsyncLocalStorage } from "node:async_hooks";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { Server } from "socket.io";
import { io, type Socket } from "socket.io-client";
import express from "express";
import { WatcherRouter } from "../routers/watcher-router";
import { AuditLogger } from "../audit-log";
import type { ResolvedComposeModel } from "../compose-network-namespace";
import { ImageWatcher } from "./image-watcher";
import { resolveScheduledTime } from "../../common/image-update-time";
import { validateStackBulkRequest, buildStackBulkPlan } from "./stack-auto-update";
import { AgentSocket } from "../../common/agent-socket";
import { DockerSocketHandler } from "../agent-socket-handlers/docker-socket-handler";
import type { DockgeSocket } from "../util-server";
import type { DockgeServer } from "../dockge-server";

test("default and explicit times are strict HH:MM, including midnight", () => {
    assert.equal(resolveScheduledTime(undefined), "02:00");
    assert.equal(resolveScheduledTime(undefined, "05:30"), "05:30");
    assert.equal(resolveScheduledTime("00:00", "05:30"), "00:00");
    for (const invalid of [ "", "5:30", "24:00", "05:60", null, 530, "05:30\n" ]) {
        assert.throws(() => resolveScheduledTime(invalid), /HH:MM/);
    }
});

test("settings survive restart without changing existing times, pauses or pending updates", async (t) => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "dockge-default-time-"));
    t.after(() => fs.rm(root, { recursive: true,
        force: true }));
    const config = { "demo::fixture/app": { mode: "scheduled" as const,
        time: "03:15",
        pause: { enabled: true,
            until: null } } };
    await fs.writeFile(path.join(root, "watcher-settings.json"), JSON.stringify({
        autoUpdateConfig: config,
        pendingAutoUpdates: [ "demo::fixture/app" ],
    }));
    const watcher = new ImageWatcher(root);
    watcher.restart = () => {};
    await watcher.loadSettings();
    assert.equal(watcher.settings.defaultScheduledTime, "02:00");
    await watcher.saveSettings({ defaultScheduledTime: "05:30" }, false);
    const reloaded = new ImageWatcher(root);
    await reloaded.loadSettings();
    assert.equal(reloaded.getAutoUpdateState().defaultScheduledTime, "05:30");
    assert.deepEqual(reloaded.settings.autoUpdateConfig, config);
    assert.deepEqual(reloaded.settings.pendingAutoUpdates, [ "demo::fixture/app" ]);
    const before = await fs.readFile(path.join(root, "watcher-settings.json"), "utf8");
    await assert.rejects(watcher.saveSettings({ defaultScheduledTime: "26:30" }), /HH:MM/);
    assert.equal(watcher.settings.defaultScheduledTime, "05:30");
    assert.equal(await fs.readFile(path.join(root, "watcher-settings.json"), "utf8"), before);
    await fs.writeFile(path.join(root, "watcher-settings.json"), JSON.stringify({ defaultScheduledTime: "broken",
        autoUpdateConfig: config }));
    await reloaded.loadSettings();
    assert.equal(reloaded.settings.defaultScheduledTime, "02:00");
    assert.deepEqual(reloaded.settings.autoUpdateConfig, config);
});

test("bulk uses host default, preserves exceptions and invalidates preview when default changes", () => {
    const input = { stack: "demo",
        mode: "scheduled",
        preserveExisting: true };
    const model = { services: { web: { image: "fixture/web" },
        db: { image: "fixture/db" } } };
    const entries = { "demo::fixture/db": { mode: "scheduled" as const,
        time: "01:00" } };
    const first = buildStackBulkPlan(validateStackBulkRequest(input, "05:30"), model, entries);
    assert.equal(first.time, "05:30");
    assert.equal(first.preserved, 1);
    assert.equal(first.changes[0].after, "scheduled@05:30");
    const changed = buildStackBulkPlan(validateStackBulkRequest(input, "06:45"), model, entries);
    assert.notEqual(first.previewToken, changed.previewToken);
    assert.equal(validateStackBulkRequest({ ...input,
        time: "00:00" }, "05:30").time, "00:00");
    assert.equal(entries["demo::fixture/db"].time, "01:00");
});

test("agent handlers use each hosting instance's default and reject malformed input", async (t) => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "dockge-agent-default-time-"));
    t.after(() => fs.rm(root, { recursive: true,
        force: true }));
    const context = new AsyncLocalStorage<ImageWatcher>();
    t.mock.method(ImageWatcher, "getInstance", () => {
        const watcher = context.getStore();
        assert.ok(watcher);
        return watcher;
    });
    const agents = new AgentSocket();
    new DockerSocketHandler().create({ userID: 1 } as DockgeSocket, {} as DockgeServer, agents);
    type Response = { ok: boolean;
        data: ReturnType<ImageWatcher["getAutoUpdateState"]> };
    const clients = new Map<ImageWatcher, Socket>();
    const call = (watcher: ImageWatcher, event: string, ...args: unknown[]): Promise<Response> =>
        clients.get(watcher)!.timeout(3000).emitWithAck(event, ...args);
    const instances = [ "05:30", "08:45" ].map((time, index) => {
        const watcher = new ImageWatcher(path.join(root, String(index)));
        watcher.restart = () => {};
        watcher.settings.defaultScheduledTime = time;
        return watcher;
    });
    t.mock.method(AuditLogger.getInstance(), "logFromSocket", async () => {});
    const http = createServer();
    const server = new Server(http);
    t.after(async () => {
        for (const client of clients.values()) {
            client.disconnect();
        }
        await new Promise<void>(resolve => server.close(() => resolve()));
    });
    server.on("connection", socket => {
        const watcher = instances[Number(socket.handshake.auth.instance)];
        socket.onAny((event, ...args) => context.run(watcher, () => agents.call(event, ...args)));
    });
    await new Promise<void>(resolve => http.listen(0, "127.0.0.1", resolve));
    for (const [ index, watcher ] of instances.entries()) {
        clients.set(watcher, io(`http://127.0.0.1:${(http.address() as AddressInfo).port}`, { reconnection: false,
            auth: { instance: index } }));
        // Only Compose discovery is substituted: policy preview/application and persistence are real.
        t.mock.method(watcher as unknown as { resolveStackBulkComposeModel(): Promise<ResolvedComposeModel> }, "resolveStackBulkComposeModel", async () => ({ services: {
            app: { image: "fixture/app" },
            db: { image: "fixture/db" },
        } }));
    }
    for (const watcher of instances) {
        const initial = await call(watcher, "watcherImageAutoUpdateGet");
        assert.equal(initial.data.defaultScheduledTime, watcher.settings.defaultScheduledTime);
        const result = await call(watcher, "watcherImageAutoUpdateSet", { key: "demo::fixture/web",
            mode: "scheduled" });
        assert.equal(result.ok, true);
        assert.equal(result.data.autoUpdateConfig["demo::fixture/web"].time, watcher.settings.defaultScheduledTime);
        const explicit = await call(watcher, "watcherImageAutoUpdateSet", { key: "demo::fixture/db",
            mode: "scheduled",
            time: "00:00" });
        assert.equal(explicit.data.autoUpdateConfig["demo::fixture/db"].time, "00:00");
        for (const time of [ "25:00", "", null, 530 ]) {
            const rejected = await call(watcher, "watcherImageAutoUpdateSet", { key: "demo::fixture/web",
                mode: "scheduled",
                time });
            assert.equal(rejected.ok, false);
            assert.equal(watcher.settings.autoUpdateConfig["demo::fixture/web"].time, watcher.settings.defaultScheduledTime);
        }
        const request = { stack: "demo",
            mode: "scheduled",
            preserveExisting: true };
        const preview = await clients.get(watcher)!.timeout(3000).emitWithAck("watcherImageAutoUpdateBulkPreview", request);
        assert.equal(preview.ok, true);
        assert.equal(preview.data.time, watcher.settings.defaultScheduledTime);
        const applied = await clients.get(watcher)!.timeout(3000).emitWithAck("watcherImageAutoUpdateBulkApply", { ...request,
            previewToken: preview.data.previewToken });
        assert.equal(applied.ok, true);
        assert.equal(applied.data.applied, 1);
        assert.equal(watcher.settings.autoUpdateConfig["demo::fixture/app"].time, watcher.settings.defaultScheduledTime);
        assert.equal(watcher.settings.autoUpdateConfig["demo::fixture/db"].time, "00:00");
    }
    assert.equal(instances[0].settings.autoUpdateConfig["demo::fixture/web"].time, "05:30");
    assert.equal(instances[1].settings.autoUpdateConfig["demo::fixture/web"].time, "08:45");
});

test("local HTTP API persists the default and uses it only for new requests without a time", async (t) => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "dockge-http-default-time-"));
    t.after(() => fs.rm(root, { recursive: true,
        force: true }));
    const watcher = new ImageWatcher(root);
    watcher.restart = () => {};
    t.mock.method(ImageWatcher, "getInstance", () => watcher);
    t.mock.method(AuditLogger.getInstance(), "logFromRequest", async () => {});
    const previousAuth = process.env.DOCKGE_AUTH_MODE;
    process.env.DOCKGE_AUTH_MODE = "disabled";
    t.after(() => {
        if (previousAuth === undefined) {
            delete process.env.DOCKGE_AUTH_MODE;
        } else {
            process.env.DOCKGE_AUTH_MODE = previousAuth;
        }
    });
    const app = express();
    app.use(new WatcherRouter().create(app, { config: { dataDir: root } } as DockgeServer));
    const server = createServer(app);
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    t.after(() => new Promise<void>(resolve => server.close(() => resolve())));
    const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/watcher`;
    async function post(route: string, body: unknown) {
        const response = await fetch(url + route, { method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body) });
        return { status: response.status,
            body: await response.json() };
    }
    assert.equal((await post("/image/settings", { defaultScheduledTime: "05:30" })).body.ok, true);
    assert.equal((await (await fetch(url + "/image/auto-update")).json()).data.defaultScheduledTime, "05:30");
    const result = await post("/image/auto-update", { key: "demo::fixture/web",
        mode: "scheduled" });
    assert.equal(result.body.data.time, "05:30");
    assert.equal((await post("/image/auto-update", { key: "demo::fixture/db",
        mode: "scheduled",
        time: "00:00" })).body.data.time, "00:00");
    await post("/image/settings", { defaultScheduledTime: "06:45" });
    assert.equal(watcher.settings.autoUpdateConfig["demo::fixture/web"].time, "05:30");
    assert.equal(watcher.settings.autoUpdateConfig["demo::fixture/db"].time, "00:00");
    assert.equal((await post("/image/auto-update", { key: "demo::fixture/web",
        mode: "scheduled",
        time: "bad" })).status, 400);
    assert.equal(watcher.settings.autoUpdateConfig["demo::fixture/web"].time, "05:30");
});
