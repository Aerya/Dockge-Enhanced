import assert from "node:assert/strict";
import test from "node:test";
import { renderStackReadme } from "./stack-readme";

test("stack README renders headings, links and inline code", () => {
    assert.equal(renderStackReadme("# Documentation"), "<h1>Documentation</h1>\n");
    assert.equal(renderStackReadme("[OpenAI](https://openai.com)"),
        "<p><a href=\"https://openai.com\">OpenAI</a></p>\n");
    assert.equal(renderStackReadme("`docker compose up -d`"),
        "<p><code>docker compose up -d</code></p>\n");
});

test("stack README linkifies protocol, fuzzy and IPv6 URLs", () => {
    assert.equal(renderStackReadme("https://example.com"),
        "<p><a href=\"https://example.com\">https://example.com</a></p>\n");
    assert.equal(renderStackReadme("www.example.com"),
        "<p><a href=\"http://www.example.com\">www.example.com</a></p>\n");
    assert.equal(renderStackReadme("example.com"),
        "<p><a href=\"http://example.com\">example.com</a></p>\n");
    assert.equal(renderStackReadme("http://[2001:db8::1]:8080/test"),
        "<p><a href=\"http://[2001:db8::1]:8080/test\">http://[2001:db8::1]:8080/test</a></p>\n");
});

test("stack README keeps CJK punctuation outside an automatic link", () => {
    assert.equal(renderStackReadme("参照：https://example.com/path，続行"),
        "<p>参照：<a href=\"https://example.com/path\">https://example.com/path</a>，続行</p>\n");
});

test("stack README keeps raw HTML and unsafe links inactive", () => {
    const output = renderStackReadme("<script>alert(1)</script>\n<img src=x onerror=alert(1)>\n[unsafe](javascript:alert(1))\n");
    assert.equal(output.includes("<script>"), false);
    assert.equal(output.includes("<img"), false);
    assert.equal(output.includes("onerror="), true);
    assert.equal(output.includes("href=\"javascript:"), false);
});
