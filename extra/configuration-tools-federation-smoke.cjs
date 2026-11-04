const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { io } = require("socket.io-client");
const credentials = JSON.parse(readFileSync(process.env.CONFIG_TOOLS_LOCAL_CREDENTIALS, "utf8"));
const peer = JSON.parse(readFileSync(process.env.CONFIG_TOOLS_PEER_CREDENTIALS, "utf8"));
const socket = io("http://127.0.0.1:5056", { transports: ["websocket"], reconnection: false });
const call = (event, ...args) => new Promise((resolve, reject) => socket.timeout(30000).emit(event, ...args, (error, response) => error ? reject(error) : resolve(response)));
const ok = result => { assert.equal(result.ok, true, result.msg); return result; };
(async () => {
    await new Promise((resolve, reject) => { socket.once("connect", resolve); socket.once("connect_error", reject); });
    ok(await call("login", credentials));
    if (process.env.CONFIG_TOOLS_REUSE_LINK !== "true") {
        ok(await call("addAgent", { url: "http://127.0.0.1:5057", ...peer, displayName: "Test peer", self: { url: "http://127.0.0.1:5056", displayName: "Test local" } }));
    }
    const remote = (event, ...args) => call("agent", "127.0.0.1:5057", event, ...args);
    const payload = { stack: "config-fixture", action: "history" };
    const history = ok(await remote("configurationTools", payload)).data;
    assert.ok(history.length >= 2);
    const local = ok(await call("agent", "", "configurationTools", payload)).data;
    assert.notEqual(local[0].id, history[0].id);
    assert.equal((await remote("configurationTools", { ...payload, action: "restore", id: local[0].id, confirmed: true })).ok, false);
    ok(await remote("configurationTools", { ...payload, action: "restore", id: history.at(-1).id, confirmed: true }));
    const merged = ok(await remote("configurationTools", { ...payload, action: "merged", confirmed: true })).data;
    assert.match(merged, /TEST_VALUE: first/);
    const restored = ok(await remote("getStack", "config-fixture")).stack;
    assert.equal(restored.composeENV, "TEST_VALUE=first\n");
    const diagnostics = ok(await remote("configurationTools", { action: "diagnostics" })).data;
    assert.equal(diagnostics.length, 6);
    console.log("PASS: linked-instance history/merged/restore/diagnostics and cross-instance revision isolation");
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => socket.disconnect());
