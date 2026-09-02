import assert from "node:assert/strict";
import test from "node:test";
import {
    isExternalStackIntegrationStateActive,
    selectSelfUpdateBlocker,
    type SelfUpdateOperationSnapshot,
} from "./operation-guard-policy";

const idle = (): SelfUpdateOperationSnapshot => ({
    imageWork: false,
    resticBackup: false,
    resticRestore: false,
    stackTransfer: false,
    stackReplication: false,
    trivyScan: false,
    externalStackIntegration: false,
});

test("self-update guard is idle when no sensitive operation is active", () => {
    assert.equal(selectSelfUpdateBlocker(idle()), null);
});

test("self-update guard recognizes every supported blocker", () => {
    const cases: Array<[keyof SelfUpdateOperationSnapshot, string]> = [
        [ "imageWork", "image-work" ],
        [ "resticBackup", "restic-backup" ],
        [ "resticRestore", "restic-restore" ],
        [ "stackTransfer", "stack-transfer" ],
        [ "stackReplication", "stack-replication" ],
        [ "trivyScan", "trivy-scan" ],
        [ "externalStackIntegration", "external-stack-integration" ],
    ];
    for (const [ key, expected ] of cases) {
        assert.equal(selectSelfUpdateBlocker({ ...idle(), [key]: true })?.code, expected);
    }
});

test("self-update guard prioritizes container-recreation and restore operations", () => {
    assert.equal(selectSelfUpdateBlocker({
        ...idle(),
        imageWork: true,
        resticBackup: true,
        externalStackIntegration: true,
    })?.code, "external-stack-integration");
});

test("future protected external-stack helper active states are recognized", () => {
    for (const state of [ "preparing", "updating", "waiting-health", "rolling-back" ]) {
        assert.equal(isExternalStackIntegrationStateActive(state), true, state);
    }
    for (const state of [ "idle", "succeeded", "failed", "rolled-back", "rollback-failed", undefined ]) {
        assert.equal(isExternalStackIntegrationStateActive(state), false, String(state));
    }
});
