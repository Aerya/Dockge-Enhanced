import test, { mock } from "node:test";
import assert from "node:assert/strict";
import { AgentManager } from "./agent-manager";
import { Settings } from "./settings";

test("persists the local instance display name in general settings", async () => {
    const calls: unknown[][] = [];
    mock.method(Settings, "set", async (...args: unknown[]) => {
        calls.push(args);
    });

    try {
        const manager = Object.create(AgentManager.prototype) as AgentManager;
        await manager.rename("", "Main NAS");
        assert.deepEqual(calls, [ [ "localAgentDisplayName", "Main NAS", "general" ] ]);
    } finally {
        mock.restoreAll();
    }
});
