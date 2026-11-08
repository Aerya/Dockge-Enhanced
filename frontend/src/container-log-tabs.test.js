import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

function fixture() {
    const script = readFileSync(new URL("./components/ContainerLogTabs.vue", import.meta.url), "utf8").split("<script>")[1].split("</script>")[0];
    const component = vm.runInNewContext(script.replace("export default", "globalThis.component ="), { setTimeout, clearTimeout, setInterval, clearInterval });
    const calls = [];
    const state = { ...component.data(), enabled: true, endpoint: "remote", stackName: "demo", containers: [], $refs: {},
        $t: key => key, $emit() {}, $nextTick: fn => fn(), $root: { emitAgent: (...args) => calls.push(args) } };
    for (const [key, method] of Object.entries(component.methods)) state[key] = method.bind(state);
    for (const [key, getter] of Object.entries(component.computed)) Object.defineProperty(state, key, { get: getter.bind(state) });
    return { state, calls, component };
}

test("container tabs ignore late replies, preserve independent views and reset on permission failure", () => {
    const { state, calls } = fixture();
    state.select("one");
    const old = calls[0].at(-1);
    state.select("two");
    old({ ok: true, logs: "wrong container" });
    assert.equal(state.view.logs, "");
    calls[1].at(-1)({ ok: true, logs: "second\nERROR two" });
    state.view.search = "error";
    state.view.paused = true;
    state.view.scroll = 80;
    assert.equal(state.filteredLogs, "ERROR two");
    state.select("one");
    calls[2].at(-1)({ ok: true, logs: "first" });
    state.select("two");
    assert.equal(calls.length, 3, "paused tab does not refresh on return");
    assert.equal(state.view.search, "error");
    assert.equal(state.view.scroll, 80);
    state.refresh();
    calls[3].at(-1)({ ok: false, msg: "access denied" });
    assert.equal(state.view.logs, "");
    assert.equal(state.error, "logTabs.unavailable");
    state.cancel();
});

test("tabs bound cached snapshots and discard callbacks after instance change or unmount", () => {
    const { state, calls, component } = fixture();
    for (let i = 0; i < 25; i++) state.select(String(i));
    assert.equal(Object.keys(state.views).length, 20);
    state.endpoint = "other";
    component.watch.endpoint.call(state);
    calls.at(-1).at(-1)({ ok: true, logs: "old instance secret" });
    assert.equal(state.selected, "");
    assert.equal(Object.keys(state.views).length, 0);
    state.select("new");
    component.beforeUnmount.call(state);
    calls.at(-1).at(-1)({ ok: true, logs: "late" });
    assert.equal(state.view.logs, "");
});
