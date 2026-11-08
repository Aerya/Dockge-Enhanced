import assert from "node:assert/strict";
import { createServer } from "vite";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const server = await createServer({ configFile: "frontend/vite.config.ts", server: { host: "127.0.0.1", port: 0, open: false }, plugins: [{
    name: "log-tabs-fixture",
    resolveId(id) { if (id === "/__logs.js") return id; },
    load(id) {
        if (id !== "/__logs.js") return;
        return `import {createApp,h} from 'vue';import Tabs from '/src/components/ContainerLogTabs.vue';import 'bootstrap/dist/css/bootstrap.min.css';
window.calls=[];window.pending=[];window.delay=false;
const app=createApp({data:()=>({endpoint:'remote',containers:[{id:'a'.repeat(64),name:'replica-1'},{id:'b'.repeat(64),name:'replica-2'}]}),methods:{emitAgent(endpoint,event,stack,id,cb){window.calls.push({endpoint,event,stack,id});const done=()=>cb({ok:true,logs:Array.from({length:200},(_,i)=>id[0]+' line '+i+' <script>bad</script>').join('\\n')});if(window.delay)window.pending.push(done);else setTimeout(done,5)}},render(){return h(Tabs,{ref:'tabs',stackName:'demo',endpoint:this.endpoint,containers:this.containers})}});app.config.globalProperties.$t=k=>k;window.fixture=app.mount('#app');`;
    },
    configureServer(vite) { vite.middlewares.use((req, res, next) => {
        if (req.url !== "/__logs") return next();
        res.setHeader("Content-Type", "text/html");
        res.end('<div id="app"></div><script type="module" src="/__logs.js"></script>');
    }); },
}] });
let browser;
try {
    await server.listen();
    browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium", headless: true });
    for (const width of [390, 1280]) {
        const page = await browser.newPage({ viewport: { width, height: 900 } });
        const errors = [];
        page.on("pageerror", e => errors.push(e.message));
        await page.goto(server.resolvedUrls.local[0] + "__logs");
        await page.getByRole("tab", { name: /replica-1/ }).click();
        await page.waitForFunction(() => document.querySelector('pre')?.textContent.includes('a line 199'));
        await page.locator('input[type=search]').fill("line 1");
        await page.getByText("logTabs.pause", { exact: true }).click();
        await page.locator("pre").evaluate(el => { el.scrollTop = 130; el.dispatchEvent(new Event("scroll")); });
        await page.getByRole("tab", { name: /replica-2/ }).click();
        await page.waitForFunction(() => document.querySelector('pre')?.textContent.includes('b line 199'));
        assert.equal(await page.locator('input[type=search]').inputValue(), "");
        await page.getByRole("tab", { name: /replica-1/ }).click();
        assert.equal(await page.locator('input[type=search]').inputValue(), "line 1");
        assert.equal(await page.getByText("logTabs.resume", { exact: true }).count(), 1);
        assert.equal(await page.locator("pre").evaluate(el => el.scrollTop), 130);
        assert.equal(await page.locator("pre script").count(), 0);
        await page.evaluate(() => { window.delay=true; });
        await page.getByRole("tab", { name: /replica-2/ }).click();
        await page.getByRole("tab", { name: /replica-1/ }).click();
        await page.evaluate(() => { window.pending.forEach(fn=>fn()); window.pending=[]; });
        assert.ok((await page.locator("pre").textContent()).startsWith("a line"));
        await page.evaluate(() => { window.fixture.containers=[]; });
        await page.waitForFunction(() => !document.querySelector('pre'));
        assert.equal(await page.getByRole("tab", { name: "logServiceAll" }).getAttribute("aria-selected"), "true");
        assert.ok((await page.evaluate(()=>window.calls)).every(c=>c.endpoint==='remote'&&c.event==='containerInstanceLogs'&&c.stack==='demo'));
        assert.deepEqual(errors, []);
        console.log(`PASS ${width}px: replica tabs, independent search/pause/scroll, stale reply rejected, removal fallback, linked RPC, escaped logs`);
        await page.close();
    }
} finally {
    await browser?.close();
    await server.close();
}
