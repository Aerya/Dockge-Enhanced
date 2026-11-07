// Opt-in isolated deployment through Enhanced's Stack API; no image pulls.
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { promisify } from "node:util";
import { execFile } from "../backend/buffered-process";
import { Stack } from "../backend/stack";
import { DeploymentStore } from "../backend/deployment-progress";
import type { DockgeServer } from "../backend/dockge-server";
import type { DockgeSocket } from "../backend/util-server";

if (process.env.DOCKGE_DEPLOYMENT_TEST !== "1") {
    throw new Error("Explicit DOCKGE_DEPLOYMENT_TEST=1 required");
}
const exec = promisify(execFile);
await exec("docker", [ "image", "inspect", "busybox:stable" ]);
const root = await mkdtemp(join(tmpdir(), "enhanced-deploy-test-"));
const stacksDir = join(root, "stacks");
await mkdir(stacksDir);
const name = "enhanced-deploy-" + randomBytes(5).toString("hex");
const server = {
    stacksDir,
    config: { dataDir: join(root, "data") },
} as DockgeServer;
const compose = (image: string) =>
    `services:\n  app:\n    image: ${image}\n    pull_policy: never\n    command: [sleep, '3600']\n    stop_grace_period: 1s\n`;
const stack = new Stack(server, name, compose("busybox:stable"), "", true);
const socket = {
    id: name,
    endpoint: "",
    connected: true,
    emitAgent: () => {},
} as unknown as DockgeSocket;
const store = new DeploymentStore(server.config.dataDir);
try {
    await store.run(name, async (phase, output) => {
        await stack.save(true);
        await stack.deploy(socket, { phase,
            output });
    });
    const done = (await store.get(name))!;
    assert.equal(done.state, "completed");
    assert.deepEqual(
        done.steps.map((step) => step.phase),
        [ "save", "prerequisites", "compose", "metadata" ],
    );
    assert.equal(
        (
            await exec(
                "docker",
                stack.getComposeOptions("ps", "--status", "running", "--quiet"),
                { cwd: stack.path },
            )
        ).stdout.trim().length,
        64,
    );
    const bad = new Stack(
        server,
        name,
        compose(`nonexistent-deployment-test-${name}:missing`),
        "",
        true,
    );
    await assert.rejects(
        store.run(name, async (phase, output) => {
            await bad.save(false);
            await bad.deploy(socket, { phase,
                output });
        }),
    );
    const failed = (await store.get(name))!;
    assert.equal(failed.state, "failed");
    assert.equal(failed.phase, "compose");
    assert.ok(failed.output);
    await stack.save(false);
    await store.run(
        name,
        (phase, output) => stack.deploy(socket, { phase,
            output }),
        true,
        failed.id,
    );
    assert.equal(
        (await new DeploymentStore(server.config.dataDir).get(name))?.state,
        "completed",
    );
    console.log(
        "PASS real Stack deployment, Docker failure, explicit retry and persisted final status",
    );
} finally {
    await exec("docker", stack.getComposeOptions("down", "--remove-orphans"), {
        cwd: stack.path,
        timeout: 45000,
    });
    await rm(root, { recursive: true,
        force: true });
    console.log(
        "PASS isolated deployment containers, network and data removed",
    );
}
