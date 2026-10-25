import test, { after } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { prepareRollout, type ComposeRun, type DockerRun } from "./service-rollout";
import { rolloutEnabled, rolloutProblems, LABEL_ROLLOUT, ROLLOUT_HEALTH_PREFIX } from "../common/service-rollout";
import { setComposeLabel } from "../common/compose-labels";

const target = "sha256:" + "b".repeat(64);
const stateDir = mkdtempSync(path.join(os.tmpdir(), "rollout-test-state-"));
after(() => rmSync(stateDir, { recursive: true,
    force: true }));
const labels = {
    [LABEL_ROLLOUT]: "true",
    "traefik.enable": "true",
    "traefik.http.routers.app.rule": "Host(`example.test`)",
    "traefik.http.services.app.loadbalancer.server.port": "80",
};
function fixture() {
    const model = { name: "fixture",
        services: { app: { image: "fixture/app:latest",
            labels: { ...labels },
            healthcheck: { test: [ "CMD-SHELL", ROLLOUT_HEALTH_PREFIX + "true" ] } } } };
    const container = (Id: string, Image: string, Health = "healthy") => ({
        Id,
        Image,
        State: { Running: true,
            Health: { Status: Health } },
        Config: { Image: "fixture/app:latest",
            Healthcheck: { Test: [ "CMD-SHELL", ROLLOUT_HEALTH_PREFIX + "true" ] },
            Labels: { ...labels,
                "com.docker.compose.service": "app" } as Record<string, string> },
        Mounts: [] as { RW: boolean }[],
        NetworkSettings: { Networks: { fixture: {} } },
    });
    const old = container("old", "sha256:" + "a".repeat(64));
    const proxy = container("proxy", "proxy");
    proxy.Config.Image = "traefik:v3";
    const state = { created: [] as ReturnType<typeof container>[],
        health: "healthy",
        failUp: false,
        failStop: false,
        timeout: false,
        proxy: true };
    const calls: string[][] = [];
    const compose: ComposeRun = async (args, _timeout, override) => {
        calls.push([ "compose", ...args ]);
        if (args[0] === "config") {
            return JSON.stringify(model);
        }
        if (args[0] === "ps") {
            return [ old.Id, ...state.created.map(item => item.Id) ].join("\n");
        }
        if (args[0] === "up") {
            assert.ok(override);
            assert.ok(args.includes("--no-recreate"));
            assert.ok(args.includes("--no-deps"));
            const extra = JSON.parse(await readFile(override!, "utf8"));
            const next = container("new", target, state.timeout ? "starting" : state.health);
            next.Config.Labels["dockge.rollout.operation"] = extra.services.app.labels["dockge.rollout.operation"];
            state.created.push(next);
            if (state.failUp) {
                throw new Error("up failed after creating replacement");
            }
            return "";
        }
        throw new Error("Unexpected Compose command: " + args);
    };
    const docker: DockerRun = async args => {
        calls.push(args);
        if (args[0] === "ps") {
            return args.includes("--filter") ? state.created.map(item => item.Id).join("\n") : state.proxy ? "proxy\nold" : "old";
        }
        if (args[0] === "inspect") {
            return JSON.stringify(args.slice(1).map(id => [ old, proxy, ...state.created ].find(item => item.Id === id)));
        }
        if (args[0] === "image") {
            return target;
        }
        if (args[0] === "exec") {
            old.State.Health.Status = args.at(-1)!.startsWith("touch") ? "unhealthy" : "healthy";
            return "";
        }
        if (args[0] === "stop") {
            if (state.failStop) {
                throw new Error("stop failed");
            }
            return "";
        }
        if (args[0] === "rm") {
            return "";
        }
        throw new Error("Unexpected Docker command: " + args);
    };
    const prepare = () => prepareRollout(compose, docker, [ "app" ], { wait: async () => {},
        attempts: 2,
        stateDir });
    return { model,
        old,
        state,
        calls,
        prepare };
}

test("default disabled and label edits preserve map/list labels", () => {
    assert.equal(rolloutEnabled({}), false);
    for (const labels of [{ custom: "keep" }, [ "custom=keep" ]]) {
        const service = { labels };
        setComposeLabel(service, LABEL_ROLLOUT, "true");
        assert.equal(rolloutEnabled(service), true);
        setComposeLabel(service, LABEL_ROLLOUT, null);
        assert.equal(rolloutEnabled(service), false);
        assert.deepEqual(service.labels, Array.isArray(labels) ? [ "custom=keep" ] : { custom: "keep" });
    }
});
test("resolved prerequisite rejection covers ports, mounts, namespaces, health, proxy and self-update", () => {
    const service = fixture().model.services.app;
    assert.deepEqual(rolloutProblems(service), []);
    for (const extra of [
        { container_name: "fixed" }, { ports: [{ published: "8080" }] }, { network_mode: "host" },
        { healthcheck: { disable: true } }, { healthcheck: { test: [ "NONE" ] } },
        { volumes: [{ source: "data",
            target: "/data" }] }, { labels: {} },
        { image: "ghcr.io/aerya/dockge-enhanced:latest" }, { build: "." }, { pid: "service:db" },
        { networks: { test: { ipv4_address: "172.20.0.5" } } },
    ]) {
        assert.ok(rolloutProblems({ ...service,
            ...extra }).length, JSON.stringify(extra));
    }
});
test("no opt-in means no container mutations or inspection", async () => {
    const f = fixture();
    delete (f.model.services.app.labels as Record<string, string>)[LABEL_ROLLOUT];
    assert.equal(await f.prepare(), null);
    assert.equal(f.calls.length, 1);
});
test("healthy replacement is created before old replicas are stopped; only old IDs removed", async () => {
    const f = fixture();
    await (await f.prepare())!.execute();
    const up = f.calls.findIndex(args => args[0] === "compose" && args[1] === "up");
    const stop = f.calls.findIndex(args => args[0] === "stop");
    assert.ok(up >= 0 && stop > up);
    assert.deepEqual(f.calls.at(-1), [ "rm", "old" ]);
    assert.equal(f.calls.some(args => args[0] === "rm" && args.includes("new")), false);
});
for (const failure of [ "health", "timeout", "failUp" ] as const) {
    test(failure + ": old container never stopped; only marked replacements cleaned", async () => {
        const f = fixture();
        if (failure === "health") {
            f.state.health = "unhealthy";
        } else {
            f.state[failure] = true;
        }
        await assert.rejects((await f.prepare())!.execute(), /Rollout failed/);
        assert.equal(f.calls.some(args => args[0] === "stop"), false);
        assert.deepEqual(f.calls.at(-1), [ "rm", "-f", "new" ]);
    });
}
test("partial retirement preserves healthy replacements for recovery", async () => {
    const f = fixture();
    f.state.failStop = true;
    await assert.rejects((await f.prepare())!.execute(), /retirement incomplete/);
    assert.equal(f.calls.some(args => args[0] === "rm"), false);
});
test("changed/ignored policy during readiness cancels without touching old replicas", async () => {
    const f = fixture();
    let checks = 0;
    await assert.rejects((await f.prepare())!.execute(() => ++checks < 2), /Rollout failed/);
    assert.equal(f.calls.some(args => args[0] === "stop"), false);
});
test("revoked permission during readiness preserves old replicas", async () => {
    const f = fixture();
    let checks = 0;
    await assert.rejects((await f.prepare())!.execute(async () => {
        if (++checks > 1) {
            throw new Error("access.denied");
        }
        return true;
    }));
    assert.equal(f.calls.some(args => args[0] === "stop"), false);
});
test("no live proxy, unhealthy old container, or leftover replicas fail before up", async () => {
    for (const kind of [ "proxy", "health", "leftover" ]) {
        const f = fixture();
        if (kind === "proxy") {
            f.state.proxy = false;
        }
        if (kind === "health") {
            f.old.State.Health.Status = "starting";
        }
        if (kind === "leftover") {
            f.state.created.push({ ...f.old,
                Id: "leftover" });
        }
        await assert.rejects(f.prepare());
        assert.equal(f.calls.some(args => args.includes("up")), false);
    }
});
test("Compose drift during pull is rejected before scale", async () => {
    const f = fixture();
    const plan = await f.prepare();
    f.model.services.app.image = "changed:latest";
    await assert.rejects(plan!.execute(), /Compose changed/);
    assert.equal(f.calls.some(args => args.includes("up")), false);
});
