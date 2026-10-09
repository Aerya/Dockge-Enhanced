import assert from "node:assert/strict";
import test from "node:test";
import { PowerWatchSnapshot } from "../watchers/powerwatch-manager";
import { instanceSystemStatsResponse } from "./docker-socket-handler";

const snapshots: PowerWatchSnapshot[] = [
    {
        enabled: false,
        mode: "external",
        reachable: false,
        totalWatts: null,
        confidence: null,
        timestamp: null,
        webUrl: null,
        status: "disabled",
    },
    {
        enabled: true,
        mode: "external",
        reachable: true,
        totalWatts: 18.4,
        confidence: "Measured",
        timestamp: "2026-10-08T10:00:00Z",
        webUrl: "http://127.0.0.1:3064",
        status: "online",
    },
    {
        enabled: true,
        mode: "external",
        reachable: false,
        totalWatts: null,
        confidence: null,
        timestamp: null,
        webUrl: "https://powerwatch.example.test/ui",
        status: "offline",
        lastError: "HTTP 500",
    },
    {
        enabled: true,
        mode: "managed",
        reachable: true,
        totalWatts: 42.7,
        confidence: "Estimated",
        timestamp: "2026-10-08T10:00:00Z",
        webUrl: "http://127.0.0.1:3000",
        status: "online",
    },
];

test("instanceSystemStatsGet preserves existing fields and adds normalized PowerWatch data", () => {
    for (const powerWatch of snapshots) {
        const result = instanceSystemStatsResponse({
            data: { cpu: 12,
                ram: { used: 2,
                    total: 8 } },
            legacyField: "kept",
        }, powerWatch);
        assert.equal(result.ok, true);
        assert.equal(result.legacyField, "kept");
        assert.deepEqual(result.powerWatch, powerWatch);
        assert.equal("apiUrl" in result.powerWatch, false);
    }
});
