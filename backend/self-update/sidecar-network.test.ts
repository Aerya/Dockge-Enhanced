import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { connectSidecarAdditionalNetworks, planSidecarNetworks } from "./sidecar-network";

test("one Docker Socket Proxy network is provided at sidecar creation, without network connect", async () => {
    const plan = planSidecarNetworks([ "socket-proxy-internal" ]);
    assert.deepEqual(plan, { initialNetwork: "socket-proxy-internal",
        additionalNetworks: [] });
    const calls: string[] = [];
    await connectSidecarAdditionalNetworks(plan, async (name) => {
        calls.push(`connect:${name}`);
    }, async () => {
        calls.push("start");
    });
    assert.deepEqual(calls, [ "start" ]);
});

test("two networks are attached in order, before the signed plan is released", async () => {
    const plan = planSidecarNetworks([ "socket-proxy-internal", "npm-proxy" ]);
    assert.deepEqual(plan, { initialNetwork: "socket-proxy-internal",
        additionalNetworks: [ "npm-proxy" ] });
    const calls: string[] = [ `run:${plan.initialNetwork}` ];
    await connectSidecarAdditionalNetworks(plan, async (name) => {
        calls.push(`connect:${name}`);
    }, async () => {
        calls.push("start");
    });
    assert.deepEqual(calls, [ "run:socket-proxy-internal", "connect:npm-proxy", "start" ]);
});

test("multiple networks are deduplicated and only additional networks are attached", () => {
    assert.deepEqual(planSidecarNetworks([ "npm-proxy", "socket-proxy-internal", "npm-proxy", "apps" ]), {
        initialNetwork: "npm-proxy",
        additionalNetworks: [ "socket-proxy-internal", "apps" ],
    });
});

test("empty, none and host networks cannot be used for TCP sidecar", () => {
    assert.throws(() => planSidecarNetworks([]), /at least one/);
    assert.throws(() => planSidecarNetworks([ "none", "apps" ]), /Unsupported/);
    assert.throws(() => planSidecarNetworks([ "host" ]), /Unsupported/);
});

test("a failed network attachment does not release the signed plan", async () => {
    const plan = planSidecarNetworks([ "socket-proxy-internal", "npm-proxy", "apps" ]);
    const calls: string[] = [];
    await assert.rejects(connectSidecarAdditionalNetworks(plan, async (name) => {
        calls.push(`connect:${name}`);
        throw new Error("denied");
    }, async () => {
        calls.push("start");
    }), /denied/);
    assert.deepEqual(calls, [ "connect:npm-proxy" ]);
});

test("manager starts TCP updater on the selected network, never in none", async () => {
    const manager = await readFile(new URL("./manager.ts", import.meta.url), "utf8");
    assert.match(manager, /"--network", tcpNetworkPlan.initialNetwork/);
    assert.doesNotMatch(manager, /"--network", "none"/);
    assert.match(manager, /await connectSidecarAdditionalNetworks\(tcpNetworkPlan/);
});
