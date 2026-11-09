// Isolated real Enhanced processes; no Docker daemon or production data.
import assert from "node:assert/strict";
import { mkdtemp, rm, readFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createServer, connect as connectTCP } from "node:net";
import { createServer as createTLS } from "node:https";
import { spawn, execFileSync } from "node:child_process";
import { once } from "node:events";
import { randomBytes } from "node:crypto";
import { io } from "socket.io-client";
import { RELEASE_NEWS } from "../frontend/src/release-news.js";

const root = await mkdtemp(path.join(tmpdir(), "dockge-sso-live-"));
const children = [], sockets = [], tunnels = new Set();
let proxy, browser;
async function freePort() {
    const listener = createServer().listen(0, "127.0.0.1");
    await once(listener, "listening");
    const port = listener.address().port;
    await new Promise(resolve => listener.close(resolve));
    return port;
}
async function rpc(socket, ...args) {
    try {
        return await socket.timeout(10000).emitWithAck(...args);
    } catch (error) {
        throw new Error(`RPC failed: ${args[0]}`, { cause: error });
    }
}
async function retry(callback) {
    let result;
    for (let i = 0; i < 40; i++) {
        result = await callback();
        if (result?.ok) return result;
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert.fail(JSON.stringify(result));
}
async function start(name, trusted, existingToken) {
    const port = await freePort();
    const dir = path.join(root, name);
    const child = spawn(process.execPath, [ "--import", "tsx", "backend/index.ts" ], { env: {
        ...process.env, NODE_ENV: "production", NODE_EXTRA_CA_CERTS: path.join(root, "cert.pem"),
        DOCKGE_DATA_DIR: path.join(dir, "data"), DOCKGE_STACKS_DIR: path.join(dir, "stacks"),
        DOCKGE_PORT: String(port), DOCKGE_HOSTNAME: "127.0.0.1", DOCKGE_HUB_ONLY: "0", DOCKGE_AGENT_ONLY: "0",
        DOCKGE_AUTH_MODE: trusted ? "trusted-proxy" : "local", DOCKGE_AUTH_PROXY_TRUSTED_NETWORKS: "127.0.0.1/32",
        DOCKGE_AUTH_PROXY_ADMIN_USERS: "fixture-admin", DOCKGE_REVERSE_HUB_URL: "",
        DOCKER_HOST: `unix://${root}/nonexistent-docker.sock`,
    }, stdio: [ "ignore", "pipe", "pipe" ] });
    children.push(child);
    let logs = "";
    child.stdout.on("data", b => logs = (logs + b).slice(-20000));
    child.stderr.on("data", b => logs = (logs + b).slice(-20000));
    const url = `http://127.0.0.1:${port}`;
    const socket = io(url, { reconnection: true, timeout: 1000, transports: [ "websocket" ], extraHeaders: trusted ? { "x-forwarded-user": "fixture-admin" } : { endpoint: "isolated-test-controller" } });
    sockets.push(socket);
    await Promise.race([ once(socket, "connect"), new Promise((_, reject) => setTimeout(() => reject(Error(`Startup failed: ${name}\n${logs}`)), 20000).unref()) ]);
    let token;
    if (existingToken) {
        assert.equal((await rpc(socket, "loginByToken", existingToken)).ok, true);
        token = existingToken;
    } else if (!trusted) {
        const password = randomBytes(24).toString("hex") + "Aa!";
        assert.equal((await rpc(socket, "setup", "fixture-admin", password)).ok, true);
        const login = await rpc(socket, "login", { username: "fixture-admin", password });
        assert.equal(login.ok, true);
        token = login.token;
    }
    return { socket, dir, url, port, token, child, logs: () => logs };
}
try {
    execFileSync("openssl", [ "req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", path.join(root, "key.pem"), "-out", path.join(root, "cert.pem"), "-days", "1", "-subj", "/CN=localhost", "-addext", "subjectAltName=IP:127.0.0.1" ], { stdio: "ignore" });
    const remote = await start("remote", true);
    let hub = await start("central", false);
    const credential = await retry(() => rpc(remote.socket, "createAgentFederationToken", {}));
    assert.ok(credential.token);
    const expected = `Basic ${Buffer.from("fixture-service:fixture-app-password").toString("base64")}`;
    proxy = createTLS({ key: await readFile(path.join(root, "key.pem")), cert: await readFile(path.join(root, "cert.pem")) }, (_req, res) => {
        res.writeHead(302, { Location: "/sso-login" }); res.end();
    });
    proxy.on("upgrade", (req, downstream, head) => {
        tunnels.add(downstream); downstream.on("close", () => tunnels.delete(downstream));
        if (req.headers.authorization !== expected) { downstream.end("HTTP/1.1 401 Unauthorized\r\nContent-Length: 0\r\n\r\n"); return; }
        const upstream = connectTCP(remote.port, "127.0.0.1", () => {
            const headers = { ...req.headers, "x-forwarded-user": "fixture-admin" };
            upstream.write(`GET ${req.url} HTTP/1.1\r\n${Object.entries(headers).map(([ k, v ]) => `${k}: ${v}`).join("\r\n")}\r\n\r\n`);
            if (head.length) upstream.write(head);
            downstream.pipe(upstream).pipe(downstream);
        });
        tunnels.add(upstream); upstream.on("close", () => tunnels.delete(upstream));
        upstream.on("error", () => downstream.destroy()); downstream.on("error", () => upstream.destroy());
        downstream.on("close", () => upstream.destroy()); upstream.on("close", () => downstream.destroy());
    });
    proxy.listen(0, "127.0.0.1"); await once(proxy, "listening");
    const url = `https://127.0.0.1:${proxy.address().port}`;
    const untrustedAgent = io(url, { transports: [ "websocket" ], reconnection: false, extraHeaders: { endpoint: "untrusted", Authorization: expected }, transportOptions: { websocket: { ca: await readFile(path.join(root, "cert.pem")) } } });
    sockets.push(untrustedAgent);
    await once(untrustedAgent, "connect");
    assert.equal((await rpc(untrustedAgent, "createAgentFederationToken", {})).ok, false, "proxy identity must not grant agent privileges");
    untrustedAgent.disconnect();
    const request = { url, username: "__dockge_federation_token__", password: credential.token, displayName: "SSO test", connectionOptions: { oneWay: true, proxyUsername: "fixture-service", proxyPassword: "fixture-app-password" } };
    assert.equal((await rpc(hub.socket, "addAgent", { ...request, password: "invalid" })).ok, false);
    assert.equal((await rpc(hub.socket, "addAgent", { ...request, connectionOptions: { ...request.connectionOptions, proxyPassword: "wrong" } })).ok, false);
    const add = await rpc(hub.socket, "addAgent", request);
    console.log("Added isolated SSO agent");
    assert.equal(add.ok, true, JSON.stringify(add));
    const endpoint = new URL(url).host;
    const compose = "services:\n  fixture:\n    image: busybox:stable\n";
    await retry(() => rpc(hub.socket, "agent", endpoint, "saveStack", "sso-fixture", compose, "", true, ""));
    assert.equal(await readFile(path.join(remote.dir, "stacks", "sso-fixture", "compose.yaml"), "utf8"), compose);
    assert.deepEqual(await readdir(path.join(hub.dir, "stacks")), []);
    // Both sides of every proxy tunnel are cut: the persistent transport must reconnect.
    for (const tunnel of tunnels) tunnel.destroy();
    await new Promise(resolve => setTimeout(resolve, 1200));
    await retry(() => rpc(hub.socket, "agent", endpoint, "saveStack", "sso-reconnected", compose, "", true, ""));
    console.log("Reconnected after network interruption");
    const previousToken = hub.token;
    hub.socket.disconnect();
    hub.child.kill("SIGTERM");
    await once(hub.child, "exit");
    hub = await start("central", false, previousToken);
    await retry(() => rpc(hub.socket, "agent", endpoint, "saveStack", "sso-restarted", compose, "", true, ""));
    console.log("Reconnected after process restart");
    if (process.env.PLAYWRIGHT_MODULE) {
        const { chromium } = await import(process.env.PLAYWRIGHT_MODULE);
        browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium" });
        for (const width of [ 390, 1280 ]) {
            assert.equal((await rpc(hub.socket, "removeAgent", { url })).ok, true);
            const page = await browser.newPage({ viewport: { width, height: 900 } });
            await page.addInitScript(({ token, news }) => { localStorage.token = token; localStorage.remember = "1"; localStorage.locale = "en"; localStorage.releaseNewsSeenIds = JSON.stringify(news); }, { token: hub.token, news: RELEASE_NEWS.map(item => item.id) });
            await page.goto(hub.url + "/");
            await page.getByRole("button", { name: "Add Agent", exact: true }).click();
            await page.locator("#agentCredentialMode").selectOption("true");
            await page.locator("#agentOneWay").check();
            await page.locator("#url").fill(url);
            await page.locator("#password").fill(credential.token);
            await page.locator("#proxyUsername").fill("fixture-service");
            await page.locator("#proxyPassword").fill("fixture-app-password");
            assert.equal(await page.locator("#username").count(), 0);
            assert.equal(await page.locator("#proxyPassword").getAttribute("type"), "password");
            await page.locator("form").filter({ has: page.locator("#url") }).locator('button[type="submit"]').click();
            await page.locator("#url").waitFor({ state: "detached" });
            console.log(`Browser added agent at width ${width}`);
            await retry(() => rpc(hub.socket, "agent", endpoint, "saveStack", `browser-${width}`, compose, "", true, ""));
            assert.equal(await readFile(path.join(remote.dir, "stacks", `browser-${width}`, "compose.yaml"), "utf8"), compose);
            await page.close();
        }
    }
    const removed = await rpc(hub.socket, "removeAgent", { url });
    assert.equal(removed.ok, true, JSON.stringify(removed));
    assert.ok(!hub.logs().includes("fixture-app-password"));
    assert.ok(!hub.logs().includes(credential.token));
    console.log("PASS: real Enhanced processes, trusted proxy, HTTPS/WSS, dual authentication, remote save, reconnection, process restart, removal, no Docker access" + (browser ? ", browser 390/1280" : ""));
} finally {
    await browser?.close();
    for (const socket of sockets) socket.disconnect();
    for (const tunnel of tunnels) tunnel.destroy();
    if (proxy) await new Promise(resolve => proxy.close(resolve));
    for (const child of children) {
        if (child.exitCode === null) {
            child.kill("SIGTERM");
            await Promise.race([ once(child, "exit"), new Promise(resolve => setTimeout(resolve, 3000)) ]);
            if (child.exitCode === null) { child.kill("SIGKILL"); await once(child, "exit"); }
        }
    }
    await rm(root, { recursive: true, force: true });
}
