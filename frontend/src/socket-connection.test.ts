import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { Server, type ServerOptions } from "socket.io";
import { io, type Socket } from "socket.io-client";
import { createWebUiSocket } from "./socket-connection";

async function fixture(t: TestContext, options: Partial<ServerOptions> = {}) {
    const http = createServer();
    const attempts: string[] = [];
    const server = new Server(http, {
        pingInterval: 30,
        pingTimeout: 500,
        allowRequest(req, done) {
            attempts.push(new URL(req.url ?? "/", "http://localhost").searchParams.get("transport") ?? "");
            done(null, true);
        },
        ...options,
    });
    server.on("connection", socket => {
        socket.on("echo", (value: string, ack: (value: string) => void) => ack(value));
    });
    await new Promise<void>(resolve => http.listen(0, "127.0.0.1", resolve));
    const address = http.address();
    assert(address && typeof address !== "string");
    const url = `http://127.0.0.1:${address.port}`;
    const clients: Socket[] = [];
    t.after(async () => {
        clients.forEach(client => client.disconnect());
        await new Promise<void>(resolve => server.close(() => resolve()));
    });
    function client() {
        const socket = createWebUiSocket(url);
        clients.push(socket);
        return socket;
    }
    return { server,
        attempts,
        url,
        clients,
        client };
}

function connected(socket: Socket): Promise<void> {
    if (socket.connected) {
        return Promise.resolve();
    }
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            cleanup();
            reject(new Error("Socket connection timed out"));
        }, 5_000);
        const success = () => {
            cleanup();
            resolve();
        };
        const failure = (error: Error) => {
            cleanup();
            reject(error);
        };
        const cleanup = () => {
            clearTimeout(timer);
            socket.off("connect", success);
            socket.off("connect_error", failure);
        };
        socket.once("connect", success);
        socket.once("connect_error", failure);
    });
}

test("la WebUI ouvre directement WebSocket sans session polling ni upgrade", async t => {
    const f = await fixture(t);
    const client = f.client();
    await connected(client);
    assert.equal(client.io.engine.transport.name, "websocket");
    assert.deepEqual(f.attempts, [ "websocket" ]);
    assert.equal(await client.timeout(1_000).emitWithAck("echo", "hello"), "hello");
});

test("un refus de WebSocket conserve le repli polling et les échanges", async t => {
    const f = await fixture(t, { transports: [ "polling" ] });
    const client = f.client();
    await connected(client);
    assert.equal(client.io.engine.transport.name, "polling");
    assert.equal(await client.timeout(1_000).emitWithAck("echo", "polling"), "polling");
    let disconnects = 0;
    client.on("disconnect", () => disconnects++);
    await new Promise(resolve => setTimeout(resolve, 200));
    assert.equal(client.connected, true);
    assert.equal(disconnects, 0);
});

test("une panne du chemin polling ne bloque plus un WebSocket disponible", async t => {
    let pollingRefusals = 0;
    const f = await fixture(t, {
        allowRequest(req, done) {
            const polling = new URL(req.url ?? "/", "http://localhost").searchParams.get("transport") === "polling";
            if (polling) {
                pollingRefusals++;
            }
            done(null, !polling);
        },
    });
    const legacy = io(f.url, { reconnection: false,
        timeout: 1_000 });
    f.clients.push(legacy);
    await assert.rejects(connected(legacy));
    assert.equal(pollingRefusals, 1);
    const client = f.client();
    await connected(client);
    assert.equal(client.io.engine.transport.name, "websocket");
    assert.equal(pollingRefusals, 1);
});

test("plusieurs onglets et rechargements conservent des sessions indépendantes", async t => {
    const f = await fixture(t);
    const clients = [ f.client(), f.client(), f.client() ];
    await Promise.all(clients.map(connected));
    assert.equal(new Set(clients.map(client => client.id)).size, 3);
    clients[0].disconnect();
    const reopened = f.client();
    await connected(reopened);
    assert.equal(clients[1].connected, true);
    assert.equal(clients[2].connected, true);
    assert.deepEqual(f.attempts, [ "websocket", "websocket", "websocket", "websocket" ]);
});

test("une rupture de transport reconnecte et rejoue le flux applicatif existant", async t => {
    const f = await fixture(t);
    const client = f.client();
    client.io.reconnectionDelay(10);
    client.io.reconnectionDelayMax(30);
    let connects = 0;
    client.on("connect", () => connects++);
    await connected(client);
    const firstId = client.id;
    const disconnected = new Promise<void>(resolve => client.once("disconnect", () => resolve()));
    f.server.sockets.sockets.get(firstId ?? "")?.conn.close();
    await disconnected;
    await connected(client);
    assert.notEqual(client.id, firstId);
    assert.equal(connects, 2);
    assert.equal(await client.timeout(1_000).emitWithAck("echo", "after reconnect"), "after reconnect");
    assert.equal(client.io.engine.transport.name, "websocket");
});

test("un redémarrage du serveur conserve la reconnexion et le repli polling", async t => {
    const f = await fixture(t);
    const client = f.client();
    client.io.reconnectionDelay(100);
    client.io.reconnectionDelayMax(100);
    await connected(client);
    const firstId = client.id;
    const disconnected = new Promise<void>(resolve => client.once("disconnect", () => resolve()));
    await new Promise<void>(resolve => f.server.close(() => resolve()));
    await disconnected;
    const http = createServer();
    const restarted = new Server(http, { transports: [ "polling" ] });
    restarted.on("connection", socket => {
        socket.on("echo", (value: string, ack: (value: string) => void) => ack(value));
    });
    t.after(async () => {
        client.disconnect();
        await new Promise<void>(resolve => restarted.close(() => resolve()));
    });
    await new Promise<void>(resolve => http.listen(Number(new URL(f.url).port), "127.0.0.1", resolve));
    await connected(client);
    assert.notEqual(client.id, firstId);
    assert.equal(client.io.engine.transport.name, "polling");
    assert.equal(await client.timeout(1_000).emitWithAck("echo", "after restart"), "after restart");
});
