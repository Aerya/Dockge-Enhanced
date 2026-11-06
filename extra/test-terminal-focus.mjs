// Isolated component test: no backend, Docker socket, credentials or production data.
// PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs CHROMIUM_PATH=/usr/bin/chromium node extra/test-terminal-focus.mjs
import assert from "node:assert/strict";
import { createServer } from "vite";

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const server = await createServer({
    configFile: "frontend/vite.config.ts",
    server: { host: "127.0.0.1", port: 0, open: false },
    plugins: [{
        name: "isolated-terminal-fixture",
        resolveId(id) { if (id === "/__focus.js") { return id; } },
        load(id) {
            if (id !== "/__focus.js") { return; }
            return `
import { createApp, h } from 'vue';
import Terminal from '/src/components/Terminal.vue';
import '@xterm/xterm/css/xterm.css';
window.fixture = createApp({
  methods: {
    bindTerminal() {}, unbindTerminal() {}, toastRes() {}, toastError() {},
    emitAgent(...args) { const callback = args.at(-1); if (typeof callback === 'function') callback({ok:true}); }
  },
  render() { return h('div', [h('input', {id:'search'}), h(Terminal, {
    ref:'viewer', name:'isolated-test', endpoint:'', rows:8,
    mode:new URLSearchParams(location.search).get('mode')
  })]); }
}).mount('#app');`;
        },
        configureServer(vite) {
            vite.middlewares.use((req, res, next) => {
                if (!req.url?.startsWith("/__fixture?")) { return next(); }
                res.setHeader("Content-Type", "text/html");
                res.end('<div id="app"></div><script type="module" src="/__focus.js"></script>');
            });
        },
    }],
});
let browser;
try {
    await server.listen();
    const port = server.httpServer.address().port;
    browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH });
    for (const mobile of [ false, true ]) {
        const context = await browser.newContext({
            viewport: mobile ? { width: 390, height: 844 } : { width: 1280, height: 800 },
            isMobile: mobile, hasTouch: mobile,
        });
        for (const mode of [ "displayOnly", "interactive", "mainTerminal" ]) {
            const page = await context.newPage();
            const errors = [];
            page.on("pageerror", error => errors.push(error.message));
            await page.goto(`http://127.0.0.1:${port}/__fixture?mode=${mode}`);
            await page.waitForFunction(() => window.fixture?.$refs.viewer?.terminal?.textarea);
            const state = await page.evaluate(() => {
                const terminal = window.fixture.$refs.viewer.terminal;
                return { focused: document.activeElement === terminal.textarea, readOnly: terminal.textarea.readOnly };
            });
            assert.equal(state.focused, !mobile && mode !== "displayOnly");
            assert.equal(state.readOnly, mode === "displayOnly");
            await page.locator("#search").fill("log line");
            await page.evaluate(async () => {
                const viewer = window.fixture.$refs.viewer;
                await new Promise(resolve => viewer.terminal.write("log line\\r\\n", resolve));
                viewer.revealSearchMatch({ line: 0 });
                await new Promise(resolve => requestAnimationFrame(resolve));
            });
            assert.equal(await page.evaluate(() => document.activeElement.id), "search");
            if (mode !== "displayOnly") {
                await page.locator(".xterm-screen").click({ position: { x: 30, y: 10 } });
                assert.equal(await page.evaluate(() => document.activeElement === window.fixture.$refs.viewer.terminal.textarea), true);
            }
            assert.deepEqual(errors, []);
            console.log(`PASS ${mobile ? "mobile" : "desktop"} ${mode}: mount, search and explicit focus`);
            await page.close();
        }
        await context.close();
    }
} finally {
    await browser?.close();
    await server.close();
}
