import test from "node:test";
import assert from "node:assert/strict";
import { R } from "redbean-node";
import { AgentSocket } from "../../common/agent-socket";
import { registerSecrets } from "../agent-socket-handlers/secrets-socket-handler";
import type { DockgeSocket } from "../util-server";
import type { DockgeServer } from "../dockge-server";

const events = [ "stackSecrets:list", "stackSecrets:save", "stackSecrets:delete", "stackSecrets:getBinding", "stackSecrets:bind", "stackSecrets:test", "stackSecrets:toolStatus", "stackSecrets:installBitwarden" ];
test("all secret RPCs reject anonymous and restricted accounts before touching providers or files", async t => {
    t.mock.method(R, "findOne", async () => ({ role: "restricted",
        active: 1 }));
    for (const userID of [ undefined, 7 ]) {
        const agent = new AgentSocket();
        registerSecrets({ userID } as DockgeSocket, {} as DockgeServer, agent);
        for (const event of events) {
            const response = await new Promise<{ ok: boolean;
                msg: string }>(resolve => agent.call(event, { token: "fixture-must-not-leak" }, resolve));
            assert.equal(response.ok, false);
            assert.ok(!JSON.stringify(response).includes("fixture"));
        }
    }
});
