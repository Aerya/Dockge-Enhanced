import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { AgentManager } from "./agent-manager";

test("process-wide federation is independent from WebUI lifetime", () => {
    const agent = readFileSync(new URL("./agent-manager.ts", import.meta.url), "utf8");
    const server = readFileSync(new URL("./dockge-server.ts", import.meta.url), "utf8");

    assert.match(agent, /static async bootstrap\(\)/);
    assert.match(agent, /private static readonly sharedAgentSocketList/);
    assert.match(agent, /private static readonly subscribers/);
    assert.match(agent, /AgentManager\.subscribers\.delete\(this\.socket\)/);
    assert.doesNotMatch(agent, /if\s*\(\s*!this\.socket\.connected\s*\)/);

    assert.match(server, /AgentManager\.bootstrap\(\)/);
    assert.match(server, /dockgeSocket\.instanceManager\.release\(\)/);
    assert.match(server, /AgentManager\.shutdown\(\)/);
});

test("all AgentManager objects address the same process-wide state", () => {
    const one = new AgentManager();
    const two = new AgentManager();

    assert.equal(one.firstConnectTime, two.firstConnectTime);
});
