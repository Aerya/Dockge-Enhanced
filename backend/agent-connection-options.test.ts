import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:https";
import { Server } from "socket.io";
import { io } from "socket.io-client";
import { agentConnectionOptions, agentTransportOptions } from "./agent-connection-options";
import { Agent } from "./models/agent";

const credentials = { oneWay: true,
    proxyUsername: "service-account",
    proxyPassword: "fixture-secret" };

test("proxy credentials require HTTPS, one-way mode and a clean origin", () => {
    assert.deepEqual(agentConnectionOptions("http://localhost", undefined), { oneWay: false,
        proxyUsername: "",
        proxyPassword: "" });
    for (const url of [ "http://localhost", "https://user:pass@localhost", "https://localhost/path", "https://localhost/?secret=bad", "https://localhost/#fragment" ]) {
        assert.throws(() => agentConnectionOptions(url, credentials));
    }
    for (const options of [{ ...credentials,
        oneWay: false }, { ...credentials,
        proxyUsername: "a:b" }, { ...credentials,
        proxyPassword: "secret\nHeader: evil" }, { ...credentials,
        proxyPassword: "" }, { oneWay: "true" }]) {
        assert.throws(() => agentConnectionOptions("https://localhost", options));
    }
    const agent = Object.assign(Object.create(Agent.prototype), { url: "https://localhost",
        connection_options: JSON.stringify(credentials),
        username: "__dockge_federation_token__",
        password: "fixture-token" });
    const publicData = JSON.stringify(agent.toJSON());
    assert.equal(agent.oneWay, true);
    assert.ok(!publicData.includes(credentials.proxyPassword));
    assert.ok(!publicData.includes(credentials.proxyUsername));
    assert.ok(!publicData.includes("fixture-token"));
});

test("real TLS WebSocket proxy authentication, second application gate and redirect refusal", { timeout: 15000 }, async t => {
    const directory = mkdtempSync(join(tmpdir(), "dockge-proxy-test-"));
    t.after(() => rmSync(directory, { recursive: true,
        force: true }));
    execFileSync("openssl", [ "req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", join(directory, "key.pem"), "-out", join(directory, "cert.pem"), "-days", "1", "-subj", "/CN=localhost", "-addext", "subjectAltName=IP:127.0.0.1" ], { stdio: "ignore" });
    const cert = readFileSync(join(directory, "cert.pem"));
    const https = createServer({ key: readFileSync(join(directory, "key.pem")),
        cert });
    const expected = `Basic ${Buffer.from("service-account:fixture-secret").toString("base64")}`;
    const sockets = new Server(https, { allowRequest: (req, callback) => callback(null, req.headers.authorization === expected) });
    sockets.on("connection", socket => {
        let authenticated = false;
        socket.on("loginByToken", (token, ack) => {
            authenticated = token === "enhanced-token";
            ack({ ok: authenticated });
        });
        socket.on("protected", ack => ack({ ok: authenticated }));
    });
    await new Promise<void>(resolve => https.listen(0, "127.0.0.1", resolve));
    t.after(() => new Promise<void>(resolve => sockets.close(() => resolve())));
    const address = https.address();
    assert.ok(address && typeof address !== "string");
    const url = `https://127.0.0.1:${address.port}`;
    const connect = async (password: string) => {
        const options = agentTransportOptions(url, { ...credentials,
            proxyPassword: password });
        const client = io(url, { ...options,
            reconnection: false,
            timeout: 1000,
            transportOptions: { websocket: { ...options.transportOptions?.websocket,
                ca: cert } } });
        t.after(() => client.disconnect());
        const connected = await new Promise<boolean>(resolve => {
            client.once("connect", () => resolve(true));
            client.once("connect_error", () => resolve(false));
        });
        return { client,
            connected };
    };
    assert.equal((await connect("wrong")).connected, false);
    const { client, connected } = await connect(credentials.proxyPassword);
    assert.equal(connected, true);
    assert.deepEqual(await client.timeout(1000).emitWithAck("protected"), { ok: false });
    assert.deepEqual(await client.timeout(1000).emitWithAck("loginByToken", "wrong"), { ok: false });
    assert.deepEqual(await client.timeout(1000).emitWithAck("loginByToken", "enhanced-token"), { ok: true });
    assert.deepEqual(await client.timeout(1000).emitWithAck("protected"), { ok: true });
    let leaked = false;
    const redirect = createServer({ key: readFileSync(join(directory, "key.pem")),
        cert });
    redirect.on("upgrade", (request, socket) => {
        if (request.url?.startsWith("/leak")) {
            leaked = true;
            socket.destroy();
            return;
        }
        socket.end(`HTTP/1.1 302 Found\r\nLocation: ${redirectUrl}/leak\r\nContent-Length: 0\r\n\r\n`);
    });
    await new Promise<void>(resolve => redirect.listen(0, "127.0.0.1", resolve));
    t.after(() => new Promise<void>(resolve => redirect.close(() => resolve())));
    const redirectAddress = redirect.address();
    assert.ok(redirectAddress && typeof redirectAddress !== "string");
    const redirectUrl = `https://127.0.0.1:${redirectAddress.port}`;
    const options = agentTransportOptions(redirectUrl, credentials);
    const redirected = io(redirectUrl, { ...options,
        reconnection: false,
        timeout: 1000,
        transportOptions: { websocket: { ...options.transportOptions?.websocket,
            ca: cert } } });
    t.after(() => redirected.disconnect());
    await new Promise<void>(resolve => redirected.once("connect_error", () => resolve()));
    assert.equal(leaked, false);
});
