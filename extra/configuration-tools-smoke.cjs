// Run only against a disposable localhost instance started with its own data/stacks.
const assert = require("node:assert/strict");
const { randomBytes } = require("node:crypto");
const { io } = require("socket.io-client");
const { writeFileSync } = require("node:fs");
const url = new URL(process.env.CONFIG_TOOLS_TEST_URL || "http://127.0.0.1:5056");
if (url.hostname !== "127.0.0.1" || !["5056", "5057"].includes(url.port)) throw new Error("Disposable localhost instance required");
const sockets = [];
const connect = async () => {
    const socket = io(url.origin, { transports: ["websocket"], reconnection: false });
    sockets.push(socket);
    await new Promise((resolve, reject) => { socket.once("connect", resolve); socket.once("connect_error", reject); });
    return socket;
};
const call = (socket, event, ...args) => new Promise((resolve, reject) => {
    socket.timeout(30000).emit(event, ...args, (error, response) => error ? reject(error) : resolve(response));
});
const agent = (socket, event, ...args) => call(socket, "agent", "", event, ...args);
const ok = result => { assert.equal(result.ok, true, result.msg); return result; };

(async () => {
    const admin = await connect();
    const password = randomBytes(24).toString("hex");
    ok(await call(admin, "setup", "fixture-admin", password));
    ok(await call(admin, "login", { username: "fixture-admin", password }));
    const compose = 'services:\n  web:\n    image: busybox:stable\n    network_mode: none\n    environment:\n      TEST_VALUE: ${TEST_VALUE}\n';
    ok(await agent(admin, "saveStack", "config-fixture", compose, "TEST_VALUE=first\n", true, ""));
    ok(await agent(admin, "saveStack", "config-fixture", compose, "TEST_VALUE=second\n", false, "services:\n  web:\n    labels:\n      fixture: override\n"));
    const request = payload => agent(admin, "configurationTools", { stack: "config-fixture", ...payload });
    const history = ok(await request({ action: "history" })).data;
    assert.equal(history.length, 1);
    assert.equal(JSON.stringify(history).includes("TEST_VALUE"), false);
    assert.equal((await request({ action: "merged" })).ok, false);
    const merged = ok(await request({ action: "merged", confirmed: true })).data;
    assert.match(merged, /TEST_VALUE: second/);
    assert.match(merged, /fixture: override/);
    assert.equal((await request({ action: "restore", id: history[0].id })).ok, false);
    ok(await request({ action: "restore", id: history[0].id, confirmed: true }));
    const restored = ok(await agent(admin, "getStack", "config-fixture")).stack;
    assert.equal(restored.composeENV, "TEST_VALUE=first\n");
    assert.equal(restored.composeOverrideYAML, "");
    assert.equal((await request({ action: "history", stack: "../escape" })).ok, false);
    const diagnostic = ok(await request({ action: "diagnostics" })).data;
    assert.equal(diagnostic.length, 6);
    assert.equal(diagnostic.find(item => item.key === "Compose").ok, true);
    const restrictedPassword = randomBytes(24).toString("hex");
    ok(await call(admin, "usersSave", { username: "fixture-restricted", password: restrictedPassword, active: true, grants: [] }));
    const restricted = await connect();
    ok(await call(restricted, "login", { username: "fixture-restricted", password: restrictedPassword }));
    for (const action of ["history", "merged", "restore", "diagnostics"]) {
        assert.equal((await agent(restricted, "configurationTools", { action, stack: "config-fixture", id: history[0].id, confirmed: true })).ok, false);
    }
    const anonymous = await connect();
    assert.equal((await agent(anonymous, "configurationTools", { action: "diagnostics" })).ok, false);
    if (process.env.CONFIG_TOOLS_TEST_CREDENTIALS) writeFileSync(process.env.CONFIG_TOOLS_TEST_CREDENTIALS, JSON.stringify({ username: "fixture-admin", password }), { mode: 0o600 });
    console.log("PASS: save/history/merged/override/restore/confirmation/traversal/diagnostics/admin/restricted/anonymous");
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => sockets.forEach(socket => socket.disconnect()));
