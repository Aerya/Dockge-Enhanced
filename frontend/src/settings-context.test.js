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
import { parseDocument } from "yaml";

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
const templatesModule = { exports: {} };
runInNewContext(ts.transpileModule(readFileSync(new URL("../../common/compose-templates.ts", import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, { exports: templatesModule.exports });

test("real timezone package produces a usable scheduling list", () => {
    const zones = timezoneList();
    assert.ok(zones.length > 100);
    assert.ok(zones.some(zone => zone.value === "Europe/Paris"));
    assert.ok(zones.every(zone => Number.isFinite(zone.time)));
});

function loadComponent(path, context = {}) {
    const { descriptor } = parse(readFileSync(new URL(path, import.meta.url), "utf8"));
    const component = runInNewContext(descriptor.script.content.replace(/^import .*;$/gm, "").replace("export default", "result ="), {
        timezoneList,
        ...templatesModule.exports,
        dayjs,
        parseDocument,
        TextEncoder,
        ...context,
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
    assert.match(html, /id="default-env-template"/);
    assert.match(html, /id="port-link-address-mode"/);
    assert.match(html, /value="hostname"/);
    assert.match(html, /value="ip"/);
});

test("loading and saving defaults preserves timezone and port preferences together", () => {
    let confirmations = 0;
    let saved = 0;
    const storage = {};
    const general = loadComponent("./components/settings/General.vue", {
        localStorage: storage,
        window: { confirm: () => { confirmations++; return true; } },
    });
    const context = {
        ...general.data(),
        settings: {
            composeTemplate: "services: {web: {image: nginx}}",
            composeEnvTemplate: "TZ=Europe/Paris\nPUID=1000",
            schedulingTimezone: "Europe/Paris",
            portLinkAddressMode: "ip",
            portLinkIp: "192.0.2.15",
        },
        $t: key => key,
        $root: { userTimezone: "Europe/Paris" },
        saveSettings: () => { saved++; },
    };
    general.watch.settingsLoaded.handler.call(context, true);
    assert.equal(context.composeEnvTemplateDraft, context.settings.composeEnvTemplate);
    assert.equal(context.composeTemplateDraft, context.settings.composeTemplate);
    assert.equal(context.originalSchedulingTimezone, "Europe/Paris");
    context.composeEnvTemplateDraft = "";
    general.methods.saveGeneral.call(context);
    assert.equal(saved, 1);
    assert.equal(confirmations, 0);
    assert.equal(context.settings.composeEnvTemplate, "");
    assert.equal(context.settings.portLinkAddressMode, "ip");
    assert.equal(context.settings.portLinkIp, "192.0.2.15");
    context.settings.schedulingTimezone = "UTC";
    general.methods.saveGeneral.call(context);
    assert.equal(confirmations, 1);
    assert.equal(saved, 2);
});

test("IP settings remain editable on mobile and preserve the explicit IP", async () => {
    const settings = loadComponent("./pages/Settings.vue");
    const general = loadComponent("./components/settings/General.vue");
    const settingsPage = {
        ...settings,
        data: () => ({ ...settings.data(), settings: { portLinkAddressMode: "ip", portLinkIp: "192.0.2.15" } }),
    };
    const shell = { render: () => Vue.h(RouterView) };
    const router = createRouter({ history: createMemoryHistory(), routes: [{
        path: "/settings", component: settingsPage, children: [{
            path: "general", name: "settings-general", component: general,
        }],
    }] });
    const app = Vue.createSSRApp({ ...shell, data: () => ({ isMobile: true }) });
    app.config.globalProperties.$t = key => key;
    app.use(router);
    await router.push("/settings/general");
    await router.isReady();
    const html = await renderToString(app);
    assert.match(html, /id="port-link-ip"/);
    assert.match(html, /value="192.0.2.15"/);
    assert.match(html, /portLinks.ipHelp/);
});
