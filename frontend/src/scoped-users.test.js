import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { parse } from "@vue/compiler-sfc";
import * as Vue from "vue";
import { renderToString } from "@vue/server-renderer";

test("all five supported feature locales include permissions, help and release news", () => {
    const read = locale => JSON.parse(readFileSync(new URL(`./lang/${locale}.json`, import.meta.url), "utf8"));
    const keys = Object.keys(read("en")).filter(key => key.startsWith("access."));
    keys.push("releaseNews.item.scopedUsers", "localInstance", "cancel");
    for (const locale of ["en", "fr", "de", "es", "zh-CN"]) {
        const messages = read(locale);
        for (const key of keys) assert.ok(messages[key]?.trim(), `${locale}: ${key}`);
    }
});

function component(file, context = {}) {
    const { descriptor } = parse(readFileSync(new URL(file, import.meta.url), "utf8"));
    const options = runInNewContext(descriptor.script.content.replace(/^import .*;$/gm, "").replace("export default", "result ="), context);
    return { ...options, render: Vue.compile(descriptor.template.content) };
}

test("restricted root replaces rather than merely hides the administrator router", async () => {
    const app = component("./App.vue", { ScopedWorkspace: { template: "<div>restricted-workspace</div>" } });
    for (const role of ["restricted", "admin"]) {
        const root = { data: () => ({ loggedIn: true, userAccess: { role } }), render: () => Vue.h(app) };
        const instance = Vue.createSSRApp(root);
        instance.component("router-view", { template: "<div>administrator-router</div>" });
        const html = await renderToString(instance);
        assert.equal(html.includes("restricted-workspace"), role === "restricted");
        assert.equal(html.includes("administrator-router"), role === "admin");
    }
});

test("editing a user preserves distinct rights per stack, including offline agents", () => {
    const users = component("./components/settings/Users.vue", { USER_PERMISSIONS: ["view", "logs", "restart"] });
    const context = { ...users.data(), $t: key => key, $root: { completeStackList: {}, agentList: {} } };
    Object.assign(context, users.methods);
    const user = { id: 2, grants: [
        { endpoint: "", stack: "local", permissions: ["view", "logs"] },
        { endpoint: "offline:5001", stack: "remote", permissions: ["view", "restart"] },
    ] };
    context.edit(user);
    assert.equal(JSON.stringify(context.permissionsByStack['["","local"]']), '["view","logs"]');
    assert.equal(JSON.stringify(context.permissionsByStack['["offline:5001","remote"]']), '["view","restart"]');
    assert.equal(users.computed.stackOptions.call(context).length, 2);
    context.permissionsByStack['["","local"]'].push("restart");
    assert.equal(user.grants[0].permissions.length, 2, "draft must not mutate original permissions");
    context.ensurePermissions('["","new"]');
    assert.equal(JSON.stringify(context.permissionsByStack['["","new"]']), '["view"]');
});

test("workspace renders only granted actions and escapes application logs", async () => {
    const workspace = component("./pages/ScopedWorkspace.vue", { statusNameShort: () => "running" });
    const base = workspace.data();
    workspace.data = () => ({ ...base, grants: [{ endpoint: "", stack: "example", permissions: ["view", "logs"] }], logs: { '["","example"]': '<script>secret()</script>' } });
    const app = Vue.createSSRApp(workspace);
    app.config.globalProperties.$t = key => key;
    app.config.globalProperties.socketIO = { connected: true };
    const html = await renderToString(app);
    assert.ok(html.includes("access.logs"));
    assert.ok(!html.includes("access.restart"));
    assert.ok(!html.includes("<script>"));
    assert.ok(html.includes("&lt;script&gt;"));
});
