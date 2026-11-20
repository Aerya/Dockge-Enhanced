import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { addRolloutRelay } from "../frontend/src/rollout-relay";
import { prepareRollout, rolloutTransport } from "./service-rollout";
import { canaryState, decideCanary } from "./rollout-canary";
test("Docker: three manual weighted stages reach both generations before final promotion", { skip: process.env.RUN_DOCKER_ROLLOUT_TEST !== "1",
    timeout: 300000 }, async () => {
    const project = "canary-test-" + randomUUID().slice(0, 8);
    const directory = await mkdtemp(path.join(os.tmpdir(), project));
    const file = path.join(directory, "compose.json");
    const image = project + ":app";
    const transport = rolloutTransport([ "compose", "-p", project, "-f", file ], directory);
    let execution: Promise<unknown> | undefined;
    try {
        await writeFile(path.join(directory, "Dockerfile"), "FROM busybox:stable\nCOPY index.html /www/index.html\nCMD [\"httpd\", \"-f\", \"-p\", \"8080\", \"-h\", \"/www\"]\n");
        const build = async (version: string) => {
            await writeFile(path.join(directory, "index.html"), version);
            await transport.docker([ "build", "-t", image, directory ], 60000);
        };
        await build("old");
        const model = addRolloutRelay({ services: { app: { image,
            ports: [ "127.0.0.1::8080" ],
            healthcheck: { test: [ "CMD", "wget", "-q", "-O", "/dev/null", "http://127.0.0.1:8080" ],
                interval: "1s",
                timeout: "1s",
                retries: 2 } } } }, "app", 8080);
        Object.assign(model.services.app.labels as Record<string, string>, { "dockge.rollout.canary": "manual",
            "dockge.rollout.migrations": "none" });
        await writeFile(file, JSON.stringify(model));
        await transport.compose([ "up", "-d", "--wait", "--wait-timeout", "60" ], 120000);
        const address = (await transport.compose([ "port", "app-rollout-relay", "8080" ], 15000)).trim();
        const get = async () => {
            const response = await fetch("http://" + address, { headers: { Connection: "close" },
                signal: AbortSignal.timeout(5000) });
            assert.equal(response.status, 200);
            return response.text();
        };
        assert.equal(await get(), "old");
        const plan = await prepareRollout(transport.compose, transport.docker, [ "app" ], { stateDir: path.join(directory, "state"),
            projectPath: directory });
        assert.ok(plan);
        await build("new");
        let done = false;
        let failure: unknown;
        execution = plan.execute();
        void execution.then(() => {
            done = true;
        }, error => {
            failure = error;
            done = true;
        });
        const stages: number[] = [];
        const deadline = Date.now() + 210000;
        while (!done && Date.now() < deadline) {
            const state = canaryState(directory, "app");
            if (state?.ready && !stages.includes(state.percent)) {
                const values = new Set<string>();
                for (let i = 0; i < 100; i++) {
                    values.add(await get());
                }
                assert.deepEqual([ ...values ].sort(), [ "new", "old" ]);
                stages.push(state.percent);
                decideCanary(directory, "app", state.id, "promote");
            }
            await new Promise(resolve => setTimeout(resolve, 200));
        }
        if (failure) {
            throw failure;
        }
        assert.equal(done, true);
        await execution;
        assert.deepEqual(stages, [ 10, 25, 50 ]);
        assert.equal(await get(), "new");
        assert.equal((await transport.compose([ "ps", "-aq", "app" ], 15000)).trim().split("\n").length, 1);
    } finally {
        const state = canaryState(directory, "app");
        if (state) {
            decideCanary(directory, "app", state.id, "abort");
        }
        if (execution) {
            await execution.catch(() => {});
        }
        await transport.compose([ "down", "--volumes", "--remove-orphans" ], 30000).catch(() => {});
        await transport.docker([ "image", "rm", image ], 30000).catch(() => {});
        await rm(directory, { recursive: true,
            force: true });
    }
});
