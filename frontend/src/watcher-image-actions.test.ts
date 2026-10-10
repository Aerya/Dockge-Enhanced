import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const component = new URL("./components/watcher/WatcherImagesTab.vue", import.meta.url);
const locales = [ "en", "fr", "es", "zh-CN", "zh-TW" ];
const actionKeys = [
    "watcher.status.updateNow",
    "watcher.status.ignoreVersion",
    "watcher.status.clearIgnored",
    "watcher.rollback.btnTitle",
    "watcher.rollback.dismiss",
    "updates.pause.pauseTarget",
    "updates.pause.resumeTarget",
];

test("image update actions stay compact and accessible", async () => {
    const source = await readFile(component, "utf8");

    assert.match(source, /class="btn btn-xs btn-outline-primary image-action-button"/);
    assert.match(source, /class="btn btn-xs btn-rollback image-action-button"/);
    assert.match(source, /:aria-label="\$t\('watcher\.status\.updateNow'\)"/);
    assert.match(source, /:aria-label="\$t\('watcher\.rollback\.dismiss'\)"/);
    assert.match(source, /\.image-action-button\s*\{[\s\S]*width: 1\.85rem;/);
});

test("image action tooltips are available in every supported interface language", async () => {
    for (const locale of locales) {
        const source = JSON.parse(await readFile(new URL(`./lang/${locale}.json`, import.meta.url), "utf8")) as Record<string, string>;
        for (const key of actionKeys) {
            assert.ok(source[key]?.trim(), `${locale}: missing ${key}`);
        }
    }
});
