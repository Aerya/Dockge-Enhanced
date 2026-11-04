import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { parse } from "@vue/compiler-sfc";

const { descriptor } = parse(readFileSync(new URL("./components/ConfigurationTools.vue", import.meta.url), "utf8"));
const component = runInNewContext(descriptor.script.content.replace("export default", "result ="), { setTimeout, clearTimeout });

test("configuration tools labels exist in all five supported languages", () => {
    const sources = [ "ConfigurationTools.vue", "EnvForm.vue", "settings/Diagnostics.vue" ].map(file => readFileSync(new URL(`./components/${file}`, import.meta.url), "utf8"));
    const keys = sources.flatMap(source => Array.from(source.matchAll(/\$t\(['"]([^'"]+)['"]\)/g), match => match[1]));
    for (const language of [ "en", "fr", "de", "es", "zh-CN" ]) {
        const messages = JSON.parse(readFileSync(new URL(`./lang/${language}.json`, import.meta.url), "utf8"));
        for (const key of keys) assert.ok(messages[key], `${language}: ${key}`);
    }
});
function instance(emitAgent) {
    const context = { ...component.data(), endpoint: "", stackName: "fixture", diagnostics: false, $root: { emitAgent }, $emit: () => {} };
    for (const [ name, method ] of Object.entries(component.methods)) context[name] = method.bind(context);
    return context;
}

test("merged secrets require explicit confirmation without a blocking browser dialog", async () => {
    let calls = 0;
    const context = instance((endpoint, event, payload, callback) => {
        calls++;
        assert.equal(event, "configurationTools");
        assert.equal(payload.action, "merged");
        assert.equal(payload.confirmed, true);
        callback({ ok: true, data: "resolved fixture" });
    });
    context.merged();
    assert.equal(calls, 0);
    assert.equal(context.config, null);
    await context.confirmAction();
    assert.equal(context.config, "resolved fixture");
    assert.equal(calls, 1);
    assert.equal(context.pending, null);
});

test("changing instances discards pending confirmations and stale secret responses", async () => {
    const callbacks = [];
    const context = instance((endpoint, event, payload, callback) => callbacks.push(callback));
    context.merged();
    const old = context.confirmAction();
    context.restore("old-revision");
    context.endpoint = "peer";
    const fresh = context.load();
    assert.equal(context.pending, null);
    callbacks[0]({ ok: true, data: "old-instance-secret" });
    callbacks[1]({ ok: true, data: [] });
    await Promise.all([ old, fresh ]);
    assert.equal(context.config, null);
    assert.equal(context.busy, false);
});

test("successful restore refreshes files and history, failure never announces success", async () => {
    const context = instance((endpoint, event, payload, callback) => callback({ ok: true, data: payload.action === "restore" ? true : [] }));
    let restored = 0;
    context.$emit = event => { assert.equal(event, "restored"); restored++; };
    context.restore("revision");
    await context.confirmAction();
    assert.equal(restored, 1);
    assert.equal(context.success, true);
    context.$root.emitAgent = (endpoint, event, payload, callback) => callback({ ok: false, msg: "configTools.unavailable" });
    context.restore("revision");
    await context.confirmAction();
    assert.equal(restored, 1);
    assert.equal(context.success, false);
    assert.equal(context.error, "configTools.unavailable");
});
