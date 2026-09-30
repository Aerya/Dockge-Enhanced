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

    assert.match(result, /^services:\n {2}app:\n {4}image: example\/app/m);
    assert.match(result, / {4}environment:\n {6}FOO: bar/);
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

test("repairs common Docker Compose indentation mistakes before formatting", async () => {
    const { repairAndFormatComposeYAML } = await import("./compose-yaml-format");
    const source = `services:
  freebox-dashboard:
    image: ghcr.io/hghugo/freeboxos-ultra-dashboard:latest
       container_name: freebox-dashboard
   restart: always
    ports:
      - \${DASHBOARD_PORT:-7505}:6787
    environment:
      - NODE_ENV=production
      -  PORT=6787
      - FREEBOX_HOST=mafreebox.freebox.fr
         - FREEBOX_TOKEN_FILE=/app/data/freebox_token.json
    volumes:
      - /volume1/docker/freebox_data:/app/data
    healthcheck:
      test:
       - CMD
       - wget
       - --no-verbose
       - --tries=1
        - --spider
        - http://127.0.0.1:6787/api/health
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s
networks: {}
`;

    const result = repairAndFormatComposeYAML(source);

    assert.equal(result.repaired, true);
    assert.match(result.yaml, / {2}freebox-dashboard:\n {4}image:/);
    assert.match(result.yaml, / {4}container_name: freebox-dashboard/);
    assert.match(result.yaml, / {4}restart: always/);
    assert.match(result.yaml, / {4}environment:\n {6}- NODE_ENV=production/);
    assert.match(result.yaml, / {6}- FREEBOX_TOKEN_FILE=\/app\/data\/freebox_token\.json/);
    assert.match(result.yaml, / {6}test:\n {8}- CMD\n {8}- wget/);
    assert.match(result.yaml, / {8}- --spider/);
});
