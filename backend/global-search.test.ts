import assert from "node:assert/strict";
import test from "node:test";
import { extractEnvKeys, isSensitiveConfigLine, normalizeGlobalSearchQuery, searchConfigLines } from "./global-search";

test("global search extracts env names without returning values", () => {
    assert.deepEqual(extractEnvKeys("# comment\nPUID=1000\nTOKEN=super-secret\nPUID=2000\nINVALID\n"), [ "PUID", "TOKEN" ]);
});

test("global search rejects short or control-character queries", () => {
    assert.throws(() => normalizeGlobalSearchQuery("x"));
    assert.throws(() => normalizeGlobalSearchQuery("ok\nno"));
    assert.equal(normalizeGlobalSearchQuery("  postgres  "), "postgres");
});

test("global search never returns sensitive compose assignment lines", () => {
    assert.equal(isSensitiveConfigLine("PASSWORD: hunter2"), true);
    assert.equal(isSensitiveConfigLine("api_key=abcd"), true);
    assert.equal(isSensitiveConfigLine("image: postgres:18"), false);
    assert.deepEqual(searchConfigLines("image: postgres:18\nPASSWORD: postgres-secret\nrestart: unless-stopped", "postgres"), [
        { line: 1, excerpt: "image: postgres:18" },
    ]);
});

test("global search hides inline environment values", () => {
    const compose = "    - PUID=1000\n    TZ: Europe/Paris\n";
    assert.deepEqual(searchConfigLines(compose, "PUID"), [ { line: 1, excerpt: "- PUID=<hidden>" } ]);
    assert.deepEqual(searchConfigLines(compose, "1000"), []);
    assert.deepEqual(searchConfigLines(compose, "Europe/Paris"), []);
});
