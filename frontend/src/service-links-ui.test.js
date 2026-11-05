import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { parse } from "@vue/compiler-sfc";
import { defaultServiceLinks, safeServiceUrl } from "../../common/service-links";

const source = readFileSync(new URL("./pages/ServiceLinks.vue", import.meta.url), "utf8");
const { descriptor } = parse(source);
const component = runInNewContext(descriptor.script.content.replace(/^import .*;$/m, "").replace("export default", "result ="), { defaultServiceLinks, safeServiceUrl, setTimeout, clearTimeout });
function instance(emitAgent) {
    const context = { ...component.data(), endpoints: [ "", "remote" ], $t: key => key, $root: { emitAgent } };
    for (const [ name, method ] of Object.entries(component.methods)) context[name] = method.bind(context);
    return context;
}

test("linked stacks with identical names remain distinct and unsafe responses never become links", async () => {
    const view = instance((endpoint, event, callback) => callback({ ok: true, links: [{ stack: "app", url: "https://example.org/" }, { stack: "app", url: "javascript:alert(1)" }] }));
    await view.loadStacks();
    assert.equal(view.remote.length, 2);
    assert.notEqual(view.remote[0].id, view.remote[1].id);
});

test("stale linked responses cannot replace a newer refresh", async () => {
    const callbacks = [];
    const view = instance((endpoint, event, callback) => callbacks.push(callback));
    const old = view.loadStacks();
    const recent = view.loadStacks();
    for (const callback of callbacks.slice(2)) callback({ ok: true, links: [{ stack: "new", url: "https://example.org" }] });
    await recent;
    for (const callback of callbacks.slice(0, 2)) callback({ ok: true, links: [{ stack: "old", url: "https://example.org" }] });
    await old;
    assert.equal(view.remote.every(link => link.stack === "new"), true);
});

test("unavailable agents are reported and do not hide successful local links", async () => {
    const view = instance((endpoint, event, callback) => callback(endpoint ? { ok: false } : { ok: true, links: [{ stack: "local", url: "https://example.org" }] }));
    await view.loadStacks();
    assert.equal(view.unavailable, true);
    assert.equal(view.remote.length, 1);
});

test("manual links can be added, reordered, disabled and removed without mutating Compose links", async () => {
    const view = instance(() => {});
    view.request = async (event, config) => ({ config: { ...config, revision: config.revision + 1 } });
    view.remote = [{ id: "remote", url: "https://example.org/remote" }];
    for (const id of [ "a", "b" ]) {
        view.editing = { id, name: id, group: "Apps", enabled: true, url: `https://example.org/${id}` };
        await view.apply();
    }
    await view.move("b", -1);
    assert.equal(view.config.links[0].id, "b");
    view.editing = { ...view.config.links[0], enabled: false };
    await view.apply();
    assert.equal(view.config.links[0].enabled, false);
    await view.remove("a");
    assert.equal(view.config.links.length, 1);
    assert.equal(view.remote[0].id, "remote");
});

test("all service-link UI messages exist in the five supported languages", () => {
    const keys = [...source.matchAll(/(?:\$t|error =)\(?["']([^"']+)["']/g)].map(match => match[1]);
    for (const lang of [ "fr", "en", "de", "es", "zh-CN" ]) {
        const messages = JSON.parse(readFileSync(new URL(`./lang/${lang}.json`, import.meta.url), "utf8"));
        for (const key of keys) assert.ok(messages[key], `${lang}: ${key}`);
    }
});
