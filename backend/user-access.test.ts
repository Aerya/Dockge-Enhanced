import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { Server } from "socket.io";
import { io } from "socket.io-client";
import type { DockgeSocket } from "./util-server";
import { accessFromUser, installUserAccessGuard } from "./user-access";
import { canAccess, normalizeGrants, type UserAccess } from "../common/user-access";
import { parseScopedRequest, scopedResponse } from "./scoped-users";
import { createRequire } from "node:module";
import knex, { type Knex } from "knex";
import sqlite from "@louislam/sqlite3";
import { up, down } from "./migrations/2026-10-24-0001-scoped-users";

const SqliteDialect = createRequire(import.meta.url)("knex/lib/dialects/sqlite3/index.js") as typeof Knex.Client;
class TestDialect extends SqliteDialect {
    _driver() {
        return sqlite;
    }
}

test("migration preserves existing administrator credentials and rolls back only access columns", async () => {
    const db = knex({ client: TestDialect,
        connection: { filename: ":memory:" },
        useNullAsDefault: true });
    try {
        await db.schema.createTable("user", table => {
            table.increments("id");
            table.string("username");
            table.string("password");
        });
        await db("user").insert({ username: "existing",
            password: "existing-hash" });
        await up(db);
        const user = await db("user").first();
        assert.equal(user.password, "existing-hash");
        assert.equal(user.role, "admin");
        assert.equal(user.stack_grants, "[]");
        await down(db);
        assert.deepEqual(await db("user").first(), { id: 1,
            username: "existing",
            password: "existing-hash" });
    } finally {
        await db.destroy();
    }
});

const grants = normalizeGrants([{ endpoint: "node:5001",
    stack: "app",
    permissions: [ "view", "logs", "restart" ] }]);

test("permissions match both endpoint and stack, never wildcard or prefix", () => {
    const access: UserAccess = { role: "restricted",
        grants };
    assert.equal(canAccess(access, "node:5001", "app", "restart"), true);
    for (const [ endpoint, stack, permission ] of [
        [ "", "app", "restart" ], [ "other:5001", "app", "logs" ], [ "node:5001", "app-extra", "logs" ],
        [ "node:5001", "app", "update" ], [ "*", "app", "view" ],
    ] as const) {
        assert.equal(canAccess(access, endpoint, stack, permission), false);
    }
    assert.deepEqual(accessFromUser({ role: "restricted",
        stack_grants: "invalid" }).grants, []);
    assert.equal(accessFromUser({ role: "unknown",
        stack_grants: "[]" }).role, "restricted");
    assert.equal(accessFromUser({ role: "admin" }).role, "admin");
});

test("malformed grants and command injection cannot expand access", () => {
    for (const stack of [ "../secret", "/etc", "app;id", "*", "-x", "app\nsecret" ]) {
        assert.throws(() => normalizeGrants([{ endpoint: "",
            stack,
            permissions: [ "view" ] }]));
    }
    assert.throws(() => normalizeGrants([{ endpoint: "",
        stack: "app",
        permissions: [ "edit", "view" ] }]));
    assert.throws(() => normalizeGrants([ ...grants, ...grants ]));
    assert.throws(() => parseScopedRequest({ endpoint: "",
        stack: "app",
        permission: "delete" }));
    assert.throws(() => parseScopedRequest(null));
});

test("linked responses cannot expose Compose, environment, credentials or unbounded logs", () => {
    const request = { endpoint: "peer:5001",
        stack: "allowed",
        permission: "view" } as const;
    assert.deepEqual(scopedResponse(request, { name: "forged",
        status: 1,
        composeYAML: "SECRET",
        env: "SECRET",
        credentials: "SECRET" }), { name: "allowed",
        status: 1,
        displayName: "allowed" });
    assert.deepEqual(scopedResponse({ ...request,
        permission: "restart" }, { applied: true,
        secret: "SECRET" }), { applied: true });
    assert.throws(() => scopedResponse(request, { status: "invalid" }));
    assert.throws(() => scopedResponse({ ...request,
        permission: "logs" }, { logs: "x".repeat(1024 * 1024 + 1) }));
});

test("real Socket.IO default-deny blocks sensitive and future events, emissions and revoked sessions", { timeout: 15000 }, async () => {
    const http = createServer();
    const server = new Server(http);
    let revoked = false;
    let dispatched = 0;
    const sensitive = [ "agent", "getSettings", "setSettings", "usersSave", "usersList", "createAgentFederationToken", "createReverseAgent", "terminalInput", "fileRead", "unknownFutureHandler", "changePassword", "setUILocale" ];
    server.on("connection", raw => {
        const socket = raw as DockgeSocket;
        socket.userID = 2;
        socket.restrictedUser = true;
        installUserAccessGuard(socket, async () => {
            if (revoked) {
                throw new Error("revoked");
            }
            return { role: "restricted",
                grants };
        });
        for (const event of sensitive) {
            socket.on(event, (...args) => {
                dispatched++;
                const ack = args.at(-1);
                if (typeof ack === "function") {
                    ack({ ok: true });
                }
            });
        }
        socket.on("scopedList", callback => {
            socket.emit("agent", "stackList", { secret: "must-not-leak" });
            socket.emit("terminalWrite", "console", "must-not-leak");
            callback({ ok: true,
                data: grants });
        });
    });
    http.listen(0, "127.0.0.1");
    await once(http, "listening");
    const client = io(`http://127.0.0.1:${(http.address() as AddressInfo).port}`, { reconnection: false });
    const received: string[] = [];
    client.onAny(event => received.push(event));
    try {
        await new Promise<void>(resolve => client.once("connect", () => resolve()));
        for (const event of sensitive) {
            const result = await client.timeout(2000).emitWithAck(event, "forged", "payload");
            assert.equal(result.ok, false, event);
        }
        assert.equal(dispatched, 0);
        assert.equal((await client.timeout(2000).emitWithAck("scopedList")).ok, true);
        assert.deepEqual(received, []);
        revoked = true;
        assert.equal((await client.timeout(2000).emitWithAck("scopedList")).ok, false);
    } finally {
        client.disconnect();
        await new Promise<void>(resolve => server.close(() => resolve()));
    }
});
