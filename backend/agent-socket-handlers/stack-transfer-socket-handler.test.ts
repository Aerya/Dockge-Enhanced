import test from "node:test";
import assert from "node:assert/strict";
import { AgentSocket } from "../../common/agent-socket";
import { DockgeServer } from "../dockge-server";
import { DockgeSocket } from "../util-server";
import { StackTransferSocketHandler } from "./stack-transfer-socket-handler";

function directRepository(bandwidth: number | null): Promise<{ ok: boolean; data?: { id: string }; msg?: string }> {
    const agentSocket = new AgentSocket();
    const socket = { userID: 1 } as DockgeSocket;
    new StackTransferSocketHandler().create(socket, {} as DockgeServer, agentSocket);
    return new Promise(resolve => agentSocket.call("getDirectHttpTransferRepository", "http://source.example.test", bandwidth, resolve));
}

test("accepts unlimited direct HTTP bandwidth after Socket.IO normalizes undefined to null", async () => {
    const response = await directRepository(null);
    assert.equal(response.ok, true);
    assert.match(response.data?.id || "", /^direct-http:/);
});

test("accepts zero as unlimited direct HTTP bandwidth", async () => {
    const response = await directRepository(0);
    assert.equal(response.ok, true);
});
