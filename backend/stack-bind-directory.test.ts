import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { collectHostBindDirectoryCandidates, HOST_BIND_DIRECTORY_SCRIPT, hostBindDirectoryError } from "./stack";

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

test("host helper reports the failing bind path and the actual mkdir error", () => {
    const directory = mkdtempSync(path.join(tmpdir(), "dockge-bind-error-"));
    try {
        const parent = path.join(directory, "file");
        writeFileSync(parent, "not a directory");
        const failedPath = `${parent}/child`;
        const result = spawnSync("sh", [ "-c", HOST_BIND_DIRECTORY_SCRIPT, "sh", failedPath ], { encoding: "utf-8" });
        assert.equal(result.status, 1);
        assert.match(result.stderr, /mkdir:.*file/);
        assert.match(result.stderr, /Failed to create host bind directory: .*file\/child/);
        const error = Object.assign(new Error("Process exited with code 1"), {
            stderr: result.stderr,
        });
        const message = hostBindDirectoryError(error).message;
        assert.match(message, /Failed to create host bind directory: .*file\/child/);
        assert.match(message, /mkdir:.*file/);
        assert.doesNotMatch(message, /Process exited with code 1/);
    } finally {
        rmSync(directory, {
            recursive: true,
            force: true,
        });
    }
});

test("host helper keeps the original error when Docker provides no stderr", () => {
    assert.match(hostBindDirectoryError(new Error("Docker daemon unavailable")).message, /Docker daemon unavailable/);
});
