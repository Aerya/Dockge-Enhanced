/** Opt-in integration test: two isolated native servers; fixtures deployed via Dockge.
 * Requires a built frontend, Docker, access to the Alpine/Trivy registries and
 * DOCKGE_TEST_SELF_CONTAINER identifying a read-only self-protection reference.
 * Never prunes Docker. Only the generated fixture stacks are removed.
 */
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm, access } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { createServer } from "node:net";
import { spawn, execFileSync, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { io, type Socket } from "socket.io-client";

if (!process.env.DOCKGE_TEST_SELF_CONTAINER) {
    throw new Error("Set DOCKGE_TEST_SELF_CONTAINER explicitly; no production mutation is performed");
}
// Fail before creating fixtures if this read-only self-protection reference is stale.
execFileSync("docker", [ "inspect", process.env.DOCKGE_TEST_SELF_CONTAINER ], { stdio: "ignore" });
const root = await mkdtemp(path.join(tmpdir(), "dockge-preview-smoke-"));
const suffix = randomBytes(5).toString("hex");
const password = `Test-${randomBytes(24).toString("base64url")}!`;
const processes: ChildProcess[] = [];
const serverLogs = new Map<string, () => string>();
const sockets: Socket[] = [];
const fixtures: { socket: Socket;
    name: string;
    url: string }[] = [];
const baseline = execFileSync("docker", [ "ps", "-q", "--no-trunc" ], { encoding: "utf8" }).trim().split("\n").filter(Boolean);
const image = "alpine:3.22";
let checks = 0;
function verified(condition: unknown, message: string) {
    assert.ok(condition, message);
    checks++;
}
async function freePort(): Promise<number> {
    const server = createServer();
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const port = (server.address() as { port: number }).port;
    await new Promise<void>(resolve => server.close(() => resolve()));
    return port;
}
async function rpc(socket: Socket, event: string, ...args: unknown[]) {
    return socket.timeout(240000).emitWithAck(event, ...args);
}
async function connect(url: string, username = "testadmin", extraHeaders = {}, loginPassword = password) {
    const socket = io(url, { reconnection: false,
        extraHeaders });
    sockets.push(socket);
    await new Promise<void>((resolve, reject) => {
        socket.once("connect", () => resolve());
        socket.once("connect_error", reject);
    });
    const response = await rpc(socket, "login", { username,
        password: loginPassword });
    return { socket,
        response };
}
async function server(name: string) {
    const dir = path.join(root, name);
    await mkdir(path.join(dir, "stacks"), { recursive: true });
    const port = await freePort();
    const env = Object.fromEntries(Object.entries(process.env).filter(([ key ]) => !key.startsWith("DOCKGE_")));
    const child = spawn(path.resolve("node_modules/.bin/tsx"), [ "backend/index.ts", "--port", String(port), "--hostname", "127.0.0.1", "--dataDir", path.join(dir, "data"), "--stacksDir", path.join(dir, "stacks") ], {
        env: { ...env,
            DOCKGE_AUTH_MODE: "local",
            DOCKGE_BOOTSTRAP_USERNAME: "testadmin",
            DOCKGE_BOOTSTRAP_PASSWORD: password,
            DOCKGE_DATA_DIR: path.join(dir, "data"),
            DOCKGE_STACKS_DIR: path.join(dir, "stacks"),
            DOCKGE_CONTAINER_ID: globalThis.process.env.DOCKGE_TEST_SELF_CONTAINER },
        stdio: [ "ignore", "pipe", "pipe" ],
        detached: true,
    });
    processes.push(child);
    let output = "";
    serverLogs.set(name, () => output);
    child.stdout!.on("data", chunk => {
        output = (output + chunk).slice(-150000);
    });
    child.stderr!.on("data", chunk => {
        output = (output + chunk).slice(-150000);
    });
    const url = `http://127.0.0.1:${port}`;
    for (let i = 0; i < 100; i++) {
        if (child.exitCode !== null) {
            await writeFile(path.join(tmpdir(), "de-acl-failed.log"), output);
            throw new Error("Server failed; private log: /tmp/de-acl-failed.log");
        }
        try {
            if ((await fetch(url + "/")).ok) {
                return { url,
                    port,
                    dir };
            }
        } catch { /* starting */ }
        await new Promise(resolve => setTimeout(resolve, 200));
    }
    await writeFile(path.join(root, name + ".log"), output);
    throw new Error(`Server startup timed out: ${name}`);
}

async function api(url: string, token: string, route: string, body?: unknown) {
    const res = await fetch(url + "/api/watcher" + route, { method: body === undefined ? "GET" : "POST",
        headers: { Authorization: "Bearer " + token,
            "Content-Type": "application/json" },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return { status: res.status,
        body: await res.json() };
}
try {
    const a = await server("hub");
    const b = await server("peer");
    const adminA = await connect(a.url);
    const adminB = await connect(b.url);
    verified(adminA.response.ok && adminB.response.ok, "administrators connected");
    for (const [ socket, url, token, label ] of [[ adminA.socket, a.url, adminA.response.token, "hub" ], [ adminB.socket, b.url, adminB.response.token, "peer" ]] as const) {
        const name = `preview-${label}-${suffix}`;
        fixtures.push({ socket,
            name,
            url });
        const compose = `services:\n  fixture:\n    image: ${image}\n    network_mode: none\n    command: [sh, -c, 'sleep 3600']\n    labels:\n      dockge.test: preview-${suffix}\n`;
        verified((await rpc(socket, "agent", "", "deployStack", name, compose, "", true, "")).ok, "fixture deployed via Enhanced");
        verified((await api(url, token, "/image/run", {})).body.ok, "isolated image scan requested");
        let found = false;
        for (let n = 0;n < 120;n++) {
            const status = await rpc(socket, "agent", "", "watcherImageStatusGet");
            if (JSON.stringify(status).includes(name)) {
                found = true;
                break;
            }
            await new Promise(r => setTimeout(r, 1000));
        }
        verified(found, "fixture observed by watcher");
    }
    verified((await rpc(adminA.socket, "addAgent", { url: b.url,
        username: "testadmin",
        password,
        self: { url: a.url,
            displayName: "Preview hub" } })).ok, "instances linked");
    const endpoint = `127.0.0.1:${b.port}`;
    const fresh = await connect(a.url);
    verified((await rpc(fresh.socket, "usersSave", { username: "restricted",
        password,
        active: true,
        grants: [{ endpoint: "",
            stack: fixtures[0].name,
            service: "fixture",
            permissions: [ "view" ] }] })).ok, "restricted user created");
    const limited = await connect(a.url, "restricted");
    for (const target of [ "", endpoint ]) {
        const stack = target ? fixtures[1].name : fixtures[0].name;
        verified(!(await rpc(limited.socket, "agent", target, "imageVersionPreview", stack, image)).ok, "restricted version preview denied");
        verified(!(await rpc(limited.socket, "agent", target, "imageCveComparison", { stack,
            image,
            confirmed: true })).ok, "restricted comparison denied");
    }
    const denied = await api(a.url, limited.response.token, "/image/cve-comparison", { stack: fixtures[0].name,
        image,
        confirmed: true });
    verified([ 401, 403 ].includes(denied.status), "restricted REST comparison denied");
    if (process.env.PREVIEW_BROWSER === "1") {
        await writeFile(path.join(root, "browser.json"), JSON.stringify({ url: a.url,
            username: "testadmin",
            password,
            stack: fixtures[0].name,
            finish: path.join(root, "browser-finished") }), { mode: 0o600 });
        console.log("BROWSER_FIXTURE", path.join(root, "browser.json"));
    }
    for (const target of [ "", endpoint ]) {
        const stack = target ? fixtures[1].name : fixtures[0].name;
        const preview = await rpc(fresh.socket, "agent", target, "imageVersionPreview", stack, image);
        verified(preview.ok && preview.data.targetDigest.startsWith("sha256:"), "local/linked version preview");
        console.log("PREVIEW", target || "local", JSON.stringify(preview.data));
    }
    const stack = fixtures[1].name;
    verified(!(await rpc(fresh.socket, "agent", endpoint, "imageCveComparison", { stack,
        image })).ok, "scan requires explicit confirmation");
    verified(!(await rpc(fresh.socket, "agent", endpoint, "imageCveComparison", { stack: "unknown",
        image,
        confirmed: true })).ok, "unknown stack refused");
    const started = await rpc(fresh.socket, "agent", endpoint, "imageCveComparison", { stack,
        image,
        confirmed: true });
    verified(started.ok, "real Trivy comparison started through federation");
    verified(!(await rpc(fresh.socket, "agent", endpoint, "imageCveComparison", { stack,
        image,
        confirmed: true })).ok, "parallel comparison refused");
    let complete = false;
    let previous = "";
    for (let n = 0;n < 800;n++) {
        const response = await rpc(fresh.socket, "agent", endpoint, "imageCveComparison", { id: started.data.id });
        verified(response.ok, "comparison progress readable");
        if (response.data.phase !== previous) {
            console.log("TRIVY", response.data.phase);
            previous = response.data.phase;
        }
        if (response.data.phase === "error") {
            throw new Error("Real Trivy comparison failed");
        }
        if (response.data.phase === "complete") {
            complete = true;
            console.log("COMPARISON", JSON.stringify(response.data));
            break;
        }
        await new Promise(r => setTimeout(r, 2000));
    }
    verified(complete, "real Trivy comparison completed");
    if (process.env.PREVIEW_BROWSER === "1") {
        await writeFile(path.join(root, "browser.json"), JSON.stringify({ url: a.url,
            username: "testadmin",
            password,
            stack: fixtures[0].name,
            finish: path.join(root, "browser-finished") }), { mode: 0o600 });
        console.log("BROWSER_FIXTURE", path.join(root, "browser.json"));
        for (let n = 0;n < 900;n++) {
            try {
                await access(path.join(root, "browser-finished"));
                break;
            } catch {}
            await new Promise(r => setTimeout(r, 1000));
        }
    }
    console.log("PASS", checks, "assertions");
} catch (error) {
    for (const [ name, output ] of serverLogs) {
        await writeFile(path.join(tmpdir(), `preview-${suffix}-${name}.log`), output());
    }
    throw error;
} finally {
    for (const fixture of fixtures) {
        const cleanup = await connect(fixture.url);
        await rpc(cleanup.socket, "agent", "", "deleteStack", fixture.name, { removeFiles: true });
        assert.equal(execFileSync("docker", [ "ps", "-aq", "--filter", `label=com.docker.compose.project=${fixture.name}` ], { encoding: "utf8" }).trim(), "", "test stack removed");
    }
    for (const socket of sockets) {
        socket.disconnect();
    }
    for (const child of processes) {
        try {
            process.kill(-child.pid!, "SIGTERM");
        } catch {}
    }
    await new Promise(r => setTimeout(r, 2000));
    for (const child of processes) {
        try {
            process.kill(-child.pid!, "SIGKILL");
        } catch {}
    }
    const current = execFileSync("docker", [ "ps", "-q", "--no-trunc" ], { encoding: "utf8" });
    for (const id of baseline) {
        assert.ok(current.includes(id), "existing container preserved");
    }
    await rm(root, { recursive: true,
        force: true });
    console.log("CLEANUP isolated servers and data removed; existing containers preserved");
}

