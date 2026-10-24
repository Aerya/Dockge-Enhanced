import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import knex, { type Knex } from "knex";
import sqlite from "@louislam/sqlite3";
import { R } from "redbean-node";
import { Server } from "socket.io";
import { io, type Socket } from "socket.io-client";
import { registerScopedAccount } from "./scoped-account";
import { registerTwoFactorHandlers } from "./two-factor-socket";
import { installUserAccessGuard } from "./user-access";
import { up as addFactors } from "./migrations/2026-10-18-0001-two-factor-authentication";
import { up as addRoles } from "./migrations/2026-10-24-0001-scoped-users";
import { generatePasswordHash, verifyPassword } from "./password-hash";
import { totpFor } from "./two-factor-auth";
import { DockgeServer } from "./dockge-server";
import { AuditLogger } from "./audit-log";
import type { DockgeSocket } from "./util-server";

const Dialect = createRequire(import.meta.url)("knex/lib/dialects/sqlite3/index.js") as typeof Knex.Client;
class TestDialect extends Dialect {
    _driver() {
        return sqlite;
    }
}

test("restricted account security is self-only; recovery, password changes, revocation and administrator recovery work", { timeout: 15000 }, async t => {
    const directory = await mkdtemp(path.join(tmpdir(), "scoped-account-"));
    const db = knex({ client: TestDialect,
        connection: { filename: ":memory:" },
        useNullAsDefault: true });
    const descriptor = Object.getOwnPropertyDescriptor(R, "knex");
    Object.defineProperty(R, "knex", { configurable: true,
        value: db });
    t.mock.method(R, "findOne", async (_table: string, _query: string, params: unknown[]) => db("user").where({ id: params[0],
        active: 1 }).first());
    t.mock.method(R, "exec", async (sql: string, bindings: unknown[]) => db.raw(sql, bindings as Knex.RawBinding[]));
    t.mock.method(AuditLogger.getInstance(), "logFromSocket", async () => {});
    const oldMode = process.env.DOCKGE_AUTH_MODE;
    process.env.DOCKGE_AUTH_MODE = "local";
    await db.schema.createTable("user", table => {
        table.increments("id");
        table.string("username");
        table.string("password");
        table.integer("active").defaultTo(1);
        table.boolean("twofa_status").defaultTo(false);
        table.string("twofa_secret");
        table.string("twofa_last_token");
    });
    await addFactors(db);
    await addRoles(db);
    const password = "Strong-fixture-password-42!";
    await db("user").insert([ "admin", "alice", "bob" ].map((username, index) => ({ username,
        password: generatePasswordHash(password),
        role: index ? "restricted" : "admin" })));
    const http = createServer();
    const sockets = new Server(http);
    const clients: Socket[] = [];
    const server = { config: { dataDir: directory },
        jwtSecret: "test-only",
        disconnectAllSocketClients(id: number, current?: string, preserve = false) {
            DockgeServer.prototype.disconnectAllSocketClients.call({ io: sockets } as DockgeServer, id, current, preserve);
        } } as DockgeServer;
    sockets.on("connection", raw => {
        const socket = raw as DockgeSocket;
        // Fixture authentication only; production login is exercised by the smoke test.
        socket.userID = Number(socket.handshake.auth.fixtureUser);
        socket.restrictedUser = socket.userID !== 1;
        installUserAccessGuard(socket);
        registerTwoFactorHandlers(socket, server);
        registerScopedAccount(socket, server);
    });
    await new Promise<void>(resolve => http.listen(0, "127.0.0.1", resolve));
    const address = http.address();
    assert.ok(address && typeof address !== "string");
    const connect = async (id: number) => {
        const socket = io(`http://127.0.0.1:${address.port}`, { reconnection: false,
            auth: { fixtureUser: id } });
        clients.push(socket);
        await new Promise<void>(resolve => socket.once("connect", resolve));
        return socket;
    };
    const request = (socket: Socket, event: string, data = {}) => socket.timeout(2000).emitWithAck(event, data);
    t.after(async () => {
        for (const client of clients) {
            client.disconnect();
        }
        await new Promise<void>(resolve => sockets.close(() => resolve()));
        t.mock.restoreAll();
        if (descriptor) {
            Object.defineProperty(R, "knex", descriptor);
        }
        if (oldMode === undefined) {
            delete process.env.DOCKGE_AUTH_MODE;
        } else {
            process.env.DOCKGE_AUTH_MODE = oldMode;
        }
        await db.destroy();
        await rm(directory, { recursive: true,
            force: true });
    });
    const admin = await connect(1);
    const alice = await connect(2);
    const second = await connect(2);
    const bob = await connect(3);
    assert.equal((await request(alice, "twoFactor:prepare", { password: "wrong" })).ok, false);
    const prepared = await request(alice, "twoFactor:prepare", { password,
        userId: 1 });
    assert.equal(prepared.ok, true);
    const secret = new URL(prepared.uri).searchParams.get("secret")!;
    const enabled = await request(alice, "twoFactor:enable", { password,
        code: totpFor(secret).generate(),
        userId: 1 });
    assert.equal(enabled.ok, true);
    assert.equal(enabled.recoveryCodes.length, 10);
    assert.equal((await db("user").where({ id: 1 }).first()).twofa_status, 0);
    assert.equal((await request(bob, "twoFactor:status", { userId: 2 })).enabled, false);
    assert.equal((await request(alice, "usersAccountAction", { id: 3,
        action: "delete",
        confirm: true,
        password })).ok, false);
    const newPassword = "Different-fixture-password-43!";
    assert.equal((await request(alice, "scopedPassword", { currentPassword: password,
        newPassword })).ok, false);
    const changed = await request(alice, "scopedPassword", { id: 1,
        currentPassword: password,
        newPassword,
        code: enabled.recoveryCodes[0] });
    assert.equal(changed.ok, true);
    assert.ok(changed.token);
    assert.equal(verifyPassword(newPassword, (await db("user").where({ id: 2 }).first()).password), true);
    assert.equal(verifyPassword(password, (await db("user").where({ id: 1 }).first()).password), true);
    assert.equal(second.connected, false);
    assert.equal((await request(alice, "twoFactor:disable", { password: newPassword,
        code: enabled.recoveryCodes[0] })).ok, false, "used recovery code cannot replay");
    assert.equal((await request(admin, "usersAccountAction", { id: 1,
        action: "reset2fa",
        password,
        confirm: true })).ok, false);
    assert.equal((await request(admin, "usersAccountAction", { id: 2,
        action: "reset2fa",
        password,
        confirm: false })).ok, false);
    assert.equal((await request(admin, "usersAccountAction", { id: 2,
        action: "reset2fa",
        password,
        confirm: true })).ok, true);
    const reset = await db("user").where({ id: 2 }).first();
    assert.equal(reset.twofa_status, 0);
    assert.equal(reset.twofa_secret_encrypted, null);
    assert.equal(reset.twofa_recovery_hashes, null);
    assert.equal((await request(admin, "usersAccountAction", { id: 2,
        action: "delete",
        password: "wrong",
        confirm: true })).ok, false);
    assert.equal((await request(admin, "usersAccountAction", { id: 2,
        action: "delete",
        password,
        confirm: true })).ok, true);
    assert.equal(await db("user").where({ id: 2 }).first(), undefined);
    assert.equal(Number((await db("user").count("id as count").first())!.count), 2);
});
