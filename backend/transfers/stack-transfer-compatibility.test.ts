import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
    compareStackTransferCompatibility,
    StackTransferCompatibilitySnapshot,
} from "./stack-transfer-compatibility";

function snapshot(protocolVersion: number, buildRevision: string): StackTransferCompatibilitySnapshot {
    return {
        protocolVersion,
        appVersion: "test",
        buildRevision,
        buildCreated: "2026-09-02T00:00:00Z",
        selfUpdate: {
            updateAvailable: false,
            remoteRevision: "",
            operationState: "idle",
            operationMessage: "",
        },
    };
}

describe("stack transfer compatibility", () => {
    it("allows different builds using the same protocol", () => {
        const result = compareStackTransferCompatibility(snapshot(2, "a".repeat(40)), snapshot(2, "b".repeat(40)));
        assert.equal(result.compatible, true);
        assert.equal(result.sameBuild, false);
        assert.equal(result.outdatedSide, null);
    });

    it("identifies the older endpoint", () => {
        assert.equal(compareStackTransferCompatibility(snapshot(1, "a"), snapshot(2, "b")).outdatedSide, "source");
        assert.equal(compareStackTransferCompatibility(snapshot(3, "a"), snapshot(2, "b")).outdatedSide, "target");
    });

    it("does not trust legacy protocol zero", () => {
        assert.equal(compareStackTransferCompatibility(snapshot(0, ""), snapshot(0, "")).compatible, false);
    });
});
