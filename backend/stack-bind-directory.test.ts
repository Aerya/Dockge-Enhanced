import test from "node:test";
import assert from "node:assert/strict";
import { collectHostBindDirectoryCandidates, hostBindDirectoryError, hostBindDirectoryHelperArgs } from "./stack";

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
      - /etc/localtime:/etc/localtime:ro
      - /etc/hosts:/etc/hosts:ro
      - type: bind
        source: /etc/hostname
        target: /etc/hostname
      - ./data:/data
      - app-data:/var/lib/app
` ]);

    assert.deepEqual(candidates, []);
});

test("host helper binds only candidate sources, including Docker Desktop paths", () => {
    const candidates = collectHostBindDirectoryCandidates([ `
services:
  app:
    volumes:
      - /Users/example/stacks:/stacks
      - /srv/app/data:/data
      - /etc/localtime:/etc/localtime:ro
` ]);
    assert.deepEqual(hostBindDirectoryHelperArgs(candidates, "busybox:stable"), [
        "run", "--rm", "--network", "none",
        "--volume", "/Users/example/stacks:/dockge-host-bind/0:ro",
        "--volume", "/srv/app/data:/dockge-host-bind/1:ro",
        "busybox:stable", "true",
    ]);
    assert.ok(!hostBindDirectoryHelperArgs(candidates, "busybox:stable").includes("type=bind,src=/,dst=/host"));
});

test("host helper surfaces Docker's path-specific error", () => {
    const error = Object.assign(new Error("Process exited with code 1"), {
        stderr: "Error response from daemon: /Users/example/stacks is not shared",
    });
    assert.match(hostBindDirectoryError(error).message, /\/Users\/example\/stacks is not shared/);
});

test("host helper keeps the original error when Docker provides no stderr", () => {
    assert.match(hostBindDirectoryError(new Error("Docker daemon unavailable")).message, /Docker daemon unavailable/);
});
