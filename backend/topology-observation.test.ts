import { test } from "node:test";
import assert from "node:assert/strict";
import { networkBytes, TopologyObservation } from "./topology-observation";
import type { TopologySnapshot } from "../common/docker-topology";
const snapshot = { containers: [{ id: "abc",
    state: "running",
    mode: "bridge" }, { id: "host",
    state: "running",
    mode: "host" }] } as TopologySnapshot;
test("counter units and malformed counters", () => {
    assert.equal(networkBytes("1.5kB"), 1500);
    assert.equal(networkBytes("2 MiB"), 2097152);
    assert.equal(networkBytes("invalid"), undefined);
});
test("opt-in sampling, cache, reset, bounded history and no host namespace guessing", async () => {
    let now = 100000;
    let bytes = 100;
    let calls = 0;
    const collector = new TopologyObservation(async (command) => {
        assert.equal(command, "docker");
        calls++;
        return JSON.stringify({ ID: "abc",
            NetIO: `${bytes}B / ${bytes * 2}B` });
    }, async () => false, () => now);
    assert.equal(calls, 0);
    assert.equal((await collector.get(snapshot)).traffic[0].state, "warming");
    await collector.get(snapshot);
    assert.equal(calls, 1);
    now += 15000;
    bytes += 150;
    const result = await collector.get(snapshot);
    assert.equal(result.host.state, "unavailable");
    assert.equal(result.traffic[0].rx, 10);
    assert.equal(result.traffic[1].state, "unavailable");
    for (let i = 0; i < 40; i++) {
        now += 15000;
        bytes += 150;
        await collector.get(snapshot);
    }
    assert.equal((await collector.get(snapshot)).traffic[0].history.length, 30);
    now += 15000;
    bytes = 1;
    assert.equal((await collector.get(snapshot)).traffic[0].state, "warming");
});
test("inaccessible host tools and Docker stay explicitly unavailable", async () => {
    const collector = new TopologyObservation(async () => {
        throw new Error("denied");
    }, async () => true);
    const result = await collector.get(snapshot);
    assert.equal(result.host.state, "unavailable");
    assert.equal(result.host.firewall, undefined);
    assert.equal(result.traffic[0].state, "unavailable");
});
