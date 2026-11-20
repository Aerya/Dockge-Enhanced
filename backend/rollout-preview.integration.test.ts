import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { runDeploymentPreview } from "./rollout-preview";
test("Docker: isolated health preview and failed preview leave no journal or containers", { skip: process.env.RUN_DOCKER_ROLLOUT_TEST !== "1",
    timeout: 180000 }, async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "preview-live-"));
    const service = { image: "busybox:stable",
        labels: { "dockge.rollout.migrations": "none" },
        command: [ "sleep", "300" ],
        healthcheck: { test: [ "CMD-SHELL", "test ! -e /prod && test $(ls /sys/class/net | wc -l) -eq 1" ],
            interval: "1s",
            timeout: "1s",
            retries: 1 } };
    try {
        assert.equal((await runDeploymentPreview({ services: { app: service } }, root)).healthy, true);
        assert.deepEqual(await readdir(path.join(root, "previews")), []);
        await assert.rejects(runDeploymentPreview({ services: { app: { ...service,
            healthcheck: { ...service.healthcheck,
                test: [ "CMD", "false" ] } } } }, root), /health/);
        assert.deepEqual(await readdir(path.join(root, "previews")), []);
    } finally {
        await rm(root, { recursive: true,
            force: true });
    }
});
