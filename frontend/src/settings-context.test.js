import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import ts from "typescript";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
import timezone from "dayjs/plugin/timezone.js";
import { parse } from "@vue/compiler-sfc";
import * as Vue from "vue";
import { renderToString } from "@vue/server-renderer";
import { createRouter, createMemoryHistory, RouterView } from "vue-router";

dayjs.extend(utc);
dayjs.extend(timezone);
const utilURL = new URL("./util-frontend.ts", import.meta.url);
const utilSource = readFileSync(utilURL, "utf8")
    .replace(/^import .* from "\.\/i18n";$/m, "")
    .replace(/^import .* from "vue-toastification";$/m, "");
const utilModule = { exports: {} };
// Keep the real ESM namespace shape: CommonJS require() alone masks the
// double-default package export that crashes the browser bundle.
const imports = new Map();
const resolveImport = createRequire(utilURL);
for (const match of utilSource.matchAll(/^import .* from "([^"]+)";/gm)) {
    const specifier = match[1];
    const namespace = await import(pathToFileURL(resolveImport.resolve(specifier)).href,
        specifier.endsWith(".json") ? { with: { type: "json" } } : {});
    imports.set(specifier, { ...namespace, __esModule: true });
}
runInNewContext(ts.transpileModule(utilSource, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText, { exports: utilModule.exports, require: specifier => imports.get(specifier) });
const { timezoneList } = utilModule.exports;

test("real timezone package produces a usable scheduling list", () => {
    const zones = timezoneList();
    assert.ok(zones.length > 100);
    assert.ok(zones.some(zone => zone.value === "Europe/Paris"));
    assert.ok(zones.every(zone => Number.isFinite(zone.time)));
});

function loadComponent(path) {
    const { descriptor } = parse(readFileSync(new URL(path, import.meta.url), "utf8"));
    const component = runInNewContext(descriptor.script.content.replace(/^import .*;$/gm, "").replace("export default", "result ="), {
        timezoneList,
    });
    return { ...component, render: Vue.compile(descriptor.template.content) };
}

test("general settings render inside the actual nested router views", async () => {
    const settings = loadComponent("./pages/Settings.vue");
    const general = loadComponent("./components/settings/General.vue");
    const shell = { render: () => Vue.h(RouterView) };
    const router = createRouter({ history: createMemoryHistory(), routes: [{
        path: "/", component: shell, children: [{
            path: "", component: shell, children: [{
                path: "settings", component: settings, children: [{
                    path: "general", name: "settings-general", component: general,
                }, ...["appearance", "security", "globalEnv", "integrations", "automation", "about"].map(path => ({
                    path, component: { render: () => null },
                }))],
            }],
        }],
    }] });
    const app = Vue.createSSRApp(shell);
    app.config.globalProperties.$t = key => key;
    app.use(router);
    await router.push("/settings/general");
    await router.isReady();
    const html = await renderToString(app);
    assert.match(html, /id="scheduling-timezone"/);
    assert.match(html, /id="default-compose-template"/);
});
