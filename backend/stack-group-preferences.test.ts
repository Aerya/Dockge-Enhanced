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
import { up, down } from "./migrations/2026-11-05-0001-stack-group-preferences";
import { StackGroupPreferencesStore } from "./stack-group-preferences";
import { StackGroupsSocketHandler } from "./socket-handlers/stack-groups-socket-handler";
import { installUserAccessGuard } from "./user-access";
import type { DockgeSocket } from "./util-server";
import type { DockgeServer } from "./dockge-server";
import { importStackGroups, parseStackGroups, stackIdentity } from "../common/stack-groups";

const Dialect = createRequire(import.meta.url)("knex/lib/dialects/sqlite3/index.js") as typeof Knex.Client;
class TestDialect extends Dialect {
    _driver() {
        return sqlite;
    }
}
const preferences = { enabled: true,
    groups: [{ id: "web",
        name: "Web",
        collapsed: false,
        members: [ stackIdentity({ name: "demo" }), stackIdentity({ name: "demo",
            endpoint: "agent.example" }) ] }] };

test("database preferences persist, isolate users and atomically reject concurrent stale writes", async t => {
    const dir = await mkdtemp(path.join(tmpdir(), "stack-groups-"));
    const config = { client: TestDialect,
        connection: { filename: path.join(dir, "test.db") },
        useNullAsDefault: true };
    let db = knex(config);
    t.after(async () => {
        await db.destroy();
        await rm(dir, { recursive: true,
            force: true });
    });
    await db.raw("PRAGMA foreign_keys = ON");
    await db.schema.createTable("user", table => table.increments("id"));
    await db("user").insert([{ id: 1 }, { id: 2 }]);
    await up(db);
    let store = new StackGroupPreferencesStore(db);
    const concurrentDb = knex(config);
    await concurrentDb.raw("PRAGMA busy_timeout = 5000");
    t.after(() => concurrentDb.destroy());
    const writes = await Promise.allSettled([
        store.save(1, { revision: 0,
            preferences }),
        new StackGroupPreferencesStore(concurrentDb).save(1, { revision: 0,
            preferences }),
    ]);
    assert.equal(writes.filter(result => result.status === "fulfilled").length, 1);
    assert.match(String((writes.find(result => result.status === "rejected") as PromiseRejectedResult).reason), /conflict/);
    assert.deepEqual((await store.load(2)).preferences, parseStackGroups(null));
    await db.destroy();
    db = knex(config);
    store = new StackGroupPreferencesStore(db);
    assert.deepEqual(await store.load(1), { revision: 1,
        preferences });
    await assert.rejects(store.save(1, { revision: 0,
        preferences }), /conflict/);
    await assert.rejects(store.save(1, { revision: 1,
        preferences: { enabled: true,
            groups: "bad" } }), /invalid/);
    await assert.rejects(store.save(1, { revision: 1,
        preferences: { ...preferences,
            extra: "x".repeat(300000) } }), /invalid/);
    assert.equal((await store.load(1)).revision, 1);
    await store.save(1, { revision: 1,
        preferences: parseStackGroups(null) });
    assert.equal((await store.load(1)).revision, 2);
    await db.raw("PRAGMA foreign_keys = ON");
    await db("user").where({ id: 1 }).delete();
    assert.equal(await db("stack_group_preferences").where({ user_id: 1 }).first(), undefined);
    await down(db);
    assert.equal(await db.schema.hasTable("stack_group_preferences"), false);
});

test("legacy import preserves server groups and assignments, is idempotent and refuses overflow", () => {
    const legacy = structuredClone(preferences);
    legacy.groups[0].name = "Old name";
    legacy.groups[0].members.push(stackIdentity({ name: "other" }));
    const merged = importStackGroups(preferences, legacy);
    assert.equal(merged.groups[0].name, "Web");
    assert.equal(merged.groups[0].members.length, 3);
    assert.deepEqual(importStackGroups(merged, legacy), merged);
    const full = { enabled: true,
        groups: Array.from({ length: 100 }, (_, i) => ({ id: String(i),
            name: String(i),
            collapsed: false,
            members: [] })) };
    assert.throws(() => importStackGroups(full, legacy), /importLimit/);
    assert.equal(full.groups.length, 100);
});

test("nested preferences persist in SQLite and invalid parent writes leave the saved hierarchy intact", async t => {
    const db = knex({ client: TestDialect,
        connection: { filename: ":memory:" },
        useNullAsDefault: true });
    t.after(() => db.destroy());
    await db.schema.createTable("user", table => table.increments("id"));
    await db("user").insert({ id: 1 });
    await up(db);
    const store = new StackGroupPreferencesStore(db);
    const nested = { enabled: true,
        groups: [
            { id: "root",
                name: "Root",
                collapsed: true,
                members: [] },
            { ...preferences.groups[0],
                parentId: "root" },
        ] };
    await store.save(1, { revision: 0,
        preferences: nested });
    assert.deepEqual((await new StackGroupPreferencesStore(db).load(1)).preferences, nested);
    for (const parentId of [ "web", "missing" ]) {
        await assert.rejects(store.save(1, { revision: 1,
            preferences: { ...nested,
                groups: nested.groups.map(group => ({ ...group,
                    parentId })) } }), /invalid/);
    }
    assert.deepEqual(await store.load(1), { revision: 1,
        preferences: nested });
    assert.deepEqual((await store.load(2)).preferences.groups, []);
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
        new StackGroupsSocketHandler().create(dockge, { io: server } as DockgeServer);
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
    other.on("stackGroups:changed", () => otherEvents++);
    const changed = new Promise<void>(resolve => second.once("stackGroups:changed", () => resolve()));
    const saved = await first.timeout(2000).emitWithAck("stackGroups:save", { userId: 2,
        revision: 0,
        preferences });
    assert.equal(saved.ok, true);
    await changed;
    assert.deepEqual((await second.timeout(2000).emitWithAck("stackGroups:get")).config.preferences, preferences);
    assert.equal((await other.timeout(2000).emitWithAck("stackGroups:get")).config.preferences.groups.length, 0);
    assert.equal(otherEvents, 0);
    for (const client of [ restricted, anonymous, agent ]) {
        assert.equal((await client.timeout(2000).emitWithAck("stackGroups:get")).ok, false);
        assert.equal((await client.timeout(2000).emitWithAck("stackGroups:save", { revision: 0,
            preferences })).ok, false);
    }
    await db("user").where({ id: 1 }).update({ active: 0 });
    assert.equal((await first.timeout(2000).emitWithAck("stackGroups:get")).ok, false);
});
