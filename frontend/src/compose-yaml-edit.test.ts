import assert from "node:assert/strict";
import test from "node:test";
import { parseDocument } from "yaml";
import { editComposeYAML } from "./compose-yaml-edit";

const fixture = `# My compose
x-common: &common
  restart: unless-stopped

services:
  web:
    <<: *common
    image: 'nginx:old' # keep me
    labels: {version: "001", date: "2026-11-06"}
    command: |-
      echo hello
      echo world
    ports:
      # public port
      - "8080:80"
    tmpfs:
      - /run
  db:
    image: postgres:latest
    volumes:
      - type: tmpfs
        target: /tmp
        tmpfs:
          mode: 01777
# footer
`;

test("opening and saving is byte-identical, including empty UI networks", () => {
    const config = parseDocument(fixture).toJS();
    config.networks = {};
    assert.equal(editComposeYAML(fixture, config), fixture);
    assert.equal(editComposeYAML("# empty\n", { services: {},
        networks: {} }), "# empty\n");
});

test("one scalar edit changes only its original quoted token", () => {
    const config = parseDocument(fixture).toJS();
    config.services.web.image = "nginx:new";
    assert.equal(editComposeYAML(fixture, config), fixture.replace("'nginx:old'", "'nginx:new'"));
});

test("flow map and sequence leaf edits preserve comments, anchors and other syntax", () => {
    const config = parseDocument(fixture).toJS();
    config.services.web.labels.version = "002";
    config.services.web.ports[0] = "9090:80";
    assert.equal(editComposeYAML(fixture, config), fixture.replace("\"001\"", "\"002\"").replace("\"8080:80\"", "\"9090:80\""));
});

test("nested additions and deletions preserve unrelated source", () => {
    const source = "services:\n  web:\n    image: nginx\n    restart: always\n  db:\n    image: postgres # untouched\n";
    const config = parseDocument(source).toJS();
    delete config.services.web.restart;
    config.services.web.ports = [ "8080:80" ];
    const result = editComposeYAML(source, config);
    assert.deepEqual(parseDocument(result).toJS(), config);
    assert.ok(result.endsWith("  db:\n    image: postgres # untouched\n"));
    assert.ok(result.startsWith("services:\n  web:\n    image: nginx\n"));
});

test("empty mappings and new services remain valid", () => {
    for (const source of [ "services: {}\n", "services:\n  web:\n    image: nginx\n" ]) {
        const config = parseDocument(source).toJS();
        config.services = {};
        assert.deepEqual(parseDocument(editComposeYAML(source, config)).toJS(), config);
        config.services = { app: { image: "alpine",
            ports: [ "8080:80" ] } };
        assert.deepEqual(parseDocument(editComposeYAML(source, config)).toJS(), config);
    }
});

test("CRLF is preserved for scalar edits", () => {
    const source = fixture.replaceAll("\n", "\r\n");
    const config = parseDocument(source).toJS();
    config.services.db.image = "postgres:17";
    assert.equal(editComposeYAML(source, config), source.replace("postgres:latest", "postgres:17"));
});

test("Compose tags outside the edited leaf are retained", () => {
    const source = "services:\n  web:\n    image: nginx\n    ports: !override [8080:80]\n    command: !reset null\n";
    const config = parseDocument(source).toJS();
    config.services.web.image = "nginx:stable";
    assert.equal(editComposeYAML(source, config), source.replace("image: nginx", "image: nginx:stable"));
});

test("invalid source is rejected, not normalized into another document", () => {
    assert.throws(() => editComposeYAML("services: [\n", { services: {} }));
});

test("creating the first service preserves a comment-only document", () => {
    const source = "# keep this header\r\n";
    const config = { services: { web: { image: "nginx" } } };
    const result = editComposeYAML(source, config);
    assert.ok(result.startsWith(source));
    assert.deepEqual(parseDocument(result).toJS(), config);
    assert.ok(!result.replaceAll("\r\n", "").includes("\n"));
});

test("editing a block scalar preserves its string value and unrelated source", () => {
    const config = parseDocument(fixture).toJS();
    config.services.web.command = "echo new\necho again\n";
    const result = editComposeYAML(fixture, config);
    assert.deepEqual(parseDocument(result).toJS(), config);
    assert.ok(result.endsWith(fixture.slice(fixture.indexOf("    ports:"))));
});

test("adding and removing list entries retain existing comments and spellings", () => {
    const source = "services:\n  web:\n    ports:\n      # first\n      - \"8080:80\" # keep\n      - \"9090:90\"\n    image: nginx\n";
    for (const ports of [[ "8080:80", "9090:90", "7070:70" ], [ "8080:80" ], [ "5050:50", "8080:80", "9090:90" ]]) {
        const config = parseDocument(source).toJS();
        config.services.web.ports = ports;
        const result = editComposeYAML(source, config);
        assert.deepEqual(parseDocument(result).toJS(), config);
        assert.ok(result.includes("      # first\n"));
        assert.ok(result.includes("      - \"8080:80\" # keep\n"));
        assert.ok(result.endsWith("    image: nginx\n"));
    }
});
