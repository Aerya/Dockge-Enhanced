import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { parse } from "@vue/compiler-sfc";
import * as Vue from "vue";
import { renderToString } from "@vue/server-renderer";
import { applyResourceLimits, readResourceLimits } from "./service-resource-limits.ts";

const source = readFileSync(new URL("./components/ServiceResourceLimits.vue", import.meta.url), "utf8");
const { descriptor } = parse(source);
const component = runInNewContext(descriptor.script.content.replace(/^import .*;$/gm, "").replace("export default", "result ="), { applyResourceLimits, readResourceLimits });
component.render = Vue.compile(descriptor.template.content);

test("editor shows existing limits and does not write on opening", async () => {
    const service = { cpus: 0.5, mem_limit: "128M" };
    let writes = 0;
    const app = Vue.createSSRApp(component, { service, onApply: () => writes++ });
    app.config.globalProperties.$t = key => key;
    const html = await renderToString(app);
    assert.match(html, /value="0.5"/);
    assert.match(html, /value="128M"/);
    assert.match(html, /disabled/);
    assert.equal(writes, 0);
});

test("apply emits only a valid draft; no Docker or socket action", () => {
    const events = [];
    const context = { service: { image: "busybox:stable" }, cpu: "bad", memory: "128M", $emit: (...args) => events.push(args) };
    component.methods.apply.call(context);
    assert.equal(context.error, "invalidCpu");
    assert.equal(events.length, 0);
    context.cpu = "0.5";
    component.methods.apply.call(context);
    assert.equal(events.length, 1);
    assert.equal(events[0][0], "apply");
    assert.equal(events[0][1].deploy.resources.limits.memory, "128M");
    assert.deepEqual(context.service, { image: "busybox:stable" });
});

test("malformed deployment mapping is shown as non-editable, never overwritten", async () => {
    const app = Vue.createSSRApp(component, { service: { deploy: [] } });
    app.config.globalProperties.$t = key => key;
    const html = await renderToString(app);
    assert.match(html, /resourceLimits.invalidStructure/);
    assert.equal((html.match(/disabled/g) || []).length, 3);
});

test("all five locales include the editor and its release announcement", () => {
    const read = locale => JSON.parse(readFileSync(new URL(`./lang/${locale}.json`, import.meta.url), "utf8"));
    const keys = Object.keys(read("en")).filter(key => key.startsWith("resourceLimits."));
    assert.ok(keys.length >= 10);
    keys.push("releaseNews.item.serviceResourceLimits");
    for (const locale of ["en", "fr", "de", "es", "zh-CN"]) {
        for (const key of keys) assert.ok(read(locale)[key]?.trim(), `${locale}: ${key}`);
    }
});
