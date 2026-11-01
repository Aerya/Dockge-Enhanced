import assert from "node:assert/strict";
import { test } from "node:test";
import { preserveQuotedScalarStyles, preserveTmpfsModeLiterals } from "./compose-yaml-preserve";
import { parse, stringify } from "yaml";

test("preserves octal config and secret permissions across reorder, deletion and formatting", () => {
    const original = `services:
  app:
    configs:
      - {source: first, target: /one, mode: 0777}
      - {source: second, target: /two, mode: 0440}
    secrets:
      - {source: password, mode: 0400}
`;
    const model = parse(original);
    model.services.app.configs.reverse();
    const generated = stringify(model);
    const result = preserveTmpfsModeLiterals(original, generated);
    assert.match(result, /mode: 0440/);
    assert.match(result, /mode: 0777/);
    assert.match(result, /mode: 0400/);
    assert.deepEqual(parse(result), model);
    model.services.app.configs.pop();
    model.services.app.secrets[0].mode = 600;
    const edited = preserveTmpfsModeLiterals(original, stringify(model));
    assert.match(edited, /mode: 0440/);
    assert.match(edited, /mode: 600/);
    assert.doesNotMatch(edited, /0777|0400/);
});

test("does not copy permissions between services or different mounts", () => {
    const original = "services: {app: {configs: [{source: a, mode: 0777}]}}";
    const generated = "services: {other: {configs: [{source: a, mode: 777}]}, app: {configs: [{source: b, mode: 777}]}}";
    assert.equal(preserveTmpfsModeLiterals(original, generated), generated);
});

test("preserves leading-zero tmpfs mode after visual YAML regeneration", () => {
    const original = `services:
  app:
    image: example/app
    volumes:
      - type: tmpfs
        target: /app/cache
        tmpfs:
          mode: 01777
`;

    const regenerated = `services:
  app:
    image: example/app
    volumes:
      - type: tmpfs
        target: /app/cache
        tmpfs:
          mode: 1777
`;

    const result = preserveTmpfsModeLiterals(original, regenerated);
    assert.match(result, /mode: 01777/);
    assert.doesNotMatch(result, /mode: 1777/);
});

test("preserves several tmpfs mode literals in order", () => {
    const original = `services:
  app:
    volumes:
      - type: tmpfs
        target: /one
        tmpfs:
          mode: 01777
      - type: tmpfs
        target: /two
        tmpfs:
          mode: 0700
`;

    const regenerated = `services:
  app:
    volumes:
      - type: tmpfs
        target: /one
        tmpfs:
          mode: 1777
      - type: tmpfs
        target: /two
        tmpfs:
          mode: 700
`;

    const result = preserveTmpfsModeLiterals(original, regenerated);
    assert.match(result, /mode: 01777/);
    assert.match(result, /mode: 0700/);
});

test("leaves generated YAML unchanged when tmpfs structure no longer matches", () => {
    const original = `services:
  app:
    volumes:
      - type: tmpfs
        target: /one
        tmpfs:
          mode: 01777
`;

    const regenerated = `services:
  app:
    image: example/app
`;

    assert.equal(preserveTmpfsModeLiterals(original, regenerated), regenerated);
});


test("preserves quoted bind mount with spaces and keeps it on one line", () => {
    const original = `services:
  codex-web:
    volumes:
      - /home/aerya/docker/codex-chatgpt-web/data/core:/home/aerya/.codex-chatgpt-web
      - "/home/aerya/docker/codex-chatgpt-web/data/config:/home/aerya/.config/Codex Web GPT"
      - /home/aerya/docker/codex-chatgpt-web/data/codex:/home/aerya/.codex
`;

    const regenerated = `services:
  codex-web:
    volumes:
      - /home/aerya/docker/codex-chatgpt-web/data/core:/home/aerya/.codex-chatgpt-web
      - /home/aerya/docker/codex-chatgpt-web/data/config:/home/aerya/.config/Codex Web GPT
      - /home/aerya/docker/codex-chatgpt-web/data/codex:/home/aerya/.codex
`;

    const result = preserveQuotedScalarStyles(original, regenerated);
    assert.match(result, /- "\/home\/aerya\/docker\/codex-chatgpt-web\/data\/config:\/home\/aerya\/\.config\/Codex Web GPT"/);
    assert.doesNotMatch(result, /Codex\n\s+Web GPT/);
});

test("does not restore quotes when the scalar value was actually edited", () => {
    const original = "services:\n  app:\n    command: \"echo old value\"\n";
    const regenerated = "services:\n  app:\n    command: echo new value\n";

    const result = preserveQuotedScalarStyles(original, regenerated);
    assert.match(result, /command: echo new value/);
    assert.doesNotMatch(result, /"echo new value"/);
});
