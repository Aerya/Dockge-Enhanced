import test from "node:test";
import assert from "node:assert/strict";
import { collectHostBindDirectoryCandidates } from "./stack";

test("absolute directory bind mounts are prepared on the Docker host", () => {
    const candidates = collectHostBindDirectoryCandidates([ `
services:
  app:
    volumes:
      - /volume1/docker/powerwatch:/data
      - type: bind
        source: /srv/media/cache
        target: /cache
` ]);

    assert.deepEqual(candidates, [
        {
            source: "/volume1/docker/powerwatch",
            target: "/data",
        },
        {
            source: "/srv/media/cache",
            target: "/cache",
        },
    ]);
});

test("file-like, named and relative mounts are never auto-created as directories", () => {
    const candidates = collectHostBindDirectoryCandidates([ `
services:
  app:
    volumes:
      - /volume1/docker/app/config.yml:/app/config.yml
      - /volume1/docker/app/.env:/app/.env
      - ./data:/data
      - app-data:/var/lib/app
` ]);

    assert.deepEqual(candidates, []);
});
