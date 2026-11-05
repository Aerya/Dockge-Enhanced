import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { parse } from "@vue/compiler-sfc";
import { assignStackGroup, groupVisibleStacks, parseStackGroups, stackGroupStorageKey, stackIdentity } from "./stack-groups.ts";
import { RUNNING, EXITED } from "../../common/util-common.ts";

const { descriptor } = parse(readFileSync(new URL("./components/StackGroups.vue", import.meta.url), "utf8"));
const storage = new Map();
let failStorage = false;
const component = runInNewContext(descriptor.script.content.replace(/^import .*;$/gm, "").replace("export default", "result ="), {
    assignStackGroup, groupVisibleStacks, parseStackGroups, stackGroupStorageKey, stackIdentity, RUNNING,
    localStorage: {
        getItem: key => { if (failStorage) throw new Error("Storage blocked"); return storage.get(key) || null; },
        setItem: (key, value) => { if (failStorage) throw new Error("Storage blocked"); storage.set(key, value); },
    },
});
function context(username = "alice") {
    const ctx = { ...component.data(), username };
    for (const [key, method] of Object.entries(component.methods)) ctx[key] = method.bind(ctx);
    ctx.load();
    return ctx;
}

test("actual manager actions create, rename, assign across instances, collapse and persist", () => {
    storage.clear();
    const ctx = context();
    ctx.newName = "Websites"; ctx.addGroup();
    const id = ctx.preferences.groups[0].id;
    const local = { name: "site", endpoint: "" };
    const remote = { name: "site", endpoint: "https://agent.example" };
    ctx.assign(local, id); ctx.assign(remote, id);
    ctx.renameGroup(id, "Sites"); ctx.toggle(id);
    const restored = context();
    assert.equal(restored.preferences.enabled, true);
    assert.equal(restored.preferences.groups[0].name, "Sites");
    assert.equal(restored.preferences.groups[0].collapsed, true);
    assert.deepEqual([...restored.preferences.groups[0].members], [stackIdentity(local), stackIdentity(remote)]);
    ctx.removeGroup(id);
    restored.sync({ key: stackGroupStorageKey("alice") });
    assert.equal(restored.preferences.groups.length, 0);
});

test("account changes do not inherit another user's groups, nor clear their saved state", () => {
    storage.clear();
    const ctx = context();
    ctx.newName = "Private"; ctx.addGroup();
    ctx.username = "bob"; component.watch.username.handler.call(ctx);
    assert.equal(ctx.preferences.groups.length, 0);
    ctx.username = ""; component.watch.username.handler.call(ctx);
    assert.equal(ctx.preferences.enabled, false);
    assert.equal(context("alice").preferences.groups[0].name, "Private");
});

test("storage failures do not break the list and are reported", () => {
    failStorage = true;
    try {
        const ctx = context();
        assert.equal(ctx.storageError, true);
        assert.equal(ctx.preferences.enabled, false);
        ctx.newName = "Temporary"; ctx.addGroup();
        assert.equal(ctx.storageError, true);
        assert.equal(ctx.preferences.groups.length, 1);
    } finally { failStorage = false; }
});

test("group labels and warnings are translated in all five languages", () => {
    const keys = [...descriptor.template.content.matchAll(/\$t\('([^']+)'\)/g)].map(match => match[1]);
    assert.ok(keys.length >= 10);
    for (const locale of ["en", "fr", "de", "es", "zh-CN"]) {
        const messages = JSON.parse(readFileSync(new URL("./lang/" + locale + ".json", import.meta.url), "utf8"));
        for (const key of keys) assert.ok(messages[key], locale + ": " + key);
    }
});

test("collapsed headings count only non-running stacks from their visible input", () => {
    const ctx = context();
    assert.equal(ctx.notRunning([{ status: RUNNING }, { status: EXITED }]), 1);
    assert.equal(ctx.notRunning([{ status: RUNNING }]), 0);
});
