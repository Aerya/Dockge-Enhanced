import test from "node:test";
import assert from "node:assert/strict";
import { resolveDataDir } from "./data-dir";

test("la variable DOCKGE_DATA_DIR explicite est toujours prioritaire", () => {
    assert.equal(resolveDataDir({
        dataDir: "/custom/data",
        exists: () => true,
        readDirectory: () => [ "settings.json" ],
    }), "/custom/data");
});

test("sans variable, le volume standard /app/data est retenu", () => {
    assert.equal(resolveDataDir({
        standardDataDir: "/persistent/app-data",
        legacyDataDir: "/legacy/data",
        exists: directory => directory === "/persistent/app-data",
        readDirectory: () => [],
    }), "/persistent/app-data");
});

test("une installation legacy non vide reste utilisable tant que le volume standard est vide", () => {
    assert.equal(resolveDataDir({
        standardDataDir: "/persistent/app-data",
        legacyDataDir: "/persistent/legacy-data",
        exists: () => true,
        readDirectory: directory => directory.includes("legacy") ? [ "watcher-settings.json" ] : [],
    }), "/persistent/legacy-data");
});

test("le volume standard non vide prévaut sur un ancien répertoire également non vide", () => {
    assert.equal(resolveDataDir({
        standardDataDir: "/persistent/app-data",
        legacyDataDir: "/persistent/legacy-data",
        exists: () => true,
        readDirectory: () => [ "settings.json" ],
    }), "/persistent/app-data");
});
