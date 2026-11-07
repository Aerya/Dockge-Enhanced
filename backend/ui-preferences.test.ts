import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createServer } from "node:http";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import knex, { type Knex } from "knex";
import sqlite from "@louislam/sqlite3";
import { R } from "redbean-node";
import { Server } from "socket.io";
import { io } from "socket.io-client";
import { up, down } from "./migrations/2026-11-07-0001-ui-preferences";
import { UiPreferencesStore } from "./ui-preferences";
import { CATALOG_SOURCES } from "./catalog-sources";
import { CATALOG_IDS } from "../common/ui-preferences";
import { UiPreferencesSocketHandler } from "./socket-handlers/ui-preferences-socket-handler";
import { installUserAccessGuard } from "./user-access";
import type { DockgeSocket } from "./util-server";
import type { DockgeServer } from "./dockge-server";

const Dialect = createRequire(import.meta.url)("knex/lib/dialects/sqlite3/index.js") as typeof Knex.Client;
class TestDialect extends Dialect {
    _driver() {
        return sqlite;
    }
}
const preferences = { hiddenNavigation: [ "files", "console" ],
    disabledCatalogSources: [ "umbrel" ] };

test("all built-in catalogs can be enabled or disabled", () => {
    assert.deepEqual(CATALOG_IDS, CATALOG_SOURCES.map(source => source.id));
});

test("database preferences persist, isolate accounts, reject stale writes and protect fixed links", async t => {
    const dir = await mkdtemp(path.join(tmpdir(), "ui-preferences-"));
    const config = { client: TestDialect,
        connection: { filename: path.join(dir, "test.db") },
        useNullAsDefault: true };
    let db = knex(config);
    t.after(async () => {
        await db.destroy();
        await rm(dir, { recursive: true,
            force: true });
    });
    await db.schema.createTable("user", table => table.increments("id"));
    await db("user").insert([{ id: 1 }, { id: 2 }]);
    await up(db);
    let store = new UiPreferencesStore(db);
    assert.deepEqual((await store.load(1)).preferences, { hiddenNavigation: [],
        disabledCatalogSources: [] });
    const writes = await Promise.allSettled([ store.save(1, { revision: 0,
        preferences }), store.save(1, { revision: 0,
        preferences }) ]);
    assert.equal(writes.filter(value => value.status === "fulfilled").length, 1);
    assert.equal(writes.filter(value => value.status === "rejected").length, 1);
    await db.destroy();
    db = knex(config);
    store = new UiPreferencesStore(db);
    assert.deepEqual((await store.load(1)).preferences, preferences);
    assert.deepEqual((await store.load(2)).preferences, { hiddenNavigation: [],
        disabledCatalogSources: [] });
    for (const hiddenNavigation of [[ "home" ], [ "enhanced" ], [ "files", "files" ], [ "unknown" ]]) {
        await assert.rejects(store.save(1, { revision: 1,
            preferences: { ...preferences,
                hiddenNavigation } }), /invalid/);
    }
    await assert.rejects(store.save(1, { revision: 1,
        preferences: { ...preferences,
            disabledCatalogSources: [ "https://example.org" ] } }), /invalid/);
    await assert.rejects(store.save(1, { revision: 0,
        preferences }), /conflict/);
    await down(db);
    assert.equal(await db.schema.hasTable("ui_preferences"), false);
});

test("real sockets enforce account ownership, active users and federation boundaries", async t => {
    const db = knex({ client: TestDialect,
        connection: { filename: ":memory:" },
        useNullAsDefault: true });
    await db.schema.createTable("user", table => {
        table.increments("id");
        table.string("role");
        table.integer("active");
    });
    await db("user").insert([{ id: 1,
        role: "admin",
        active: 1 }, { id: 2,
        role: "admin",
        active: 1 }, { id: 3,
        role: "restricted",
        active: 1 }]);
    await up(db);
    const descriptor = Object.getOwnPropertyDescriptor(R, "knex");
    Object.defineProperty(R, "knex", { configurable: true,
        value: db });
    t.mock.method(R, "findOne", async (_table: string, _query: string, params: unknown[]) => db("user").where({ id: params[0],
        active: 1 }).first());
    const http = createServer();
    const server = new Server(http);
    const clients: ReturnType<typeof io>[] = [];
    t.after(async () => {
        clients.forEach(client => client.close());
        await new Promise<void>(resolve => server.close(() => resolve()));
        if (descriptor) {
            Object.defineProperty(R, "knex", descriptor);
        }
        await db.destroy();
    });
    server.on("connection", socket => {
        const dockge = socket as DockgeSocket;
        dockge.userID = Number(socket.handshake.auth.userID);
        dockge.endpoint = socket.handshake.auth.endpoint || "";
        installUserAccessGuard(dockge);
        new UiPreferencesSocketHandler().create(dockge, { io: server } as DockgeServer);
    });
    http.listen(0, "127.0.0.1");
    await once(http, "listening");
    async function connect(userID: number, endpoint = "") {
        const client = io(`http://127.0.0.1:${(http.address() as AddressInfo).port}`, { auth: { userID,
            endpoint },
        transports: [ "websocket" ] });
        clients.push(client);
        await new Promise<void>(resolve => client.once("connect", () => resolve()));
        return client;
    }
    const first = await connect(1);
    const second = await connect(1);
    const other = await connect(2);
    const restricted = await connect(3);
    const anonymous = await connect(0);
    const agent = await connect(1, "remote");
    let otherEvents = 0;
    other.on("uiPreferences:changed", () => otherEvents++);
    const changed = new Promise<void>(resolve => second.once("uiPreferences:changed", () => resolve()));
    const saved = await first.timeout(2000).emitWithAck("uiPreferences:save", { userId: 2,
        revision: 0,
        preferences });
    assert.equal(saved.ok, true);
    await changed;
    assert.deepEqual((await second.timeout(2000).emitWithAck("uiPreferences:get")).config.preferences, preferences);
    assert.equal((await other.timeout(2000).emitWithAck("uiPreferences:get")).config.preferences.hiddenNavigation.length, 0);
    assert.equal(otherEvents, 0);
    for (const client of [ restricted, anonymous, agent ]) {
        assert.equal((await client.timeout(2000).emitWithAck("uiPreferences:get")).ok, false);
        assert.equal((await client.timeout(2000).emitWithAck("uiPreferences:save", { revision: 0,
            preferences })).ok, false);
    }
    await db("user").where({ id: 1 }).update({ active: 0 });
    assert.equal((await first.timeout(2000).emitWithAck("uiPreferences:get")).ok, false);
});
