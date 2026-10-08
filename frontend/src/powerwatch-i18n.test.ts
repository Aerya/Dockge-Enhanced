import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const locales = [ "en", "fr", "es", "zh-CN", "zh-TW" ];

function messages(locale: string): Record<string, string> {
    return JSON.parse(readFileSync(new URL(`./lang/${locale}.json`, import.meta.url), "utf8")) as Record<string, string>;
}

test("all PowerWatch UI and release-news keys exist in every supported locale", () => {
    const english = messages("en");
    const expected = Object.keys(english).filter(key => key.startsWith("watcher.powerwatch.") || key === "releaseNews.item.powerWatchMonitoring");
    assert.ok(expected.length > 0);
    for (const locale of locales) {
        const translated = messages(locale);
        for (const key of expected) {
            assert.equal(typeof translated[key], "string", `${locale}: missing ${key}`);
            assert.notEqual(translated[key].trim(), "", `${locale}: empty ${key}`);
        }
    }
});
