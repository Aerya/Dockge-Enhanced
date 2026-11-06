// Opt-in: two real Enhanced processes and databases, real Docker through a GET-only proxy.
// No containers, images, volumes or networks are created or changed.
import assert from "node:assert/strict";
import { createServer, request } from "node:http";
import { mkdtemp, mkdir, rm, open } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { io } from "socket.io-client";

if (process.env.TOPOLOGY_LIVE_TEST !== "1") throw new Error("Set TOPOLOGY_LIVE_TEST=1 explicitly");
const root = await mkdtemp(path.join(tmpdir(), "enhanced-topology-live-"));
const children = [], sockets = [], logs = [];
let denied = 0;
const proxy = createServer((req, res) => {
    if (!["GET", "HEAD"].includes(req.method)) {
        denied++;
        res.writeHead(403).end("Read-only test Docker endpoint");
        return;
    }
    const upstream = request({ socketPath: "/var/run/docker.sock", path: req.url, method: req.method }, reply => {
        res.writeHead(reply.statusCode, reply.headers);
        reply.pipe(res);
    });
    upstream.on("error", () => res.writeHead(502).end());
    res.on("close", () => upstream.destroy());
    upstream.end();
});
// mkdtemp is private (0700); do not expose even a read-only Docker API on TCP.
const proxySocket = path.join(root, "docker.sock");
await new Promise(resolve => proxy.listen(proxySocket, resolve));
const dockerHost = `unix://${proxySocket}`;
const rpc = (socket, ...args) => {
    console.log("RPC", args[0], args[0] === "agent" ? args[2] : "");
    return new Promise((resolve, reject) => socket.timeout(20000).emit(...args, (error, result) => error ? reject(error) : resolve(result)));
};
const password = randomBytes(24).toString("hex") + "Aa1!";
async function reconnect(instance) {
    for (let attempt = 0; attempt < 6; attempt++) {
        try {
            instance.socket.disconnect().connect();
            await new Promise((resolve, reject) => {
                const timer = setTimeout(() => reject(new Error("Reconnect timeout")), 5000);
                instance.socket.once("connect", () => { clearTimeout(timer); resolve(); });
            });
            assert.equal((await rpc(instance.socket, "login", { username: "fixture", password })).ok, true);
            return;
        } catch (error) {
            if (attempt === 5) throw error;
            await new Promise(resolve => setTimeout(resolve, 500));
        }
    }
}
async function start(index) {
    const data = path.join(root, String(index));
    await mkdir(path.join(data, "stacks"), { recursive: true });
    const log = await open(path.join(root, `${index}.log`), "w");
    logs.push(log);
    const reservation = createServer();
    await new Promise(resolve => reservation.listen(0, "127.0.0.1", resolve));
    const port = reservation.address().port;
    await new Promise(resolve => reservation.close(resolve));
    const child = spawn(process.execPath, ["--import", "tsx", "backend/index.ts"], {
        env: { ...process.env, NODE_ENV: "production", CI: "true", DOCKGE_USAGE_COUNT: "false", DOCKER_HOST: dockerHost,
            DOCKGE_DATA_DIR: data, DOCKGE_STACKS_DIR: path.join(data, "stacks"), DOCKGE_PORT: String(port), DOCKGE_HOSTNAME: "127.0.0.1" },
        stdio: ["ignore", log.fd, log.fd]
    });
    children.push(child);
    const url = `http://127.0.0.1:${port}`;
    const socket = io(url, { transports: ["websocket"], reconnection: true });
    sockets.push(socket);
    await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error(`Startup timed out: ${index}, exit ${child.exitCode}`)), 30000);
        socket.once("connect", () => { clearTimeout(timeout); resolve(); });
    });
    assert.equal((await rpc(socket, "setup", "fixture", password)).ok, true);
    assert.equal((await rpc(socket, "login", { username: "fixture", password })).ok, true);
    return { socket, url, port };
}
try {
    const a = await start(1), b = await start(2);
    const added = await rpc(a.socket, "addAgent", { url: b.url, username: "fixture", password, displayName: "Topology B", self: { url: a.url, displayName: "Topology A" } });
    assert.equal(added.ok, true, JSON.stringify(added));
    // Mesh changes intentionally refresh other browsers. Reconnect/re-authenticate
    // the second browser just as the real frontend does after its reload.
    await reconnect(b);
    const local = await rpc(a.socket, "agent", "", "topology:get");
    assert.equal(local.ok, true);
    const remote = await rpc(a.socket, "agent", `127.0.0.1:${b.port}`, "topology:get");
    assert.equal(remote.ok, true, JSON.stringify(remote));
    // Workloads may be recreated concurrently; compare each remote response with its
    // own instance's cached response rather than two differently timed inventories.
    const directRemote = await rpc(b.socket, "agent", "", "topology:get");
    assert.deepEqual(remote.snapshot, directRemote.snapshot);
    assert.ok(remote.snapshot.containers.length > 0);
    const reverse = await rpc(b.socket, "agent", `127.0.0.1:${a.port}`, "topology:get");
    assert.equal(reverse.ok, true);
    await reconnect(a);
    assert.equal((await rpc(a.socket, "agent", `127.0.0.1:${b.port}`, "topology:get")).ok, true);
    assert.equal((await rpc(a.socket, "usersSave", { username: "limited", password, active: true, grants: [] })).ok, true);
    const limited = io(a.url, { transports: ["websocket"] });
    sockets.push(limited);
    await new Promise(resolve => limited.once("connect", resolve));
    assert.equal((await rpc(limited, "agent", "", "topology:get")).ok, false);
    assert.equal((await rpc(limited, "login", { username: "limited", password })).ok, true);
    assert.equal((await rpc(limited, "agent", "", "topology:get")).ok, false);
    assert.equal((await rpc(limited, "agent", `127.0.0.1:${b.port}`, "topology:get")).ok, false);
    const groupStack = remote.snapshot.containers.find(c => c.stack && c.state === "running")?.stack;
    assert.ok(groupStack);
    assert.equal((await rpc(a.socket, "stackGroups:save", { revision: 0, preferences: { enabled: true, groups: [{ id: "lab", name: "Cross-instance fixture", collapsed: false, members: [JSON.stringify(["", groupStack]), JSON.stringify([`127.0.0.1:${b.port}`, groupStack])] }] } })).ok, true);
    if (process.env.TOPOLOGY_PLAYWRIGHT_MODULE) {
        const { chromium } = await import(process.env.TOPOLOGY_PLAYWRIGHT_MODULE);
        const browser = await chromium.launch({ executablePath: process.env.TOPOLOGY_CHROMIUM || "/usr/bin/chromium", headless: true });
        try {
            const page = await browser.newPage();
            const errors = [];
            page.on("pageerror", e => errors.push(e.message));
            await page.goto(a.url);
            await page.locator("#floatingInput").fill("fixture");
            await page.locator("#floatingPassword").fill(password);
            await page.locator('button[type="submit"]').click();
            await page.locator("#floatingInput").waitFor({ state: "hidden" });
            await page.goto(a.url + "/topology");
            await page.locator(".topology-page").waitFor();
            await page.locator(".topology-page select").nth(1).selectOption("*");
            await page.locator(".topology-instance").nth(1).waitFor();
            await page.locator(".topology-page select").nth(2).selectOption("lab");
            await page.locator(".topology-instance").nth(1).waitFor();
            await page.locator(".topology-page select").nth(0).selectOption("ports");
            await page.locator(".topology-instance table").first().waitFor();
            await page.reload();
            await page.locator(".topology-page").waitFor();
            await page.locator(".topology-page select").nth(1).selectOption("*");
            await page.locator(".topology-instance").nth(1).waitFor();
            await page.setViewportSize({ width: 390, height: 844 });
            assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
            assert.deepEqual(errors, []);
            console.log("BROWSER_PASS: login, real federation, port table, reload, mobile");
        } finally {
            await browser.close();
        }
    }
    console.log(JSON.stringify({ result: "PASS", realEnhancedProcesses: 2, dockerReadOnly: true, containers: remote.snapshot.containers.length, deniedWrites: denied }));
} finally {
    for (const socket of sockets) socket.disconnect();
    for (const child of children) {
        child.kill("SIGTERM");
        await Promise.race([new Promise(resolve => child.once("exit", resolve)), new Promise(resolve => setTimeout(resolve, 3000))]);
        if (child.exitCode === null) child.kill("SIGKILL");
    }
    proxy.closeAllConnections();
    await new Promise(resolve => proxy.close(resolve));
    for (const log of logs) await log.close();
    if (process.env.TOPOLOGY_KEEP_TEST_LOGS === "1") console.log("Private diagnostic directory:", root);
    else await rm(root, { recursive: true, force: true });
}
