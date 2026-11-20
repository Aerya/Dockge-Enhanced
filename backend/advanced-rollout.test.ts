import test from "node:test";
import assert from "node:assert/strict";
import { canaryState, decideCanary, runCanary } from "./rollout-canary";
import { previewModel } from "../common/deployment-preview";
import { relayConfig } from "../common/rollout-relay";
import { rolloutProblems } from "../common/service-rollout";
import { recoverPreviews } from "./rollout-preview";
import { mkdtemp, mkdir, writeFile, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
test("weighted TCP pools validate all weights, including DNS bootstrap backups", () => {
    const config = relayConfig([ "old", "next" ], 8080, [ 90, 10 ]);
    assert.match(config, /old:8080 weight=90 resolve/);
    assert.match(config, /next:8080 weight=10 backup/);
    assert.throws(() => relayConfig([ "old" ], 8080, [ 0 ]));
    assert.throws(() => relayConfig([ "old" ], 8080, [ 10, 90 ]));
});
test("automatic canary observes health for each stage and removes transient state", async () => {
    const stages: number[] = [];
    let samples = 0;
    await runCanary("/fixture", "app", "automatic", async percent => {
        stages.push(percent);
    }, async () => true, async () => {
        samples++;
    });
    assert.deepEqual(stages, [ 10, 25, 50 ]);
    assert.equal(samples, 45);
    assert.equal(canaryState("/fixture", "app"), undefined);
});
test("manual promotion requires health, current stage identity and an explicit decision", async () => {
    const identifiers: string[] = [];
    await runCanary("/fixture", "manual", "manual", async () => {
        const state = canaryState("/fixture", "manual")!;
        identifiers.push(state.id);
        assert.throws(() => decideCanary("/fixture", "manual", state.id, "promote"));
    }, async () => true, async () => {
        const state = canaryState("/fixture", "manual")!;
        if (state.ready) {
            decideCanary("/fixture", "manual", state.id, "promote");
        }
        assert.throws(() => decideCanary("/fixture", "manual", "stale", "promote"));
    });
    assert.equal(new Set(identifiers).size, 3);
});
test("unhealthy, aborted and timed-out canaries cannot promote", async () => {
    await assert.rejects(runCanary("/fixture", "bad", "automatic", async () => {}, async () => false, async () => {}), /health/);
    await assert.rejects(runCanary("/fixture", "abort", "manual", async () => {}, async () => true, async () => {
        decideCanary("/fixture", "abort", canaryState("/fixture", "abort")!.id, "abort");
    }), /cancelled/);
    await assert.rejects(runCanary("/fixture", "timeout", "manual", async () => {}, async () => true, async () => {}, 16), /timeout/);
});
const service = { image: "busybox:stable",
    labels: { "dockge.rollout.migrations": "none" },
    command: [ "sh", "-c", "echo $HOME" ] };
test("preview isolates namespaces and resources, and never interpolates host secrets", () => {
    const preview = previewModel({ services: { app: service } }, "preview-test");
    assert.equal(preview.services.app.network_mode, "none");
    assert.equal(preview.services.app.read_only, true);
    assert.deepEqual((preview.services.app as Record<string, unknown>).command, [ "sh", "-c", "echo $$HOME" ]);
    assert.deepEqual(preview.services.app.cap_drop, [ "ALL" ]);
});
test("preview refuses shared mounts, publication, privileges, migrations and arbitrary top-level resources", () => {
    for (const change of [{ volumes: [ "/prod:/data" ] }, { ports: [ "8080:80" ] }, { network_mode: "host" }, { privileged: true }, { image: "postgres:17" }, { command: "migrate database" }, { labels: {} }, { build: "." }, { env_file: "/secret" }]) {
        assert.throws(() => previewModel({ services: { app: { ...service,
            ...change } } }, "preview-test"));
    }
    assert.throws(() => previewModel({ services: { app: service },
        volumes: { prod: { external: true } } }, "preview-test"));
    const errors = rolloutProblems({ ...service,
        labels: { "dockge.rollout.canary": "automatic" } });
    assert.ok(errors.includes("canary-requires-managed-relay"));
    assert.ok(errors.includes("canary-migrations-not-safe"));
});
test("preview recovery only addresses journalled owned resources", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "preview-recovery-"));
    const project = "preview-" + "a".repeat(32);
    const calls: string[][] = [];
    try {
        await mkdir(path.join(root, "previews"));
        await writeFile(path.join(root, "previews", project), project);
        await writeFile(path.join(root, "previews", project + ".json"), "{}");
        await recoverPreviews(root, async args => {
            calls.push(args);
            return args[0] === "ps" ? "b".repeat(64) : "";
        });
        assert.ok(calls[0].includes("label=dockge.preview.project=" + project));
        assert.ok(calls[0].includes("label=com.docker.compose.project=" + project));
        assert.deepEqual(calls[1], [ "rm", "-f", "-v", "b".repeat(64) ]);
        assert.deepEqual(await readdir(path.join(root, "previews")), []);
    } finally {
        await rm(root, { recursive: true,
            force: true });
    }
});
