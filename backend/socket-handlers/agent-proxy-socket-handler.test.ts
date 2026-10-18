import test from "node:test";
import assert from "node:assert/strict";
import { AgentProxySocketHandler } from "./agent-proxy-socket-handler";
import type { DockgeSocket } from "../util-server";
import type { DockgeServer } from "../dockge-server";
import { AgentSocket } from "../../common/agent-socket";

test("unavailable agent RPCs acknowledge an error instead of leaving the UI waiting", async () => {
    let listener: (...args: unknown[]) => Promise<void>;
    const socket = {
        userID: 1,
        endpoint: "",
        on: (_event: string, callback: typeof listener) => {
            listener = callback;
        },
        instanceManager: { emitToEndpoint: async () => {
            throw new Error("Reverse agent is offline");
        } },
    } as unknown as DockgeSocket;
    new AgentProxySocketHandler().create2(socket, {} as DockgeServer, new AgentSocket());
    let response: unknown;
    await listener!("node", "startStack", "app", (value: unknown) => {
        response = value;
    });
    assert.deepEqual(response, { ok: false,
        msg: "Reverse agent is offline",
        msgi18n: true });
});
