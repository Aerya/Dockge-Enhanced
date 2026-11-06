// Browser geometry regression: uses the real Bootstrap, component and density styles.
// PLAYWRIGHT_MODULE may point to an externally installed Playwright (no app dependency).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { compileString, compile } from "sass";
import { parse, compileStyle } from "@vue/compiler-sfc";

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const root = new URL("../", import.meta.url);
process.chdir(root.pathname);
const component = parse(readFileSync("frontend/src/components/Container.vue", "utf8")).descriptor;
const options = { loadPaths: [ "node_modules", "frontend/src/styles" ], logger: { warn() {} } };
const componentCss = compileStyle({
    source: compileString('@import "vars.scss";\n' + component.styles[0].content, options).css,
    filename: "Container.vue", id: "data-v-fixture", scoped: true,
});
assert.deepEqual(componentCss.errors, []);
const base = compile("node_modules/bootstrap/scss/bootstrap.scss", options).css + componentCss.code;
const densitySource = process.env.LAYOUT_BASELINE
    ? execFileSync("git", [ "show", `${process.env.LAYOUT_BASELINE}:frontend/src/styles/compact.scss` ], { encoding: "utf8" })
    : readFileSync("frontend/src/styles/compact.scss", "utf8");
const density = compileString(densitySource, options).css;
const row = `<div class="container service-readonly"><div class="row"><div class="col-12">
    <h4>demo-service</h4><div class="image">example/image:latest</div>
    <div class="container-auto-update"><label class="container-auto-update-label">Auto update</label>
    <select class="form-select form-select-sm container-auto-update-select"><option>Scheduled</option></select>
    <input type="time" value="02:00" class="form-control form-control-sm container-auto-update-time"></div>
    <div class="service-status-line">running · CPU 1% · 128 MiB</div>
    <div class="container-action-bar">${Array.from({ length: 8 }, () => '<button class="btn container-action">↻</button>').join("")}</div>
    <div class="container-volumes">Mounted volumes</div><details class="container-instances"><summary>Containers</summary></details>
    </div></div></div>`;
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium" });
try {
    const page = await browser.newPage();
    for (const width of [ 390, 1024, 1200, 1366, 1440, 1920, 2560, 3440 ]) {
        await page.setViewportSize({ width, height: 900 });
        await page.setContent(`<style>${base}${density}
        body {margin:0} main {margin:12px} @media(min-width:1200px){main{margin-left:350px}}
        .container-action-bar{display:flex;flex-wrap:wrap}</style>
        <body class="compact-interface"><main class="compose-page compact-workspace"><div id="stack-containers">
        <div class="compact-service-head"><span>Service</span><span>Image</span><span>State</span><span>Auto update</span><span>Actions</span></div>
        ${row.replace(/<([a-z][\w-]*)/g, "<$1 data-v-fixture")}${row.replace(/<([a-z][\w-]*)/g, "<$1 data-v-fixture")}</div></main></body>`);
        const geometry = await page.evaluate(() => {
            const rect = selector => {
                const { x, width, right } = document.querySelector(selector).getBoundingClientRect();
                return { x, width, right };
            };
            return {
                headers: Array.from(document.querySelectorAll(".compact-service-head span"), e => e.getBoundingClientRect().x),
                cells: [ "h4", ".image", ".service-status-line", ".container-auto-update", ".container-action-bar" ].map(s => rect(".col-12 > " + s)),
                select: rect("select"), time: rect("input"), row: rect(".service-readonly"),
                parent: rect("#stack-containers"), overflow: document.documentElement.scrollWidth > innerWidth,
            };
        });
        assert.ok(Math.abs(geometry.select.width - geometry.time.width) < 1, `equal field widths at ${width}`);
        assert.equal(geometry.overflow, false, `no page overflow at ${width}`);
        assert.ok(Math.abs(geometry.row.width - geometry.parent.width) < 3, `full-width row at ${width}`);
        if (width >= 1200) {
            geometry.cells.forEach((cell, i) => assert.ok(Math.abs(cell.x - geometry.headers[i]) < 1, `column ${i} aligned at ${width}`));
            assert.ok(geometry.cells[4].x - geometry.time.right >= 11, `action spacing at ${width}`);
        }
        console.log(`PASS compact geometry ${width}px`);
    }
    // The override must not leak into the classic interface.
    await page.locator("body").evaluate(e => e.classList.remove("compact-interface"));
    assert.ok(await page.locator(".service-readonly").first().evaluate(e => getComputedStyle(e).maxWidth !== "none"));
    console.log("PASS classic Bootstrap max-width preserved");
} finally {
    await browser.close();
}
