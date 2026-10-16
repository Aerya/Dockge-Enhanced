import test from "node:test";
import assert from "node:assert/strict";
import { collectZerobytePeers, sanitizeZerobyteSummary } from "./zerobyte-federation";
test("federation is read-only, filters secrets and distinguishes offline from disabled", async () => {
    const peers = await collectZerobytePeers([{ endpoint: "one",
        name: "One" }, { endpoint: "two",
        name: "Two" }], async endpoint => {
        if (endpoint === "two") {
            throw new Error("offline with secret");
        }
        return { enabled: false,
            reachable: false,
            jobs: 0,
            failedJobs: 0,
            activeTasks: 0,
            workflowAlerts: 0,
            apiKey: "hidden" };
    });
    assert.equal(peers[0].online, true);
    assert.equal(peers[0].summary?.enabled, false);
    assert.equal(peers[1].online, false);
    assert.equal(peers[1].summary, null);
    assert.ok(!JSON.stringify(peers).includes("hidden"));
    assert.ok(!JSON.stringify(peers).includes("secret"));
    assert.throws(() => sanitizeZerobyteSummary({ jobs: -1 }));
});
