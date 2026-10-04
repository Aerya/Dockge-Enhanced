import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
    normalizeAgentDisplayName,
    normalizeAgentOfflineAlertSuppressed,
} from "./manage-agent-socket-handler";

test("normalizes optional agent display names", () => {
    assert.equal(normalizeAgentDisplayName(undefined), "");
    assert.equal(normalizeAgentDisplayName("  NAS principal  "), "NAS principal");
});

test("rejects invalid agent display names", () => {
    assert.throws(() => normalizeAgentDisplayName(42), /must be a string/);
    assert.throws(() => normalizeAgentDisplayName("a".repeat(101)), /100 characters/);
});

test("accepts only boolean offline-alert suppression values", () => {
    assert.equal(normalizeAgentOfflineAlertSuppressed(true), true);
    assert.equal(normalizeAgentOfflineAlertSuppressed(false), false);
    assert.throws(() => normalizeAgentOfflineAlertSuppressed("true"), /must be a boolean/);
});

test("adding an agent keeps the federation credentials installed by the mesh refresh", () => {
    const handler = readFileSync(new URL("./manage-agent-socket-handler.ts", import.meta.url), "utf8");
    const addAgent = handler.split("socket.on(\"addAgent\",")[1]?.split("socket.on(\"setAgentOfflineAlertSuppressed\",")[0];

    assert.ok(addAgent);
    assert.match(addAgent, /await synchronizeAgentMesh\(self\);\s*await AgentManager\.refreshFromDatabase\(\);/);
    assert.doesNotMatch(addAgent, /manager\.connect\(data\.url,\s*data\.username,\s*data\.password\)/);
});
