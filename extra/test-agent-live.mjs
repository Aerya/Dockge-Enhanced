import assert from "node:assert/strict";
import { mkdtemp, rm, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createServer } from "node:net";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { randomBytes } from "node:crypto";
import { io } from "socket.io-client";

const root = await mkdtemp(path.join(tmpdir(), "dockge-agent-live-"));
const sockets = [];
let child;
let hubChild;
const password = randomBytes(32).toString("hex") + "Aa!";
function rpc(socket, ...args) {
    return new Promise((resolve, reject) => socket.timeout(15000).emit(...args, (error, response) => error ? reject(error) : resolve(response)));
}
try {
    const reservation = createServer().listen(0, "127.0.0.1");
    await once(reservation, "listening");
    const port = reservation.address().port;
    await new Promise(resolve => reservation.close(resolve));
    const secret = path.join(root, "bootstrap-secret");
    await writeFile(secret, password, { mode: 0o600 });
    child = spawn(process.execPath, ["--import", "tsx", "backend/index.ts"], { env: {
        ...process.env, NODE_ENV: "production", DOCKGE_AGENT_ONLY: "1", DOCKGE_HUB_ONLY: "0", DOCKGE_AUTH_MODE: "local",
        DOCKGE_BOOTSTRAP_USERNAME: "agent-admin", DOCKGE_BOOTSTRAP_PASSWORD_FILE: secret,
        DOCKGE_DATA_DIR: path.join(root, "data"), DOCKGE_STACKS_DIR: path.join(root, "stacks"),
        DOCKGE_PORT: String(port), DOCKGE_HOSTNAME: "127.0.0.1", DOCKGE_REVERSE_HUB_URL: "",
        DOCKER_HOST: `unix://${root}/absent-docker.sock`,
    }, stdio: ["ignore", "pipe", "pipe"] });
    let logs = "";
    child.stdout.on("data", b => logs = (logs + b).slice(-16000));
    child.stderr.on("data", b => logs = (logs + b).slice(-16000));
    const url = `http://127.0.0.1:${port}`;
    const socket = io(url, { transports: ["websocket"], timeout: 1000 });
    sockets.push(socket);
    await Promise.race([once(socket, "connect"), new Promise((_, reject) => setTimeout(() => reject(Error("Agent did not start")), 20000).unref())]);
    assert.equal((await fetch(url + "/")).status, 404);
    assert.equal((await fetch(url + "/compose/fixture")).status, 404);
    assert.equal((await fetch(url + "/assets/index.js")).status, 404);
    assert.equal((await fetch(url + "/status")).status, 200);
    const compose = "services:\n  demo:\n    image: busybox:stable\n";
    assert.equal((await rpc(socket, "agent", "", "saveStack", "fixture", compose, "", true, "")).ok, false);
    assert.equal((await rpc(socket, "login", { username: "agent-admin", password: "wrong" })).ok, false);
    assert.equal((await rpc(socket, "login", { username: "agent-admin", password })).ok, true);
    assert.equal((await rpc(socket, "agent", "", "saveStack", "fixture", compose, "", true, "")).ok, true);
    assert.equal(await readFile(path.join(root, "stacks", "fixture", "compose.yaml"), "utf8"), compose);
    assert.equal(logs.includes(password), false);
    const hubReservation = createServer().listen(0, "127.0.0.1");
    await once(hubReservation, "listening");
    const hubPort = hubReservation.address().port;
    await new Promise(resolve => hubReservation.close(resolve));
    const hubURL = `http://127.0.0.1:${hubPort}`;
    hubChild = spawn(process.execPath, ["--import", "tsx", "backend/index.ts"], { env: {
        ...process.env, NODE_ENV: "production", DOCKGE_AGENT_ONLY: "0", DOCKGE_HUB_ONLY: "0", DOCKGE_AUTH_MODE: "local",
        DOCKGE_BOOTSTRAP_USERNAME: "hub-admin", DOCKGE_BOOTSTRAP_PASSWORD_FILE: secret,
        DOCKGE_DATA_DIR: path.join(root, "hub-data"), DOCKGE_STACKS_DIR: path.join(root, "hub-stacks"),
        DOCKGE_PORT: String(hubPort), DOCKGE_HOSTNAME: "127.0.0.1", DOCKGE_REVERSE_HUB_URL: "",
        DOCKER_HOST: `unix://${root}/absent-docker.sock`,
    }, stdio: "ignore" });
    const hubSocket = io(hubURL, { transports: ["websocket"], timeout: 1000 });
    sockets.push(hubSocket);
    await Promise.race([once(hubSocket, "connect"), new Promise((_, reject) => setTimeout(() => reject(Error("Hub did not start")), 20000).unref())]);
    assert.equal((await rpc(hubSocket, "login", { username: "hub-admin", password })).ok, true);
    assert.equal((await rpc(hubSocket, "addAgent", { url, username: "agent-admin", password,
        displayName: "Headless agent", self: { url: hubURL, displayName: "Test central" } })).ok, true);
    let saved;
    for (let attempt = 0; attempt < 15; attempt++) {
        saved = await rpc(hubSocket, "agent", `127.0.0.1:${port}`, "saveStack", "from-hub", compose, "", true, "");
        if (saved.ok) break;
        await new Promise(resolve => setTimeout(resolve, 200));
    }
    assert.equal(saved.ok, true, JSON.stringify(saved));
    assert.equal(await readFile(path.join(root, "stacks", "from-hub", "compose.yaml"), "utf8"), compose);
    console.log("PASS: authenticated federation from a separate real Enhanced instance to the headless agent");
    console.log("PASS: bootstrap secret file, no WebUI/assets, health, unauthenticated and invalid-password denial, authenticated Compose save; Docker unreachable");
} finally {
    sockets.forEach(socket => socket.disconnect());
    for (const process of [child, hubChild]) {
        if (process && process.exitCode === null) {
            process.kill("SIGTERM");
            await Promise.race([once(process, "exit"), new Promise(resolve => setTimeout(resolve, 3000))]);
            if (process.exitCode === null) { process.kill("SIGKILL"); await once(process, "exit"); }
        }
    }
    await rm(root, { recursive: true, force: true });
    console.log("Temporary agent and data removed");
}
