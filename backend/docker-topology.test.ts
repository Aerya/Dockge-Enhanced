import test from "node:test";
import assert from "node:assert/strict";
import { R } from "redbean-node";
import { collectTopology, TopologyCache, topologyContainerFormat } from "./docker-topology";
import { topologyOwner, topologySelection } from "../common/docker-topology";
import { TopologySocketHandler } from "./agent-socket-handlers/topology-socket-handler";
import { AgentSocket } from "../common/agent-socket";
import type { DockgeSocket } from "./util-server";
import type { DockgeServer } from "./dockge-server";
test("revocation during collection prevents delivery, including authenticated federation", async (t) => {
    let role = "admin";
    t.mock.method(R, "findOne", async () => ({ role }));
    const snapshot = await collectTopology(names, async () => "");
    let release!: () => void;
    const barrier = new Promise<void>(resolve => {
        release = resolve;
    });
    const handler = new TopologySocketHandler();
    Object.defineProperty(handler, "cache", { value: new TopologyCache(async () => {
        await barrier;
        return snapshot;
    }) });
    const agent = new AgentSocket();
    handler.create({ userID: 1,
        federationAuthenticated: true } as DockgeSocket, {} as DockgeServer, agent);
    const pending = new Promise<{
        ok: boolean;
    }>(resolve => agent.call("topology:get", resolve));
    await new Promise(resolve => setImmediate(resolve));
    role = "restricted";
    release();
    assert.equal((await pending).ok, false);
    role = "admin";
    assert.equal((await new Promise<{
        ok: boolean;
    }>(resolve => agent.call("topology:get", resolve))).ok, true);
});
const raw = (id: string) => ({ id,
    name: "/" + id,
    project: "demo",
    service: "web",
    state: "running",
    mode: "bridge",
    networks: { shared: { IPAddress: "192.0.2.2",
        MacAddress: "not-returned" } },
    ports: { "80/tcp": [{ HostIp: "0.0.0.0",
        HostPort: "8080" }],
    "53/udp": [{ HostIp: "::",
        HostPort: "5353" }],
    "9000/tcp": null },
    Env: [ "SECRET=never-return" ],
    labels: { secret: "never-return" } });
const names = new Map([[ "demo", { name: "demo",
    external: false }]]);
test("bounded selective inspection, explicit partial result and no secret projection", async () => {
    const calls: string[][] = [];
    const ids = Array.from({ length: 35 }, (_, i) => "c" + i);
    const snapshot = await collectTopology(names, async (args) => {
        calls.push(args);
        if (args[0] === "ps") {
            return ids.join("\n");
        }
        if (args[1] === "ls") {
            return "net1";
        }
        if (args[0] === "network") {
            return JSON.stringify({ name: "shared",
                driver: "bridge",
                internal: true,
                subnets: [{ Subnet: "192.0.2.0/24" }] });
        }
        const targets = args.slice(4);
        if (targets.includes("c5")) {
            throw new Error("container disappeared");
        }
        return targets.map(id => JSON.stringify(raw(id))).join("\n");
    });
    assert.equal(snapshot.containers.length, 34);
    assert.equal(snapshot.unavailable, 1);
    assert.equal(calls.filter(c => c[0] === "ps").length, 1);
    assert.ok(calls.filter(c => c[0] === "container").every(c => c.length <= 20));
    assert.ok(!JSON.stringify(snapshot).includes("never-return"));
    assert.ok(!JSON.stringify(snapshot).includes("MacAddress"));
    assert.equal(snapshot.containers[0].ports.length, 2);
    assert.equal(snapshot.networks[0].internal, true);
    assert.ok(!topologyContainerFormat.includes(".Config.Env"));
});
test("inventory failure is not an empty successful snapshot", async () => {
    await assert.rejects(collectTopology(names, async () => {
        throw new Error("daemon unavailable");
    }));
});
test("cache coalesces concurrent scans and releases rejected work", async () => {
    let calls = 0;
    let resolve!: (s: Awaited<ReturnType<typeof collectTopology>>) => void;
    const snapshot = await collectTopology(names, async () => "");
    const cache = new TopologyCache(() => {
        calls++;
        return new Promise(r => {
            resolve = r;
        });
    });
    const a = cache.get();
    const b = cache.get();
    assert.equal(calls, 1);
    resolve(snapshot);
    assert.equal(await a, await b);
    await cache.get();
    assert.equal(calls, 1);
    let attempts = 0;
    const retry = new TopologyCache(async () => {
        if (++attempts === 1) {
            throw new Error("failed");
        }
        return snapshot;
    });
    await assert.rejects(retry.get());
    assert.equal(await retry.get(), snapshot);
});
test("external, stopped and shared namespace owners remain distinct", async () => {
    const snapshot = await collectTopology(names, async (args) => {
        if (args[0] === "ps") {
            return "owner\nchild\nstopped";
        }
        if (args[1] === "ls") {
            return "";
        }
        return args.slice(4).map(id => JSON.stringify({ ...raw(id),
            project: id === "owner" ? "outside" : "demo",
            mode: id === "child" ? "container:owner" : "bridge",
            state: id === "stopped" ? "exited" : "running" })).join("\n");
    });
    const selection = topologySelection(snapshot, "demo", false, false);
    assert.equal(selection.selected.length, 1);
    assert.equal(selection.context[0].id, "owner");
    assert.equal(selection.context[0].external, true);
    assert.equal(topologyOwner(selection.selected[0], snapshot.containers)?.id, "owner");
    assert.equal(topologySelection(snapshot, "", true, true).selected.length, 3);
});
test("topology endpoint rejects anonymous, restricted and revoked accounts before collection", async (t) => {
    let role = "restricted";
    t.mock.method(R, "findOne", async () => role === "revoked" ? null : { role });
    const agent = new AgentSocket();
    const socket = { userID: 0 } as DockgeSocket;
    new TopologySocketHandler().create(socket, {} as DockgeServer, agent);
    const call = () => new Promise<{
        ok: boolean;
    }>(resolve => agent.call("topology:get", resolve));
    assert.equal((await call()).ok, false);
    socket.userID = 1;
    assert.equal((await call()).ok, false);
    role = "revoked";
    assert.equal((await call()).ok, false);
});
