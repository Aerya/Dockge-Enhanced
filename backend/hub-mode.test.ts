import test from "node:test";
import assert from "node:assert/strict";
import { hubOnly, requireLocalRpc, requireLocalRuntime } from "./hub-mode";
import { Stack } from "./stack";
import { AgentProxySocketHandler } from "./socket-handlers/agent-proxy-socket-handler";
import { AgentSocket } from "../common/agent-socket";
import type { DockgeSocket } from "./util-server";
import type { DockgeServer } from "./dockge-server";

test("hub-only is opt-in, rejects invalid settings and blocks local stack entry points", async t => {
    const original = process.env.DOCKGE_HUB_ONLY;
    t.after(() => {
        if (original === undefined) {
            delete process.env.DOCKGE_HUB_ONLY;
        } else {
            process.env.DOCKGE_HUB_ONLY = original;
        }
    });
    assert.equal(hubOnly({}), false);
    assert.throws(() => hubOnly({ DOCKGE_HUB_ONLY: "yes" }), /0 or 1/);
    process.env.DOCKGE_HUB_ONLY = "0";
    assert.doesNotThrow(requireLocalRuntime);
    process.env.DOCKGE_HUB_ONLY = "1";
    assert.throws(requireLocalRuntime, /Hub-only/);
    for (const event of [ "saveStack", "deployStack", "startStack", "mainTerminal", "unknownFutureMutation" ]) {
        assert.throws(() => requireLocalRpc(event), /Hub-only/);
    }
    assert.doesNotThrow(() => requireLocalRpc("appCatalogSources"));
    assert.equal((await Stack.getStackList({} as DockgeServer)).size, 0);
    await assert.rejects(Stack.getStack({} as DockgeServer, "existing"), /Hub-only/);
});

test("hub refuses local and federated-self RPCs, while forwarding remote RPCs unchanged", async t => {
    const original = process.env.DOCKGE_HUB_ONLY;
    process.env.DOCKGE_HUB_ONLY = "1";
    t.after(() => {
        if (original === undefined) {
            delete process.env.DOCKGE_HUB_ONLY;
        } else {
            process.env.DOCKGE_HUB_ONLY = original;
        }
    });
    let listener: (...args: unknown[]) => Promise<void>;
    const forwarded: unknown[][] = [];
    const socket = { userID: 1,
        endpoint: "hub",
        on: (event: string, callback: typeof listener) => {
            if (event === "agent") {
                listener = callback;
            }
        },
        instanceManager: { emitToEndpoint: async (...args: unknown[]) => {
            forwarded.push(args);
        } } } as unknown as DockgeSocket;
    const local = new AgentSocket();
    let called = false;
    local.on("saveStack", () => {
        called = true;
    });
    new AgentProxySocketHandler().create2(socket, {} as DockgeServer, local);
    for (const endpoint of [ "", "hub" ]) {
        let result: { ok: boolean } | undefined;
        await listener!(endpoint, "saveStack", "app", (value: typeof result) => {
            result = value;
        });
        assert.equal(result?.ok, false);
    }
    assert.equal(called, false);
    await listener!("remote", "saveStack", "app");
    assert.deepEqual(forwarded, [[ "remote", "saveStack", "app" ]]);
});
