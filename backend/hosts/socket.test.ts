import assert from "node:assert/strict";
import test from "node:test";
import { R } from "redbean-node";
import { AgentSocket } from "../../common/agent-socket";
import { registerHosts } from "../agent-socket-handlers/hosts-socket-handler";
import type { DockgeSocket } from "../util-server";
import { HostManager, HOST_DEFAULTS } from "./manager";
import { requireLocalRpc } from "../hub-mode";
import { hostAlertKey } from "./notifications";

test("every host RPC refuses anonymous and restricted users before I/O", async t => {
    t.mock.method(R, "findOne", async () => ({ role: "restricted" }));
    for (const userID of [ undefined, 42 ]) {
        const agent = new AgentSocket();
        registerHosts({ userID } as DockgeSocket, agent);
        for (const event of [ "hosts:capabilities", "hosts:get", "hosts:settings", "hosts:operation", "hosts:packages" ]) {
            const result = await new Promise<{ ok: boolean }>(resolve => agent.call(event, { command: "never-execute" }, resolve));
            assert.equal(result.ok, false);
            assert.ok(!JSON.stringify(result).includes("never-execute"));
        }
    }
});
test("capability negotiation works while disabled and requires no collector", async t => {
    t.mock.method(R, "findOne", async () => ({ role: "admin" }));
    const agent = new AgentSocket();
    registerHosts({ userID: 42 } as DockgeSocket, agent);
    const result = await new Promise<{ ok: boolean;
        data: { protocol: number } }>(resolve => agent.call("hosts:capabilities", {}, resolve));
    assert.equal(result.ok, true);
    assert.equal(result.data.protocol, 1);
});
test("disabled snapshot never reads inventory or operation reports", async t => {
    const manager = new HostManager();
    t.mock.method(manager, "settings", async () => ({ ...HOST_DEFAULTS }));
    const result = await manager.snapshot();
    assert.equal(result.report, null);
    assert.equal(result.state, "disabled");
    assert.equal(result.operations.manual, false);
    assert.deepEqual(result.history, []);
});
test("hub-only permits host RPCs independently of Docker operations", () => {
    const old = process.env.DOCKGE_HUB_ONLY;
    process.env.DOCKGE_HUB_ONLY = "1";
    try {
        requireLocalRpc("hosts:capabilities");
        requireLocalRpc("hosts:get");
        assert.throws(() => requireLocalRpc("dockerRestart"));
    } finally {
        if (old === undefined) {
            delete process.env.DOCKGE_HUB_ONLY;
        } else {
            process.env.DOCKGE_HUB_ONLY = old;
        }
    }
});
test("alerts deduplicate stable results without inventory timestamps", () => {
    const security = { state: "partial" as const,
        findings: [] };
    assert.equal(hostAlertKey("fresh", "unknown", security), hostAlertKey("fresh", "unknown", { ...security,
        scannedAt: "changed" }));
    assert.notEqual(hostAlertKey("fresh", "unknown", security), hostAlertKey("stale", "unknown", security));
});

test("existing federation proxy carries host capabilities to direct and reverse endpoints", async t => {
    const { AgentProxySocketHandler } = await import("../socket-handlers/agent-proxy-socket-handler");
    t.mock.method(R, "findOne", async () => ({ role: "admin" }));
    const remote = new AgentSocket();
    registerHosts({ userID: 7 } as DockgeSocket, remote);
    let listener: (...args: unknown[]) => Promise<void>;
    const endpoints: string[] = [];
    const socket = { userID: 7,
        endpoint: "",
        on: (_event: string, handler: typeof listener) => {
            listener = handler;
        },
        instanceManager: { emitToEndpoint: async (endpoint: string, event: string, ...args: unknown[]) => {
            endpoints.push(endpoint);
            remote.call(event, ...args);
        } } } as unknown as DockgeSocket;
    new AgentProxySocketHandler().create2(socket, {} as never, new AgentSocket());
    for (const endpoint of [ "direct.example", "reverse://fixture" ]) {
        const response = await new Promise<{ ok: boolean;
            data: { protocol: number } }>(resolve => {
            void listener!(endpoint, "hosts:capabilities", {}, resolve);
        });
        assert.equal(response.ok, true);
        assert.equal(response.data.protocol, 1);
    }
    assert.deepEqual(endpoints, [ "direct.example", "reverse://fixture" ]);
});
