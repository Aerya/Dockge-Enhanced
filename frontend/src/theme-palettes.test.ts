import test from "node:test";
import assert from "node:assert/strict";
import { normalizePalette } from "./theme-palettes";

test("keeps only palettes compatible with the selected light or dark mode", () => {
    assert.equal(normalizePalette("cat-latte", "light"), "cat-latte");
    assert.equal(normalizePalette("cat-mocha", "dark"), "cat-mocha");
    assert.equal(normalizePalette("cat-mocha", "light"), "default");
    assert.equal(normalizePalette("cat-latte", "dark"), "default");
    assert.equal(normalizePalette("unknown", "dark"), "default");
    assert.equal(normalizePalette(null, "light"), "default");
});
