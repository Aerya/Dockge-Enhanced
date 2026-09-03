import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";
import {
    boundedEditDistance,
    extractEnvEntries,
    extractEnvKeys,
    fuzzyScore,
    isSensitiveConfigLine,
    normalizeGlobalSearchQuery,
    parseGlobalSearchQuery,
    searchConfigLines,
    searchImageLines,
    searchPortLines,
} from "./global-search";

test("global search extracts env names and line numbers without exposing values", () => {
    const content = "# comment\nPUID=1000\nTOKEN=super-secret\nPUID=2000\nINVALID\n";
    assert.deepEqual(extractEnvKeys(content), [ "PUID", "TOKEN" ]);
    assert.deepEqual(extractEnvEntries(content), [
        { key: "PUID", value: "1000", line: 2 },
        { key: "TOKEN", value: "super-secret", line: 3 },
    ]);
});

test("global search rejects short or control-character queries", () => {
    assert.throws(() => normalizeGlobalSearchQuery("x"));
    assert.throws(() => normalizeGlobalSearchQuery("ok\nno"));
    assert.equal(normalizeGlobalSearchQuery("  postgres  "), "postgres");
});

test("global search parses assisted operators without turning them into free text", () => {
    assert.deepEqual(parseGlobalSearchQuery("stack:immich image:postgres is:update db"), {
        raw: "stack:immich image:postgres is:update db",
        terms: [ "db" ],
        stack: "immich",
        image: "postgres",
        diagnostics: [ "update" ],
    });
    assert.equal(parseGlobalSearchQuery("type:variables PUID").type, "env");
    assert.equal(parseGlobalSearchQuery("is:critical").diagnostics[0], "critical");
    assert.deepEqual(parseGlobalSearchQuery("type:unknown"), {
        raw: "type:unknown",
        terms: [ "type:unknown" ],
        diagnostics: [],
    });
});

test("fuzzy search tolerates small typing mistakes but prefers exact matches", () => {
    assert.equal(boundedEditDistance("jelyfin", "jellyfin", 2), 1);
    assert.ok(fuzzyScore("jellyfin", "jelyfin") > 0);
    assert.ok(fuzzyScore("postgres", "postgre") > 0);
    assert.ok(fuzzyScore("jellyfin", "jellyfin") > fuzzyScore("jellyfin", "jelyfin"));
    assert.equal(fuzzyScore("jellyfin", "prometheus"), 0);
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

test("image and port operators target the corresponding compose lines", () => {
    const compose = [
        "services:",
        "  app:",
        "    image: postgres:18-alpine",
        "    ports:",
        "      - \"5432:5432\"",
        "    environment:",
        "      PASSWORD: secret",
    ].join("\n");
    assert.equal(searchImageLines(compose, "postgre")[0]?.line, 3);
    assert.equal(searchPortLines(compose, "5432")[0]?.line, 5);
    assert.equal(searchImageLines(compose, "secret").length, 0);
});

test("V2 wiring keeps the legacy agent event and adds the V2 protocol", async () => {
    const handler = await fs.readFile(new URL("./agent-socket-handlers/docker-socket-handler.ts", import.meta.url), "utf8");
    assert.match(handler, /agentSocket\.on\("globalSearch"/);
    assert.match(handler, /agentSocket\.on\("globalSearchV2"/);
    assert.match(handler, /runGlobalSearchV2/);
});

test("historical search is bounded and opt-in", async () => {
    const globalSearchSource = await fs.readFile(new URL("./global-search.ts", import.meta.url), "utf8");
    const backupSource = await fs.readFile(new URL("./watchers/backup-manager.ts", import.meta.url), "utf8");
    assert.match(globalSearchSource, /requestInput\?\.searchSnapshots === true/);
    assert.match(globalSearchSource, /getRecentConfigurationSearchDocuments\(5, 80, parsed\.stack \?\? ""\)/);
    assert.match(backupSource, /Math\.min\(10, Math\.floor\(maxSnapshots\)\)/);
    assert.match(backupSource, /Math\.min\(160, Math\.floor\(maxFiles\)\)/);
    assert.match(backupSource, /const perSnapshotCap = normalizedStackHint \? fileCap/);
    assert.match(backupSource, /this\.resticDump\(dest, candidate\.snapshotId, candidate\.path, 8_000\)/);
});
