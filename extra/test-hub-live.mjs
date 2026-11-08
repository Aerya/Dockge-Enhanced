import assert from "node:assert/strict";
import { mkdtemp, rm, readFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createServer } from "node:net";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { randomBytes } from "node:crypto";
import { io } from "socket.io-client";

const root = await mkdtemp(path.join(tmpdir(), "dockge-hub-live-"));
const children = [], sockets = [];
let browser;
async function freePort() {
    const socket = createServer().listen(0, "127.0.0.1");
    await once(socket, "listening");
    const port = socket.address().port;
    await new Promise(resolve => socket.close(resolve));
    return port;
}
function rpc(socket, ...args) {
    return new Promise((resolve, reject) => socket.timeout(20000).emit(...args, (error, value) => error ? reject(error) : resolve(value)));
}
async function start(name, hub) {
    const port = await freePort();
    const dir = path.join(root, name);
    const child = spawn(process.execPath, ["--import", "tsx", "backend/index.ts"], { env: {
        ...process.env, NODE_ENV: "production", DOCKGE_DATA_DIR: path.join(dir, "data"), DOCKGE_STACKS_DIR: path.join(dir, "stacks"),
        DOCKGE_PORT: String(port), DOCKGE_HOSTNAME: "127.0.0.1", DOCKGE_HUB_ONLY: hub ? "1" : "0",
        DOCKGE_REVERSE_HUB_URL: "", DOCKER_HOST: `unix://${root}/nonexistent-docker.sock`,
    }, stdio: ["ignore", "pipe", "pipe"] });
    children.push(child);
    let logs = "";
    child.stdout.on("data", b => logs = (logs + b).slice(-12000));
    child.stderr.on("data", b => logs = (logs + b).slice(-12000));
    const url = `http://127.0.0.1:${port}`;
    const socket = io(url, { reconnection: true, timeout: 1000, transports: ["websocket"] });
    sockets.push(socket);
    await Promise.race([once(socket, "connect"), new Promise((_, reject) => setTimeout(() => reject(Error(`Startup failed: ${name}\n${logs}`)), 20000).unref())]);
    const password = randomBytes(24).toString("hex") + "Aa!";
    assert.equal((await rpc(socket, "setup", "test-admin", password)).ok, true);
    const login = await rpc(socket, "login", { username: "test-admin", password });
    assert.equal(login.ok, true);
    return { socket, dir, url, password, port, token: login.token, logs: () => logs };
}
try {
    const hub = await start("hub", true);
    const remote = await start("remote", false);
    const compose = "services:\n  fixture:\n    image: busybox:stable\n";
    assert.equal((await rpc(hub.socket, "agent", "", "saveStack", "forbidden", compose, "", true, "")).ok, false);
    assert.equal((await rpc(hub.socket, "agent", "", "startStack", "forbidden")).ok, false);
    assert.equal((await fetch(hub.url + "/api/watcher/self/status")).status, 403);
    assert.deepEqual(await readdir(path.join(hub.dir, "stacks")), []);
    const add = await rpc(hub.socket, "addAgent", { url: remote.url, username: "test-admin", password: remote.password,
        displayName: "Isolated remote", self: { url: hub.url, displayName: "Isolated hub" } });
    assert.equal(add.ok, true, JSON.stringify(add));
    const endpoint = `127.0.0.1:${remote.port}`;
    let saved;
    for (let attempt = 0; attempt < 15; attempt++) {
        saved = await rpc(hub.socket, "agent", endpoint, "saveStack", "remote-fixture", compose, "", true, "");
        if (saved.ok) break;
        await new Promise(resolve => setTimeout(resolve, 200));
    }
    assert.equal(saved.ok, true, JSON.stringify(saved));
    assert.equal(await readFile(path.join(remote.dir, "stacks", "remote-fixture", "compose.yaml"), "utf8"), compose);
    assert.deepEqual(await readdir(path.join(hub.dir, "stacks")), []);
    assert.ok(hub.logs().includes("Hub-only mode: local watchers"));
    if (process.env.PLAYWRIGHT_MODULE) {
        const { chromium } = await import(process.env.PLAYWRIGHT_MODULE);
        browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium" });
        for (const width of [390, 1280]) {
            const page = await browser.newPage({ viewport: { width, height: 900 } });
            await page.addInitScript(token => { localStorage.token = token; localStorage.remember = "1"; localStorage.locale = "en"; }, hub.token);
            await page.goto(hub.url + "/compose");
            await page.getByText("Hub only — select a linked instance for Docker operations.", { exact: true }).waitFor();
            const selector = page.locator("select").filter({ has: page.locator(`option[value="${endpoint}"]`) });
            await selector.waitFor();
            assert.equal(await selector.locator('option[value=""]').isDisabled(), true);
            const buttons = page.locator(".stack-action-group--operations button");
            assert.equal(await buttons.nth(0).isDisabled(), true);
            assert.equal(await buttons.nth(1).isDisabled(), true);
            await selector.selectOption(endpoint);
            assert.equal(await buttons.nth(0).isDisabled(), false);
            assert.equal(await buttons.nth(1).isDisabled(), false);
            console.log(`PASS browser hub ${width}: authenticated UI, local target disabled, linked target enabled`);
            await page.close();
        }
    }
    console.log("PASS: real hub and linked instance, separate SQLite accounts, authenticated federation, local save/start/HTTP denied, remote save successful; no Docker daemon reachable");
} finally {
    await browser?.close();
    sockets.forEach(socket => socket.disconnect());
    for (const child of children) {
        if (child.exitCode === null) {
            child.kill("SIGTERM");
            await Promise.race([once(child, "exit"), new Promise(resolve => setTimeout(resolve, 3000))]);
            if (child.exitCode === null) { child.kill("SIGKILL"); await once(child, "exit"); }
        }
    }
    await rm(root, { recursive: true, force: true });
    console.log("Temporary instances and data removed");
}
