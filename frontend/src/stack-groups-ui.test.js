import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { parse } from "@vue/compiler-sfc";
import { assignStackGroup, groupVisibleStacks, importStackGroups, parseStackGroups, stackGroupStorageKey, stackIdentity, canReparentStackGroup, stackGroupPath } from "./stack-groups.ts";
import { RUNNING, EXITED } from "../../common/util-common.ts";

const { descriptor } = parse(readFileSync(new URL("./components/StackGroups.vue", import.meta.url), "utf8"));
const storage = new Map();
const component = runInNewContext(descriptor.script.content.replace(/^import .*;$/gm, "").replace("export default", "result ="), {
    assignStackGroup, groupVisibleStacks, importStackGroups, parseStackGroups, stackGroupStorageKey, stackIdentity, canReparentStackGroup, stackGroupPath, RUNNING,
    localStorage: { getItem: key => storage.get(key) || null, removeItem: key => storage.delete(key) },
});
function context(server, username = "alice") {
    const ctx = { ...component.data(), username };
    for (const [key, method] of Object.entries(component.methods)) ctx[key] = method.bind(ctx);
    ctx.request = async (event, input) => {
        const current = server.get(ctx.username) || { revision: 0, preferences: parseStackGroups(null) };
        if (event === "stackGroups:get") return structuredClone(current);
        if (input.revision !== current.revision) throw new Error("stackGroups.conflict");
        const next = { revision: current.revision + 1, preferences: JSON.parse(JSON.stringify(input.preferences)) };
        server.set(ctx.username, next);
        return structuredClone(next);
    };
    return ctx;
}
test("manager actions persist server-side across fresh browsers and preserve federated identities", async () => {
    const server = new Map();
    const ctx = context(server);
    await ctx.load();
    ctx.newName = "Websites"; await ctx.addGroup();
    const id = ctx.preferences.groups[0].id;
    await ctx.assign({ name: "site" }, id);
    await ctx.assign({ name: "site", endpoint: "agent.example" }, id);
    await ctx.renameGroup(id, "Sites"); await ctx.toggle(id);
    const restored = context(server);
    await restored.load();
    assert.equal(restored.preferences.groups[0].name, "Sites");
    assert.equal(restored.preferences.groups[0].collapsed, true);
    assert.equal(restored.preferences.groups[0].members.length, 2);
    await restored.removeGroup(id);
    await ctx.load();
    assert.equal(ctx.preferences.groups.length, 0);
});
test("parent changes persist, cycles are excluded and removing a parent preserves its children", async () => {
    const server = new Map();
    const ctx = context(server);
    await ctx.load();
    ctx.newName = "Production"; await ctx.addGroup();
    const parent = ctx.preferences.groups[0].id;
    ctx.newName = "Media"; await ctx.addGroup();
    const child = ctx.preferences.groups[1].id;
    await ctx.reparent(child, parent);
    assert.equal(ctx.preferences.groups[1].parentId, parent);
    assert.equal(ctx.parentOptions(parent).length, 0);
    await ctx.reparent(parent, child);
    assert.equal(ctx.preferences.groups[0].parentId, undefined);
    await ctx.assign({ name: "plex", endpoint: "linked.example" }, child);
    const restored = context(server); await restored.load();
    assert.equal(restored.groupPath(child), "Production / Media");
    await restored.removeGroup(parent);
    assert.equal(restored.preferences.groups[0].parentId, undefined);
    assert.equal(restored.preferences.groups[0].members.length, 1);
});
test("account switching clears form drafts and never inherits another account's groups", async () => {
    const server = new Map();
    const ctx = context(server);
    await ctx.load(); ctx.newName = "Private"; await ctx.addGroup();
    ctx.newName = "Private draft"; ctx.assignmentSearch = "secret"; ctx.username = "bob";
    await component.watch.username.handler.call(ctx);
    assert.equal(ctx.newName, ""); assert.equal(ctx.assignmentSearch, "");
    assert.equal(ctx.preferences.groups.length, 0);
    ctx.username = "alice";
    await component.watch.username.handler.call(ctx);
    assert.equal(ctx.preferences.groups[0].name, "Private");
});
test("stale writes reload server state with a conflict warning, not a silent overwrite", async () => {
    const server = new Map();
    const a = context(server), b = context(server);
    await a.load(); await b.load();
    a.newName = "First"; await a.addGroup();
    b.newName = "Stale"; await b.addGroup();
    assert.equal(b.error, "stackGroups.conflict");
    assert.equal(b.preferences.groups[0].name, "First");
    assert.equal(b.busy, false);
    b.newName = "Second"; await b.addGroup();
    assert.equal(server.get("alice").preferences.groups.length, 2);
});
test("late responses cannot populate a different account or a disconnected view", async () => {
    const ctx = context(new Map());
    let release;
    ctx.request = () => new Promise(resolve => { release = resolve; });
    const pending = ctx.load();
    ctx.username = "bob"; ctx.disconnected();
    release({ revision: 99, preferences: { enabled: true, groups: [{ id: "private" }] } });
    await pending;
    assert.equal(ctx.revision, 0);
    assert.equal(ctx.preferences.groups.length, 0);
});
test("failed requests keep the confirmed state and preserve local import data", async () => {
    const ctx = context(new Map());
    await ctx.load();
    ctx.legacy = { enabled: true, groups: [{ id: "old", name: "Old", collapsed: false, members: [] }] };
    storage.set(stackGroupStorageKey("alice"), JSON.stringify(ctx.legacy));
    ctx.request = async () => { throw new Error("offline"); };
    await ctx.importLegacy();
    assert.equal(ctx.preferences.groups.length, 0);
    assert.equal(ctx.legacy.groups.length, 1);
    assert.equal(storage.has(stackGroupStorageKey("alice")), true);
    assert.equal(ctx.ready, false);
});
test("explicit import merges and only removes local data after acknowledgement", async () => {
    const ctx = context(new Map());
    await ctx.load();
    ctx.legacy = { enabled: true, groups: [{ id: "old", name: "Old", collapsed: false, members: [] }] };
    storage.set(stackGroupStorageKey("alice"), JSON.stringify(ctx.legacy));
    await ctx.importLegacy();
    assert.equal(ctx.preferences.groups[0].name, "Old");
    assert.equal(storage.has(stackGroupStorageKey("alice")), false);
});
test("group labels and warnings are translated in all five languages", () => {
    const keys = [...descriptor.template.content.matchAll(/\$t\('([^']+)'\)/g)].map(match => match[1]);
    for (const locale of ["en", "fr", "de", "es", "zh-CN"]) {
        const messages = JSON.parse(readFileSync(new URL("./lang/" + locale + ".json", import.meta.url), "utf8"));
        for (const key of [...keys, "stackGroups.conflict", "stackGroups.invalid", "stackGroups.importLimit", "stackGroups.storageError"]) assert.ok(messages[key], locale + ": " + key);
    }
});
test("collapsed headings count only visible non-running stacks", () => {
    assert.equal(context(new Map()).notRunning([{ status: RUNNING }, { status: EXITED }]), 1);
});
