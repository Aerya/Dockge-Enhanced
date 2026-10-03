import assert from "node:assert/strict";
import test from "node:test";
import { renderStackReadme } from "./stack-readme";

test("stack README renders Markdown without active HTML or JavaScript links", () => {
    const output = renderStackReadme("# Documentation\n<script>alert(1)</script>\n[unsafe](javascript:alert(1))\n");
    assert.match(output, /<h1>Documentation<\/h1>/);
    assert.equal(output.includes("<script>"), false);
    assert.equal(output.includes("href=\"javascript:"), false);
});
