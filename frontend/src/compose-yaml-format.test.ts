import assert from "node:assert/strict";
import { test } from "node:test";
import { formatComposeYAML } from "./compose-yaml-format";

test("formats Compose YAML with two-space indentation", () => {
    const source = `services:
 app:
   image: example/app
   environment:
    FOO: bar
`;

    const result = formatComposeYAML(source);

    assert.match(result, /^services:\n  app:\n    image: example\/app/m);
    assert.match(result, /    environment:\n      FOO: bar/);
});

test("preserves comments while formatting", () => {
    const source = `# stack comment
services:
 app:
   image: example/app # image comment
`;

    const result = formatComposeYAML(source);

    assert.match(result, /# stack comment/);
    assert.match(result, /# image comment/);
});

test("preserves leading-zero tmpfs mode literals", () => {
    const source = `services:
 app:
   volumes:
    - type: tmpfs
      target: /cache
      tmpfs:
       mode: 01777
`;

    const result = formatComposeYAML(source);
    assert.match(result, /mode: 01777/);
});

test("throws on invalid YAML instead of rewriting it", () => {
    const source = `services:
  app:
   image: example/app
    ports:
      - 8080:80
`;

    assert.throws(() => formatComposeYAML(source));
});
