import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

test("conserve l’API de pluralisation utilisée par les vues", () => {
    const require = createRequire(import.meta.url);
    const { version } = require("vue-i18n/package.json") as { version: string };

    assert.equal(version.split(".")[0], "10");
});
