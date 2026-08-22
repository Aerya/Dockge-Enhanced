import test, { mock } from "node:test";
import assert from "node:assert/strict";
import { AgentManager } from "./agent-manager";
import { Settings } from "./settings";
import { R } from "redbean-node";

test("persists the local instance display name in general settings", async () => {
    const calls: unknown[][] = [];
    mock.method(Settings, "set", async (...args: unknown[]) => {
        calls.push(args);
    });

    try {
        const manager = Object.create(AgentManager.prototype) as AgentManager;
        await manager.rename("", "Main NAS");
        assert.deepEqual(calls, [[ "localAgentDisplayName", "Main NAS", "general" ]]);
    } finally {
        mock.restoreAll();
    }
});

test("replaces stale agent credentials and reconnects the existing endpoint", async () => {
    const bean = {
        username: "legacy",
        password: "legacy-token",
    };
    const calls: unknown[][] = [];
    mock.method(R, "findOne", async () => bean);
    mock.method(R, "store", async (value: unknown) => {
        calls.push([ "store", value ]);
    });

    try {
        const manager = Object.create(AgentManager.prototype) as AgentManager;
        Object.assign(manager, {
            agentSocketList: {},
            agentLoggedInList: {},
        });
        mock.method(manager, "disconnect", (endpoint: string) => calls.push([ "disconnect", endpoint ]));
        mock.method(manager, "connect", (...args: unknown[]) => calls.push([ "connect", ...args ]));

        await manager.updateCredentials("http://enhanced-b:5001", "operator", "fresh-secret");

        assert.equal(bean.username, "operator");
        assert.equal(bean.password, "fresh-secret");
        assert.deepEqual(calls.map((call) => call[0]), [ "store", "disconnect", "connect" ]);
        assert.deepEqual(calls.at(-1), [ "connect", "http://enhanced-b:5001", "operator", "fresh-secret" ]);
    } finally {
        mock.restoreAll();
    }
});
