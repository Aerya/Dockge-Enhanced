import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";

const localeDirectory = new URL("./lang/", import.meta.url);
const componentSource = readFileSync(new URL("./components/watcher/WatcherImagesTab.vue", import.meta.url), "utf8");
const requiredKeys = [
    "title", "description", "enable", "server", "add", "save", "remove",
    "hostname", "test", "saved", "tested", "failed", "refused", "unreachable",
    "timeout", "noRecord", "serverError", "otherError", "ipv6Hint",
    "recordType", "status", "duration", "diagnostic", "resolved",
    "noAddress", "errorStatus", "hostNotFound",
];

test("DNS fallback UI has translations in all shipped languages", () => {
    const files = readdirSync(localeDirectory).filter(file => file.endsWith(".json"));
    assert.equal(files.length, 33);
    for (const file of files) {
        const source = readFileSync(new URL(`./lang/${file}`, import.meta.url), "utf8");
        const strings = JSON.parse(source) as Record<string, string>;
        for (const key of requiredKeys) {
            assert.ok(strings[`watcher.registryDns.${key}`]?.trim(), `${file}: missing ${key}`);
        }
    }
});

test("DNS fallback title stays concise in French and English", () => {
    const fr = JSON.parse(readFileSync(new URL("./lang/fr.json", import.meta.url), "utf8")) as Record<string, string>;
    const en = JSON.parse(readFileSync(new URL("./lang/en.json", import.meta.url), "utf8")) as Record<string, string>;
    assert.equal(fr["watcher.registryDns.title"], "DNS de secours");
    assert.equal(en["watcher.registryDns.title"], "Fallback DNS");
});

test("DNS lookup results use a table and treat ENODATA as neutral", () => {
    assert.match(componentSource, /<table class="table table-sm table-hover/);
    assert.match(componentSource, /case "ENODATA":\s+key = "noRecord";/);
    assert.match(componentSource, /case "ENOTFOUND":\s+key = "hostNotFound";/);
    assert.match(componentSource, /dnsRecordAbsent\(record\.errorCode\)/);
    assert.match(componentSource, /watcher\.registryDns\.noAddress/);
});
