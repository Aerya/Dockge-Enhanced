import assert from "node:assert/strict";
import test from "node:test";
import { parse, stringify } from "yaml";
import { stackURLLinks, stackURLValue } from "./stack-urls";
import { applyComposeTemplates } from "./compose-templates";
import { filterStacksByAgentTag, normalizeAgentTags } from "./agent-tags";

test("mixed legacy and labelled Compose URLs survive YAML round trips", () => {
    const compose = parse("services: {}\nx-dockge:\n  urls:\n    - https://example.org\n    - url: https://example.org/admin?view=all#users\n      label: Administration\n");
    const roundTrip = parse(stringify(compose));
    assert.deepEqual(stackURLLinks(roundTrip["x-dockge"].urls), [
        { url: "https://example.org/",
            display: "example.org" },
        { url: "https://example.org/admin?view=all#users",
            display: "Administration" },
    ]);
    assert.equal(typeof roundTrip["x-dockge"].urls[0], "string");
});

test("unsafe protocols, malformed objects and unexpanded URLs never become links", () => {
    assert.deepEqual(stackURLLinks([ "javascript:alert(1)", "data:text/html,hello", "file:///etc/passwd", "${URL}", null, { url: 123 }, { url: "https://example.org",
        label: {} }]), []);
    assert.equal(stackURLValue({ url: false }), null);
    assert.deepEqual(stackURLLinks([{ url: "https://example.org",
        label: "   " }]), [{ url: "https://example.org/",
        display: "example.org" }]);
});

test("late settings preserve user edits independently for Compose and .env", () => {
    const initial = { composeYAML: "services: {}",
        composeENV: "# default" };
    const settings = { composeTemplate: "services: {web: {image: nginx}}",
        composeEnvTemplate: "TZ=Europe/Paris\nPUID=1000" };
    const editedCompose = { ...initial,
        composeYAML: "services: {custom: {image: redis}}" };
    applyComposeTemplates(editedCompose, initial, settings, true, true);
    assert.equal(editedCompose.composeYAML, "services: {custom: {image: redis}}");
    assert.equal(editedCompose.composeENV, settings.composeEnvTemplate);
    const editedEnv = { ...initial,
        composeENV: "MY_SECRET=local" };
    applyComposeTemplates(editedEnv, initial, settings, true, true);
    assert.equal(editedEnv.composeYAML, settings.composeTemplate);
    assert.equal(editedEnv.composeENV, "MY_SECRET=local");
});

test("imports take precedence and explicitly empty .env defaults work", () => {
    const imported = { composeYAML: "imported",
        composeENV: "imported-env" };
    applyComposeTemplates(imported, { ...imported }, { composeTemplate: "other",
        composeEnvTemplate: "other" }, false, false);
    assert.equal(imported.composeENV, "imported-env");
    assert.equal(imported.composeYAML, "imported");
    applyComposeTemplates(imported, { ...imported }, { composeEnvTemplate: "" }, false, true);
    assert.equal(imported.composeENV, "");
});

test("agent tags normalize duplicates and filter local and remote stacks", () => {
    assert.deepEqual(normalizeAgentTags([ " NAS ", "nas", "Production", "" ]), [ "nas", "production" ]);
    const stacks = [{ endpoint: "",
        name: "local" }, { endpoint: "nas",
        name: "media" }, { endpoint: "vm",
        name: "test" }];
    assert.deepEqual(filterStacksByAgentTag(stacks, { "": { tags: [ "production" ] },
        nas: { tags: [ "production" ] },
        vm: { tags: [ "dev" ] } }, "production"), stacks.slice(0, 2));
    assert.throws(() => normalizeAgentTags([ "x".repeat(41) ]));
    assert.throws(() => normalizeAgentTags([ "bad\nvalue" ]));
    assert.throws(() => normalizeAgentTags(Array(21).fill("tag")));
    assert.throws(() => normalizeAgentTags("tag"));
});
