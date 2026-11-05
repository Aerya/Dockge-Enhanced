import assert from "node:assert/strict";
import test from "node:test";
import { DockerSocketRecovery, dockerRecoveryConfig, classifyDockerProbeError, type DockerProbeResult } from "./docker-socket-recovery";

function fixture(retries = 2) {
    const state = { result: "ready" as DockerProbeResult,
        busy: false,
        block: false,
        exits: 0,
        probes: 0 };
    const monitor = new DockerSocketRecovery({ retries,
        intervalMs: 5000 }, async () => {
        state.probes++;
        return state.result;
    }, async () => state.block, () => state.busy, () => {
        state.exits++;
    }, () => {});
    return { state,
        monitor };
}

test("disabled by default and invalid settings fail safe", async () => {
    assert.deepEqual(dockerRecoveryConfig({}), { retries: 0,
        intervalMs: 30000 });
    assert.deepEqual(dockerRecoveryConfig({ DOCKGE_DOCKER_RECOVERY_RETRIES: "-1",
        DOCKGE_DOCKER_RECOVERY_INTERVAL_SECONDS: "0" }), { retries: 0,
        intervalMs: 30000 });
    const { state, monitor } = fixture(0);
    await monitor.check();
    assert.equal(state.probes, 0);
});

test("retries require a previously healthy connection and trigger only once", async () => {
    const { state, monitor } = fixture();
    state.result = "unavailable";
    for (let i = 0; i < 10; i++) {
        await monitor.check();
    }
    assert.equal(state.exits, 0, "no restart loop on an inaccessible startup socket");
    state.result = "ready";
    await monitor.check();
    state.result = "unavailable";
    await monitor.check();
    assert.equal(state.exits, 0);
    await monitor.check();
    await monitor.check();
    assert.equal(state.exits, 1);
});

test("temporary outage and configuration errors reset consecutive failures", async () => {
    const { state, monitor } = fixture();
    for (const result of [ "ready", "unavailable", "ready", "unavailable", "configuration-error", "unavailable" ] as const) {
        state.result = result;
        await monitor.check();
    }
    assert.equal(state.exits, 0);
});

test("active operations defer exit and release permits recovery", async () => {
    const { state, monitor } = fixture(1);
    await monitor.check();
    state.result = "unavailable";
    state.block = true;
    await monitor.check();
    assert.equal(state.exits, 0);
    state.block = false;
    state.busy = true;
    await monitor.check();
    assert.equal(state.exits, 0);
    state.busy = false;
    await monitor.check();
    assert.equal(state.exits, 1);
});

test("a mutation acquired during the asynchronous guard prevents restart", async () => {
    let result: DockerProbeResult = "ready";
    let busy = false;
    let exits = 0;
    const monitor = new DockerSocketRecovery({ retries: 1,
        intervalMs: 5000 }, async () => result, async () => {
        busy = true;
        return false;
    }, () => busy, () => {
        exits++;
    }, () => {});
    await monitor.check();
    result = "unavailable";
    await monitor.check();
    assert.equal(exits, 0);
});

test("checks cannot overlap and stop cancels an outstanding probe", async () => {
    let release!: (value: DockerProbeResult) => void;
    let probes = 0;
    const monitor = new DockerSocketRecovery({ retries: 1,
        intervalMs: 5000 }, () => {
        probes++;
        return new Promise(resolve => {
            release = resolve;
        });
    }, async () => false, () => false, () => assert.fail("stopped"), () => {});
    const pending = monitor.check();
    await monitor.check();
    assert.equal(probes, 1);
    monitor.stop();
    release("ready");
    await pending;
    await monitor.check();
    assert.equal(probes, 1);
});

test("guard errors fail closed", async () => {
    let result: DockerProbeResult = "ready";
    const monitor = new DockerSocketRecovery({ retries: 1,
        intervalMs: 5000 }, async () => result, async () => {
        throw new Error("state unreadable");
    }, () => false, () => assert.fail("must not exit"), () => {});
    await monitor.check();
    result = "unavailable";
    await monitor.check();
});

test("a prolonged blocker does not spam repeated log messages", async () => {
    const messages: string[] = [];
    let result: DockerProbeResult = "ready";
    const monitor = new DockerSocketRecovery({ retries: 1,
        intervalMs: 5000 }, async () => result, async () => true, () => false, () => assert.fail("blocked"), message => messages.push(message));
    await monitor.check();
    result = "unavailable";
    for (let i = 0; i < 10; i++) {
        await monitor.check();
    }
    assert.equal(messages.length, 2);
});

test("connection failures differ from permissions, TLS, API and missing command", () => {
    for (const stderr of [ "Cannot connect to the Docker daemon", "connection refused", "i/o timeout" ]) {
        assert.equal(classifyDockerProbeError({ stderr }), "unavailable");
    }
    for (const stderr of [ "permission denied while trying to connect", "certificate expired", "client API version is too new", "unauthorized" ]) {
        assert.equal(classifyDockerProbeError({ stderr }), "configuration-error");
    }
    assert.equal(classifyDockerProbeError({ code: "ENOENT" }), "configuration-error");
    assert.equal(classifyDockerProbeError({ killed: true }), "unavailable");
});
