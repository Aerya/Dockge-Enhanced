import test, { mock } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { once } from "node:events";
import { Server } from "socket.io";
import { io } from "socket.io-client";
import jwt from "jsonwebtoken";
import knex from "knex";
// @ts-ignore Same custom driver as Database.
import Dialect from "knex/lib/dialects/sqlite3/index.js";
import sqlite from "@louislam/sqlite3";
import { R } from "redbean-node";
import { AgentManager } from "./agent-manager";
import type { Agent } from "./models/agent";
import type { DockgeServer } from "./dockge-server";
import type { DockgeSocket } from "./util-server";
import { installReverseHub, newReverseCredential, reverseCredentialMatches, reverseHubURL, startReverseNode, stopReverseNode } from "./reverse-agent";

test("reverse credentials are unique, scoped identifiers with constant-length hashes", () => {
    const first = newReverseCredential();
    const second = newReverseCredential();
    assert.notEqual(first.token, second.token);
    assert.equal(first.hash.length, 64);
    assert.equal(reverseCredentialMatches(first.token, first.hash), true);
    assert.equal(reverseCredentialMatches(second.token, first.hash), false);
    assert.equal(reverseCredentialMatches(undefined, first.hash), false);
    assert.equal(reverseCredentialMatches(first.token, "not-a-hash"), false);
    assert.equal(reverseHubURL("https://hub.example.org/"), "https://hub.example.org");
    for (const url of [ "file:///etc/passwd", "https://user:secret@hub.example.org", "https://hub.example.org/?token=secret", "https://hub.example.org/path" ]) {
        assert.throws(() => reverseHubURL(url));
    }
});

async function until(condition: () => boolean): Promise<void> {
    const deadline = Date.now() + 8000;
    while (!condition()) {
        assert.ok(Date.now() < deadline, "Timed out waiting for reverse transport");
        await new Promise(resolve => setTimeout(resolve, 20));
    }
}

test("real reverse node transports authenticated RPCs, stack events and terminal output without hub access to its listener", { timeout: 20000 }, async () => {
    const hubHttp = createServer();
    const nodeHttp = createServer();
    const hub = new Server(hubHttp);
    const node = new Server(nodeHttp);
    const credential = newReverseCredential();
    const endpoint = credential.id;
    let revoked = false;
    installReverseHub(hub, async token => {
        if (revoked || !reverseCredentialMatches(token, credential.hash)) {
            throw new Error("Rejected");
        }
        return { endpoint,
            display_name: "Remote host" } as unknown as Agent;
    });
    hubHttp.listen(0, "127.0.0.1");
    nodeHttp.listen(0, "127.0.0.1");
    await Promise.all([ once(hubHttp, "listening"), once(nodeHttp, "listening") ]);
    const hubURL = `http://127.0.0.1:${(hubHttp.address() as AddressInfo).port}`;
    const nodePort = (nodeHttp.address() as AddressInfo).port;
    const user = { id: 1,
        active: 1,
        username: "test-admin" };
    const secret = "isolated-node-test-key";
    const received: unknown[][] = [];
    node.on("connection", socket => {
        socket.on("loginByToken", (token, ack) => {
            const decoded = jwt.verify(token, secret) as { scope: string;
                userId: number };
            assert.equal(decoded.scope, "federation");
            assert.equal(decoded.userId, user.id);
            socket.data.authenticated = true;
            ack({ ok: true });
        });
        socket.on("agent", (target, event, ...args) => {
            assert.equal(socket.data.authenticated, true);
            assert.equal(target, endpoint);
            received.push([ target, event, ...args.filter(arg => typeof arg !== "function") ]);
            const ack = args.at(-1);
            if (event === "requestStackList") {
                socket.emit("agent", "stackList", { ok: true,
                    endpoint: "spoofed",
                    stackList: { app: { name: "app",
                        endpoint: "spoofed" } } });
            }
            if (event === "logs") {
                socket.emit("agent", "terminalWrite", `combined-${endpoint}-app`, "ready\n");
                socket.emit("agent", "terminalWrite", "combined-other-agent-app", "spoofed\n");
                socket.emit("agent", "terminalWrite", "console", "spoofed console\n");
            }
            if (typeof ack === "function") {
                ack({ ok: true,
                    event,
                    result: args[0] });
            }
        });
    });
    const env = { hub: process.env.DOCKGE_REVERSE_HUB_URL,
        token: process.env.DOCKGE_REVERSE_TOKEN,
        file: process.env.DOCKGE_REVERSE_TOKEN_FILE };
    process.env.DOCKGE_REVERSE_HUB_URL = hubURL;
    process.env.DOCKGE_REVERSE_TOKEN = credential.token;
    delete process.env.DOCKGE_REVERSE_TOKEN_FILE;
    Dialect.prototype._driver = () => sqlite;
    const db = knex({ client: Dialect,
        connection: { filename: ":memory:" },
        useNullAsDefault: true });
    await db.schema.createTable("user", table => {
        table.increments("id");
        table.string("username");
        table.boolean("active");
    });
    await db("user").insert(user);
    const descriptor = Object.getOwnPropertyDescriptor(R, "knex");
    Object.defineProperty(R, "knex", { configurable: true,
        value: db });
    mock.method(AgentManager.prototype, "sendAgentList", async () => {});
    const broadcasts: unknown[][] = [];
    const subscriber = { connected: true,
        endpoint: "",
        emit: (...args: unknown[]) => broadcasts.push(args) } as unknown as DockgeSocket;
    const manager = new AgentManager(subscriber);
    manager.subscribe();
    const invalid = io(`${hubURL}/reverse-agent`, { auth: { token: "wrong" },
        reconnection: false });
    try {
        const error = await new Promise<Error>(resolve => invalid.once("connect_error", resolve));
        assert.match(error.message, /authentication failed/);
        startReverseNode({ config: { hostname: "127.0.0.1",
            port: nodePort },
        needSetup: false,
        jwtSecret: secret } as DockgeServer);
        await until(() => AgentManager.connectionFailure(endpoint) === null && broadcasts.some(row => row[1] === "stackList"));
        const result = await manager.requestEndpoint<{ ok: boolean;
            result: string }>(endpoint, "inspect", "app");
        assert.equal(result.ok, true);
        assert.equal(result.result, "app");
        await manager.requestEndpoint(endpoint, "logs");
        await until(() => broadcasts.some(row => row[1] === "terminalWrite"));
        const list = broadcasts.find(row => row[1] === "stackList")![2] as { endpoint: string;
            stackList: { app: { endpoint: string } } };
        assert.equal(list.endpoint, endpoint);
        assert.equal(list.stackList.app.endpoint, endpoint);
        assert.equal(broadcasts.filter(row => row[1] === "terminalWrite").length, 1);
        assert.ok(received.some(row => row[1] === "inspect"));
        // Browser lifetime does not own the reverse transport.
        manager.release();
        assert.equal(AgentManager.connectionFailure(endpoint), null);
        stopReverseNode();
        await until(() => AgentManager.connectionFailure(endpoint) === "offline");
        await assert.rejects(manager.requestEndpoint(endpoint, "inspect"), /offline/);
        startReverseNode({ config: { hostname: "127.0.0.1",
            port: nodePort },
        needSetup: false,
        jwtSecret: secret } as DockgeServer);
        await until(() => AgentManager.connectionFailure(endpoint) === null);
        revoked = true;
        manager.disconnect(endpoint);
        await until(() => AgentManager.connectionFailure(endpoint) === "offline");
        const denied = io(`${hubURL}/reverse-agent`, { auth: { token: credential.token },
            reconnection: false });
        try {
            const revokedError = await new Promise<Error>(resolve => denied.once("connect_error", resolve));
            assert.match(revokedError.message, /authentication failed/);
        } finally {
            denied.disconnect();
        }
    } finally {
        invalid.disconnect();
        stopReverseNode();
        manager.release();
        AgentManager.shutdown();
        mock.restoreAll();
        if (descriptor) {
            Object.defineProperty(R, "knex", descriptor);
        } else {
            Reflect.deleteProperty(R, "knex");
        }
        await db.destroy();
        for (const [ key, value ] of [[ "DOCKGE_REVERSE_HUB_URL", env.hub ], [ "DOCKGE_REVERSE_TOKEN", env.token ], [ "DOCKGE_REVERSE_TOKEN_FILE", env.file ]]) {
            if (value === undefined) {
                delete process.env[key!];
            } else {
                process.env[key!] = value;
            }
        }
        await Promise.all([ new Promise<void>(resolve => hub.close(() => resolve())), new Promise<void>(resolve => node.close(() => resolve())) ]);
    }
});
