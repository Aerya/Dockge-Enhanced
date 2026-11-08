import test from "node:test";
import assert from "node:assert/strict";
import { agentOnly, requireAgentAuthentication, requireInteractiveSelfUpdate } from "./agent-mode";

test("agent mode is opt-in, refuses unsafe authentication and interactive self-update", t => {
    const original = process.env.DOCKGE_AGENT_ONLY;
    t.after(() => {
        if (original === undefined) {
            delete process.env.DOCKGE_AGENT_ONLY;
        } else {
            process.env.DOCKGE_AGENT_ONLY = original;
        }
    });
    assert.equal(agentOnly({}), false);
    assert.throws(() => agentOnly({ DOCKGE_AGENT_ONLY: "true" }), /0 or 1/);
    assert.throws(() => agentOnly({ DOCKGE_AGENT_ONLY: "1",
        DOCKGE_HUB_ONLY: "1" }), /combined/);
    process.env.DOCKGE_AGENT_ONLY = "1";
    assert.throws(() => requireAgentAuthentication("disabled", false), /authentication/);
    assert.throws(() => requireAgentAuthentication("trusted-proxy", false), /authentication/);
    assert.throws(() => requireAgentAuthentication("local", true), /authentication/);
    assert.doesNotThrow(() => requireAgentAuthentication("local", false));
    assert.throws(requireInteractiveSelfUpdate, /agent-only/);
    process.env.DOCKGE_AGENT_ONLY = "0";
    assert.doesNotThrow(requireInteractiveSelfUpdate);
});
