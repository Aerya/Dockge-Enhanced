import assert from "node:assert/strict";
import { createServer } from "vite";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const server = await createServer({ configFile: "frontend/vite.config.ts", server: { host: "127.0.0.1", port: 0, open: false }, plugins: [{
    name: "automation-fixture",
    resolveId(id) { if (id === "/__automation.js") return id; },
    load(id) {
        if (id !== "/__automation.js") return;
        return `import {createApp,h} from 'vue';import Automation from '/src/components/settings/Automation.vue';import 'bootstrap/dist/css/bootstrap.min.css';
const app=createApp({methods:{getAuthToken:()=> 'fixture',toastSuccess(){}},render:()=>h(Automation)});app.config.globalProperties.$t=k=>k;app.component('FontAwesomeIcon',{render:()=>null});app.mount('#app');`;
    },
    configureServer(vite) { vite.middlewares.use((req, res, next) => {
        if (req.url !== "/__automation") return next();
        res.setHeader("Content-Type", "text/html");
        res.end('<div id="app"></div><script type="module" src="/__automation.js"></script>');
    }); },
}] });
let browser;
try {
    await server.listen();
    browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium", headless: true });
    for (const width of [390, 1280]) {
        const page = await browser.newPage({ viewport: { width, height: 900 } });
        const errors = [];
        const writes = [];
        page.on("pageerror", e => errors.push(e.message));
        await page.route("**/api/automation/**", async route => {
            if (route.request().method() === "POST") {
                writes.push(route.request().postDataJSON());
                return route.fulfill({ json: { ok: true, data: { token: "test-only-token" } } });
            }
            return route.fulfill({ json: { ok: true, data: [] } });
        });
        await page.goto(server.resolvedUrls.local[0] + "__automation");
        await page.locator("#automation-token-name").fill("creator");
        await page.locator('input[value="stack:create"]').check();
        await page.getByText("automation.allStacks", { exact: true }).click();
        await page.getByText("automation.tokens.create", { exact: true }).click();
        assert.equal(writes.length, 0, "risk acknowledgement is mandatory");
        await page.getByText("automation.createRisk", { exact: true }).click();
        await page.getByText("automation.tokens.create", { exact: true }).click();
        await page.locator('input[value="test-only-token"]').waitFor();
        assert.equal(writes.length, 1);
        assert.equal(writes[0].acknowledgeCreateRisk, true);
        assert.ok(writes[0].permissions.includes("stack:create"));
        assert.deepEqual(writes[0].stacks, ["*"]);
        assert.equal(await page.locator("input[required][type=checkbox]").isChecked(), false);
        assert.deepEqual(errors, []);
        console.log(`PASS ${width}px: actual token form, risk acknowledgement and submitted permissions`);
        await page.close();
    }
} finally {
    await browser?.close();
    await server.close();
}
