import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import knex from "knex";
// @ts-ignore Knex's custom SQLite driver is also used by Database.
import Dialect from "knex/lib/dialects/sqlite3/index.js";
import sqlite from "@louislam/sqlite3";
import { Server } from "socket.io";
import { io, type Socket } from "socket.io-client";
import jwt from "jsonwebtoken";
import { R } from "redbean-node";
import { MainSocketHandler } from "./socket-handlers/main-socket-handler";
import { DockgeServer } from "./dockge-server";
import type { DockgeSocket } from "./util-server";
import { generatePasswordHash } from "./password-hash";
import { Settings } from "./settings";
import { loginRateLimiter, twoFaRateLimiter } from "./rate-limiter";
import { up } from "./migrations/2026-10-18-0001-two-factor-authentication";
import { totpFor } from "./two-factor-auth";
import { reserveAccountSecurity } from "./account-security";

interface Reply {
    ok?: boolean;
    tokenRequired?: boolean;
    challenge?: string;
    token?: string;
    uri?: string;
    recoveryCodes?: string[];
    enabled?: boolean;
    recoveryRemaining?: number;
    msg?: string;
}
function request(socket: Socket, event: string, data: unknown): Promise<Reply> {
    return new Promise((resolve, reject) => {
        socket.timeout(3000).emit(event, data, (error: Error | null, reply: Reply) => error ? reject(error) : resolve(reply));
    });
}
function event(socket: Socket, name: "connect" | "disconnect"): Promise<void> {
    return new Promise(resolve => socket.once(name, () => resolve()));
}
test("actual Socket.IO enrollment, login, recovery and session revocation", { timeout: 30_000 }, async t => {
    const oldMode = process.env.DOCKGE_AUTH_MODE;
    process.env.DOCKGE_AUTH_MODE = "local";
    const directory = await mkdtemp(path.join(tmpdir(), "dockge-totp-socket-"));
    Dialect.prototype._driver = () => sqlite;
    const db = knex({ client: Dialect,
        connection: { filename: path.join(directory, "test.db") },
        useNullAsDefault: true });
    const descriptor = Object.getOwnPropertyDescriptor(R, "knex");
    const originalFindOne = R.findOne;
    const originalSettings = Settings.getSettings;
    const originalLoginLimit = loginRateLimiter.pass;
    const originalFactorLimit = twoFaRateLimiter.pass;
    let captchaRequired = false;
    let rateChecks = 0;
    let pauseUserRead: (() => Promise<void>) | undefined;
    Object.defineProperty(R, "knex", { configurable: true,
        value: db });
    R.findOne = (async (_table: string, query: string, params: unknown[]) => {
        const user = await db("user").where(query.includes("username") ? "username" : "id", String(params[0])).andWhere("active", 1).first();
        if (query.includes("username")) {
            await pauseUserRead?.();
        }
        return user;
    }) as typeof R.findOne;
    Settings.getSettings = (async () => ({ turnstileEnabled: captchaRequired,
        turnstileSecret: captchaRequired ? "fixture-only" : "" })) as typeof Settings.getSettings;
    loginRateLimiter.pass = async () => {
        rateChecks++;
        return true;
    };
    twoFaRateLimiter.pass = async () => {
        rateChecks++;
        return true;
    };
    await db.schema.createTable("user", table => {
        table.increments("id");
        table.string("username");
        table.string("password");
        table.integer("active").defaultTo(1);
        table.boolean("twofa_status").defaultTo(false);
        table.string("twofa_secret");
        table.string("twofa_last_token");
    });
    const password = "Fixture-only-password-42!";
    await db("user").insert({ username: "fixture",
        password: generatePasswordHash(password) });
    await up(db);
    const http = createServer();
    const sockets = new Server(http);
    const clients: Socket[] = [];
    const server = {
        config: { dataDir: directory },
        jwtSecret: "fixture-only-secret",
        getClientIP: async () => "127.0.0.1",
        afterLogin: async (socket: DockgeSocket, user: { id: number }) => {
            socket.userID = user.id;
        },
        disconnectAllSocketClients: (id: number, current: string, preserveFederation = false) => {
            DockgeServer.prototype.disconnectAllSocketClients.call({ io: sockets } as DockgeServer, id, current, preserveFederation);
        },
    } as unknown as DockgeServer;
    sockets.on("connection", socket => new MainSocketHandler().create(socket as DockgeSocket, server));
    await new Promise<void>(resolve => http.listen(0, "127.0.0.1", resolve));
    const address = http.address();
    assert.ok(address && typeof address !== "string");
    const connect = async () => {
        const socket = io(`http://127.0.0.1:${address.port}`, { reconnection: false });
        clients.push(socket);
        await event(socket, "connect");
        return socket;
    };
    t.after(async () => {
        for (const client of clients) {
            client.disconnect();
        }
        await new Promise<void>(resolve => sockets.close(() => resolve()));
        R.findOne = originalFindOne;
        Settings.getSettings = originalSettings;
        loginRateLimiter.pass = originalLoginLimit;
        twoFaRateLimiter.pass = originalFactorLimit;
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
    const credentials = { username: "fixture",
        password };
    const owner = await connect();
    const stranger = await connect();
    assert.equal((await request(stranger, "twoFactor:prepare", { password })).ok, false);
    const login = await request(owner, "login", credentials);
    assert.equal(login.ok, true);
    const other = await connect();
    assert.equal((await request(other, "loginByToken", login.token)).ok, true);
    assert.equal((await request(owner, "twoFactor:prepare", { password: "wrong" })).ok, false);
    const prepared = await request(owner, "twoFactor:prepare", { password });
    assert.equal(prepared.ok, true);
    const secret = new URL(prepared.uri!).searchParams.get("secret")!;
    assert.equal((await request(owner, "twoFactor:enable", { password,
        code: "invalid" })).ok, false);
    const disconnected = event(other, "disconnect");
    const existingFederation = await connect();
    const scopedToken = jwt.sign({ scope: "federation",
        userId: 1,
        username: "fixture" }, server.jwtSecret);
    const releaseSecurity = reserveAccountSecurity(1);
    try {
        assert.equal((await request(existingFederation, "loginByToken", scopedToken)).ok, true);
    } finally {
        releaseSecurity();
    }
    // Spoofing an agent endpoint must not protect an interactive session.
    (sockets.sockets.sockets.get(other.id!) as DockgeSocket).endpoint = "spoofed-agent:5001";
    // Both credentials and old JWT have been read before enrollment commits,
    // but neither socket has been registered yet. They must not escape revocation.
    const racingPassword = await connect();
    const racingToken = await connect();
    let resumeReads!: () => void;
    let readsReady!: () => void;
    const resume = new Promise<void>(resolve => {
        resumeReads = resolve;
    });
    const ready = new Promise<void>(resolve => {
        readsReady = resolve;
    });
    let reads = 0;
    pauseUserRead = async () => {
        if (++reads === 2) {
            readsReady();
        }
        await resume;
    };
    const passwordAttempt = request(racingPassword, "login", credentials);
    const tokenAttempt = request(racingToken, "loginByToken", login.token);
    await ready;
    const enabled = await request(owner, "twoFactor:enable", { password,
        code: totpFor(secret).generate() });
    assert.equal(enabled.ok, true);
    assert.equal((await request(existingFederation, "twoFactor:status", {})).ok, true);
    pauseUserRead = undefined;
    resumeReads();
    assert.equal((await passwordAttempt).ok, false);
    assert.equal((await tokenAttempt).ok, false);
    assert.equal((await request(racingPassword, "twoFactor:status", {})).ok, false);
    assert.equal((await request(racingToken, "twoFactor:status", {})).ok, false);
    await disconnected;
    assert.equal(enabled.recoveryCodes?.length, 10);
    const federationClient = await connect();
    const federationToken = jwt.sign({ scope: "federation",
        userId: 1,
        username: "fixture" }, server.jwtSecret);
    assert.equal((await request(federationClient, "loginByToken", federationToken)).ok, true);
    assert.equal((jwt.decode(enabled.token!) as { twoFaVersion: number }).twoFaVersion, 1);
    const status = await request(owner, "twoFactor:status", {});
    assert.deepEqual(status, { ok: true,
        enabled: true,
        recoveryRemaining: 10 });
    process.env.DOCKGE_AUTH_MODE = "disabled";
    assert.equal((await request(owner, "twoFactor:prepare", { password })).ok, false);
    process.env.DOCKGE_AUTH_MODE = "trusted-proxy";
    assert.equal((await request(owner, "twoFactor:status", {})).ok, false);
    process.env.DOCKGE_AUTH_MODE = "local";
    const totpClient = await connect();
    const totpChallenge = await request(totpClient, "login", credentials);
    const nextCode = totpFor(secret).generate({ timestamp: Date.now() + 30_000 });
    assert.equal((await request(totpClient, "login", { ...credentials,
        challenge: totpChallenge.challenge,
        token: nextCode })).ok, true);
    const foreignChallengeClient = await connect();
    assert.equal((await request(foreignChallengeClient, "login", { ...credentials,
        challenge: totpChallenge.challenge,
        token: enabled.recoveryCodes![0] })).msg, "twoFactor.restartLogin");
    assert.equal((await request(stranger, "loginByToken", login.token)).ok, false);
    assert.equal((await request(stranger, "login", { ...credentials,
        password: "wrong" })).ok, false);
    const challenge = await request(stranger, "login", credentials);
    assert.equal(challenge.tokenRequired, true);
    assert.equal((await request(stranger, "twoFactor:status", {})).ok, false);
    assert.equal((await request(stranger, "login", { ...credentials,
        challenge: challenge.challenge,
        token: "invalid" })).ok, false);
    // A supplied OTP cannot bypass CAPTCHA without a server-issued first-step challenge.
    captchaRequired = true;
    const attacker = await connect();
    assert.equal((await request(attacker, "login", { ...credentials,
        token: enabled.recoveryCodes![0] })).msg, "authTurnstileFailed");
    const recovered = await request(stranger, "login", { ...credentials,
        challenge: challenge.challenge,
        token: enabled.recoveryCodes![0] });
    assert.equal(recovered.ok, true);
    captchaRequired = false;
    assert.equal((await request(stranger, "twoFactor:status", {})).recoveryRemaining, 9);
    const newChallenge = await request(attacker, "login", credentials);
    assert.equal((await request(attacker, "login", { ...credentials,
        challenge: newChallenge.challenge,
        token: enabled.recoveryCodes![0] })).ok, false);
    const revoked = event(stranger, "disconnect");
    const disabled = await request(owner, "twoFactor:disable", { password,
        code: enabled.recoveryCodes![1] });
    assert.equal(disabled.ok, true);
    assert.equal(disabled.enabled, false);
    await revoked;
    assert.equal((await request(existingFederation, "twoFactor:status", {})).ok, true);
    const federationReconnect = await connect();
    assert.equal((await request(federationReconnect, "loginByToken", federationToken)).ok, true);
    assert.equal((await request(attacker, "loginByToken", recovered.token)).ok, false);
    assert.equal((await request(attacker, "login", credentials)).ok, true);
    assert.ok(rateChecks > 10);
});
