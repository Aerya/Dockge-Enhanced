import assert from "node:assert/strict";
import { test } from "node:test";
import { preserveQuotedScalarStyles, preserveTmpfsModeLiterals } from "./compose-yaml-preserve";

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
