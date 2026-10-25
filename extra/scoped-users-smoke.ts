/** Opt-in integration test: two isolated native servers; fixtures deployed via Dockge.
 * Requires a built frontend, Docker, busybox:stable already present and
 * DOCKGE_TEST_SELF_CONTAINER identifying a read-only self-protection reference.
 * Never prunes Docker. Only the generated fixture stacks are removed.
 */
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { createServer } from "node:net";
import { spawn, execFileSync, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { io, type Socket } from "socket.io-client";
import { bridgeReverseNode } from "../backend/reverse-agent";
import { totpFor } from "../backend/two-factor-auth";
import { parse, stringify } from "yaml";
import { applyResourceLimits } from "../frontend/src/service-resource-limits";

if (!process.env.DOCKGE_TEST_SELF_CONTAINER) {
    throw new Error("Set DOCKGE_TEST_SELF_CONTAINER explicitly; no production mutation is performed");
}
// Fail before creating fixtures if this read-only self-protection reference is stale.
execFileSync("docker", [ "inspect", process.env.DOCKGE_TEST_SELF_CONTAINER ], { stdio: "ignore" });
const root = await mkdtemp(path.join(tmpdir(), "dockge-users-smoke-"));
const suffix = randomBytes(5).toString("hex");
const password = `Test-${randomBytes(24).toString("base64url")}!`;
const processes: ChildProcess[] = [];
const sockets: Socket[] = [];
const fixtures: { socket: Socket;
    name: string;
    url: string }[] = [];
const baseline = execFileSync("docker", [ "ps", "-q", "--no-trunc" ], { encoding: "utf8" }).trim().split("\n").filter(Boolean);
const image = JSON.parse(execFileSync("docker", [ "image", "inspect", "busybox:stable" ], { encoding: "utf8" }))[0].RepoDigests[0];
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
    return socket.timeout(120000).emitWithAck(event, ...args);
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
            DOCKGE_CONTAINER_ID: globalThis.process.env.DOCKGE_TEST_SELF_CONTAINER },
        stdio: [ "ignore", "pipe", "pipe" ],
    });
    processes.push(child);
    let output = "";
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
try {
    const a = await server("hub");
    const b = await server("peer");
    const adminA = await connect(a.url);
    const adminB = await connect(b.url);
    verified(adminA.response.ok && adminB.response.ok, "isolated administrators login");
    for (const [ socket, label, url ] of [[ adminA.socket, "local", a.url ], [ adminB.socket, "remote", b.url ]] as const) {
        const name = `acl-${label}-${suffix}`;
        fixtures.push({ socket,
            name,
            url });
        const compose = `services:\n  fixture:\n    image: ${image}\n    network_mode: none\n    command: [sh, -c, 'echo permitted-log; sleep 3600']\n    labels:\n      dockge.test: scoped-users-${suffix}\n  other:\n    image: ${image}\n    network_mode: none\n    command: [sh, -c, 'echo sibling-private-log; sleep 3600']\n    labels:\n      dockge.test: scoped-users-${suffix}\n`;
        const limitedCompose = parse(compose);
        limitedCompose.services.fixture = applyResourceLimits(limitedCompose.services.fixture, { cpu: "0.25",
            memory: "32M" });
        verified((await rpc(socket, "agent", "", "deployStack", name, stringify(limitedCompose), "SECRET_DO_NOT_DISCLOSE=fixture", true, "")).ok, "fixture deployed via Dockge");
        const inspectLimits = (service: string) => JSON.parse(execFileSync("docker", [ "inspect", "--format", "{{json .HostConfig}}", `${name}-${service}-1` ], { encoding: "utf8" }));
        const limits = inspectLimits("fixture");
        verified(limits.NanoCpus === 250000000 && limits.Memory === 33554432, "Docker enforces CPU/RAM limits generated by the editor");
        const siblingLimits = inspectLimits("other");
        verified(siblingLimits.NanoCpus === 0 && siblingLimits.Memory === 0, "sibling keeps its original unlimited resources");
    }
    verified((await rpc(adminA.socket, "addAgent", { url: b.url,
        username: "testadmin",
        password,
        self: { url: a.url,
            displayName: "Test hub" } })).ok, "federation established");
    const local = fixtures[0].name;
    const remote = fixtures[1].name;
    const endpoint = `127.0.0.1:${b.port}`;
    const grants = [{ endpoint: "",
        stack: local,
        permissions: [ "view", "logs", "restart" ] }, { endpoint,
        stack: remote,
        permissions: [ "view", "logs", "start", "stop", "restart", "update", "recreate" ] }];
    verified((await rpc(adminA.socket, "usersSave", { username: "reader",
        password,
        active: true,
        grants,
        role: "admin" })).ok, "limited account created without accepting forged role");
    const user = await connect(a.url, "reader");
    verified(user.response.ok, "limited local login");
    const leaked: unknown[] = [];
    user.socket.on("agent", (...args) => leaked.push(args));
    for (const event of [ "getSettings", "setSettings", "usersSave", "usersList", "createAgentFederationToken", "createReverseAgent", "setUILocale" ]) {
        verified(!(await rpc(user.socket, event, {})).ok, "denied " + event);
    }
    for (const event of [ "getStack", "deleteStack", "interactiveTerminal", "terminalInput", "fileRead", "requestStackList", "deployStack", "startStack", "scopedStackRequest" ]) {
        verified(!(await rpc(user.socket, "agent", endpoint, event, remote)).ok, "raw proxy denied " + event);
    }
    for (const request of [{ endpoint: "",
        stack: remote,
        permission: "view" }, { endpoint,
        stack: local,
        permission: "restart" }, { endpoint: "",
        stack: local,
        permission: "update" }, { endpoint,
        stack: remote,
        permission: "delete" }]) {
        verified(!(await rpc(user.socket, "scopedRequest", request)).ok, "forged target or permission rejected");
    }
    for (const grant of grants) {
        const result = await rpc(user.socket, "scopedRequest", { ...grant,
            permission: "view" });
        verified(result.ok && result.data.name === grant.stack, "scoped status local/remote");
        verified(!JSON.stringify(result).includes("SECRET_DO_NOT_DISCLOSE") && !JSON.stringify(result).includes("composeYAML"), "no Compose or environment disclosure");
        verified((await rpc(user.socket, "scopedRequest", { ...grant,
            permission: "logs" })).data?.logs.includes("permitted-log"), "scoped logs local/remote");
        for (const permission of grant.permissions.filter(p => ![ "view", "logs" ].includes(p))) {
            const actionReply = await rpc(user.socket, "scopedRequest", { ...grant,
                permission });
            verified(actionReply.ok, "authorized action " + permission + ": " + JSON.stringify(actionReply));
        }
    }
    for (const route of [ "/api/watcher/image/settings", "/api/docker/images", `/api/stack-tools/${local}/git/status` ]) {
        verified((await fetch(a.url + route, { headers: { Authorization: `Bearer ${user.response.token}` } })).status === 401, "HTTP admin API denied");
    }
    const spoofed = await connect(a.url, "reader", { endpoint: "forged-peer" });
    verified(!spoofed.response.ok, "limited user cannot authenticate as federation");
    verified(leaked.length === 0, "no broad stack or terminal broadcasts");
    const users = await rpc(adminA.socket, "usersList");
    const reader = users.data.find((entry: { username: string }) => entry.username === "reader");
    verified(reader.role === "restricted", "role escalation rejected");
    verified((await rpc(adminA.socket, "usersSave", { username: "service-reader",
        password,
        active: true,
        grants: grants.map(grant => ({ ...grant,
            service: "fixture" })) })).ok, "service grants created");
    const serviceUser = await connect(a.url, "service-reader");
    for (const grant of grants) {
        const sibling = `${grant.stack}-other-1`;
        const started = execFileSync("docker", [ "inspect", "--format", "{{.State.StartedAt}}", sibling ], { encoding: "utf8" });
        verified(!(await rpc(serviceUser.socket, "scopedRequest", { ...grant,
            permission: "restart" })).ok, "service grant cannot restart whole stack");
        verified(!(await rpc(serviceUser.socket, "scopedRequest", { ...grant,
            service: "other",
            permission: "restart" })).ok, "sibling service denied");
        for (const permission of grant.permissions) {
            const reply = await rpc(serviceUser.socket, "scopedRequest", { ...grant,
                service: "fixture",
                permission });
            verified(reply.ok, "service action local/direct " + permission);
            if (permission === "logs") {
                verified(!reply.data.logs.includes("sibling-private-log"), "service logs never include sibling logs");
            }
        }
        verified(execFileSync("docker", [ "inspect", "--format", "{{.State.StartedAt}}", sibling ], { encoding: "utf8" }) === started, "service mutations leave sibling running unchanged");
    }
    verified(!(await rpc(adminA.socket, "usersSave", { id: users.data.find((entry: { role: string }) => entry.role === "admin").id,
        username: "testadmin",
        active: false,
        grants: [] })).ok, "administrator cannot be demoted or disabled by scoped management");
    const reverse = await rpc(adminA.socket, "createReverseAgent", { displayName: "Isolated reverse fixture" });
    verified(reverse.ok, "reverse credential created by administrator");
    const localBridge = await connect(b.url, "testadmin", { endpoint: reverse.endpoint });
    const reverseSocket = io(a.url + "/reverse-agent", { reconnection: false,
        auth: { token: reverse.token } });
    sockets.push(reverseSocket);
    await new Promise<void>(resolve => reverseSocket.once("connect", () => resolve()));
    const detachBridge = bridgeReverseNode(reverseSocket, localBridge.socket, reverse.endpoint);
    await rpc(reverseSocket, "ready", { hostname: "fixture" });
    verified((await rpc(adminA.socket, "usersSave", { id: reader.id,
        username: "reader",
        active: true,
        grants: [{ endpoint: reverse.endpoint,
            stack: remote,
            permissions: [ "view", "logs", "restart" ] }] })).ok, "replace grants with reverse agent scope");
    const reverseUser = await connect(a.url, "reader");
    for (const permission of [ "view", "logs", "restart" ]) {
        verified((await rpc(reverseUser.socket, "scopedRequest", { endpoint: reverse.endpoint,
            stack: remote,
            permission })).ok, "reverse agent authorized " + permission);
    }
    verified((await rpc(adminA.socket, "usersSave", { username: "reverse-service",
        password,
        active: true,
        grants: [{ endpoint: reverse.endpoint,
            stack: remote,
            service: "fixture",
            permissions: [ "view", "logs", "restart", "recreate" ] }] })).ok, "reverse service grant created");
    const reverseService = await connect(a.url, "reverse-service");
    for (const permission of [ "view", "logs", "restart", "recreate" ]) {
        verified((await rpc(reverseService.socket, "scopedRequest", { endpoint: reverse.endpoint,
            stack: remote,
            service: "fixture",
            permission })).ok, "reverse service " + permission);
    }
    verified(!(await rpc(reverseUser.socket, "scopedRequest", { endpoint,
        stack: remote,
        permission: "view" })).ok, "old direct grant no longer applies after reconnect");
    const restored = io(a.url, { reconnection: false });
    sockets.push(restored);
    await new Promise<void>(resolve => restored.once("connect", () => resolve()));
    verified((await rpc(restored, "loginByToken", reverseUser.response.token)).ok, "JWT reconnect preserves restricted role");
    verified((await rpc(restored, "scopedList")).data[0].endpoint === reverse.endpoint, "JWT reconnect loads current grants");
    verified(!(await rpc(restored, "agent", endpoint, "getStack", remote)).ok, "JWT reconnect cannot bypass proxy guard");
    const newPassword = `Changed-${randomBytes(24).toString("base64url")}!`;
    const changed = await rpc(serviceUser.socket, "scopedPassword", { currentPassword: password,
        newPassword });
    verified(changed.ok && changed.token, "restricted self password change");
    verified(!(await connect(a.url, "service-reader")).response.ok, "old password rejected");
    const ownAccount = await connect(a.url, "service-reader", {}, newPassword);
    verified(ownAccount.response.ok, "new password accepted");
    const prepared = await rpc(ownAccount.socket, "twoFactor:prepare", { password: newPassword });
    verified(prepared.ok, "restricted TOTP enrollment prepared");
    const secret = new URL(prepared.uri).searchParams.get("secret")!;
    const enabled = await rpc(ownAccount.socket, "twoFactor:enable", { password: newPassword,
        code: totpFor(secret).generate() });
    verified(enabled.ok && enabled.recoveryCodes.length === 10, "restricted TOTP enrollment enabled");
    const challenge = await connect(a.url, "service-reader", {}, newPassword);
    verified(challenge.response.tokenRequired === true, "login requires second factor");
    verified((await rpc(challenge.socket, "login", { username: "service-reader",
        password: newPassword,
        token: enabled.recoveryCodes[0],
        challenge: challenge.response.challenge })).ok, "recovery code authenticates restricted user");
    const managedAccounts = await rpc(adminA.socket, "usersList");
    const serviceId = managedAccounts.data.find((entry: { username: string }) => entry.username === "service-reader").id;
    verified((await rpc(adminA.socket, "usersAccountAction", { id: serviceId,
        action: "reset2fa",
        password,
        confirm: true })).ok, "administrator recovers restricted account");
    verified((await connect(a.url, "service-reader", {}, newPassword)).response.ok, "login works after administrator 2FA recovery");
    verified((await rpc(adminA.socket, "usersAccountAction", { id: serviceId,
        action: "delete",
        password,
        confirm: true })).ok, "administrator deletes only account");
    verified(!(await connect(a.url, "service-reader", {}, newPassword)).response.ok, "deleted account cannot login");
    verified((await rpc(reverseUser.socket, "scopedRequest", { endpoint: reverse.endpoint,
        stack: remote,
        permission: "view" })).ok, "deleting account preserves stack and other users");
    detachBridge();
    reverseSocket.disconnect();
    verified(!(await rpc(reverseUser.socket, "scopedRequest", { endpoint: reverse.endpoint,
        stack: remote,
        permission: "restart" })).ok, "offline reverse agent fails closed");
    verified((await rpc(adminA.socket, "usersSave", { id: reader.id,
        username: "reader",
        active: false,
        grants: [] })).ok, "disable account");
    const disabled = await connect(a.url, "reader");
    verified(!disabled.response.ok, "disabled account cannot reconnect");
    const tokenSocket = io(a.url, { reconnection: false });
    sockets.push(tokenSocket);
    await new Promise<void>(resolve => tokenSocket.once("connect", () => resolve()));
    verified(!(await rpc(tokenSocket, "loginByToken", user.response.token)).ok, "disabled JWT revoked");
    console.log(`PASS: ${checks} integration assertions; isolated local and linked instances`);
} finally {
    for (const fixture of fixtures) {
        assert.ok(fixture.name.startsWith("acl-") && fixture.name.endsWith(suffix), "safe cleanup target");
        // Federation changes can disconnect an administrator's old UI socket.
        const cleanup = await connect(fixture.url);
        const result = await rpc(cleanup.socket, "agent", "", "deleteStack", fixture.name, { removeFiles: true });
        verified(result.ok, "fixture deleted through a fresh authenticated Dockge session");
    }
    for (const socket of sockets) {
        socket.disconnect();
    }
    for (const child of processes) {
        child.kill("SIGTERM");
    }
    await Promise.all(processes.map(child => child.exitCode !== null ? Promise.resolve() : once(child, "exit")));
    const current = execFileSync("docker", [ "ps", "-q", "--no-trunc" ], { encoding: "utf8" });
    for (const id of baseline) {
        assert.ok(current.includes(id), "existing container still running");
    }
    const remaining = execFileSync("docker", [ "ps", "-aq", "--filter", `label=dockge.test=scoped-users-${suffix}` ], { encoding: "utf8" }).trim();
    assert.equal(remaining, "", "all fixture containers removed");
    // This mkdtemp directory contains only these two isolated test databases.
    await rm(root, { recursive: true,
        force: true });
    console.log("Temporary servers, fixtures and test data removed; existing containers preserved.");
}
