import packageJSON from "../../package.json";
import { SelfUpdateManager } from "../self-update/manager";
import { SelfUpdateChecker } from "../watchers/self-update-checker";

export const STACK_TRANSFER_PROTOCOL_VERSION = 1;

const ACTIVE_SELF_UPDATE_STATES = new Set([
    "scheduled",
    "backing-up",
    "verifying-backup",
    "updating",
    "waiting-health",
    "rolling-back",
]);

export interface StackTransferCompatibilitySnapshot {
    protocolVersion: number;
    appVersion: string;
    buildRevision: string;
    buildCreated: string;
    selfUpdate: {
        updateAvailable: boolean;
        remoteRevision: string;
        operationState: string;
        operationMessage: string;
    };
}

export interface StackTransferCompatibilityComparison {
    compatible: boolean;
    sameBuild: boolean;
    sourceProtocol: number;
    targetProtocol: number;
    outdatedSide: "source" | "target" | null;
}

export function compareStackTransferCompatibility(
    source: StackTransferCompatibilitySnapshot,
    target: StackTransferCompatibilitySnapshot,
): StackTransferCompatibilityComparison {
    const sourceProtocol = Number(source.protocolVersion) || 0;
    const targetProtocol = Number(target.protocolVersion) || 0;
    return {
        compatible: sourceProtocol > 0 && sourceProtocol === targetProtocol,
        sameBuild: !!source.buildRevision && !!target.buildRevision && source.buildRevision === target.buildRevision,
        sourceProtocol,
        targetProtocol,
        outdatedSide: sourceProtocol === targetProtocol
            ? null
            : sourceProtocol < targetProtocol ? "source" : "target",
    };
}

export function getStackTransferCompatibilitySnapshot(): StackTransferCompatibilitySnapshot {
    const checker = SelfUpdateChecker.getInstance().getStatus();
    const operation = SelfUpdateManager.getInstance().getOperation();
    return {
        protocolVersion: STACK_TRANSFER_PROTOCOL_VERSION,
        appVersion: String(packageJSON.version || ""),
        buildRevision: checker.localBuild.revision || "",
        buildCreated: checker.localBuild.created || "",
        selfUpdate: {
            updateAvailable: checker.updateAvailable,
            remoteRevision: checker.remoteBuild.revision || "",
            operationState: operation.state,
            operationMessage: operation.message || "",
        },
    };
}

export async function startStackTransferCompatibilityUpdate(): Promise<{
    started: boolean;
    reason?: string;
    snapshot: StackTransferCompatibilitySnapshot;
}> {
    const checker = SelfUpdateChecker.getInstance();
    const manager = SelfUpdateManager.getInstance();

    await checker.check();
    const status = checker.getStatus();
    const operation = manager.getOperation();

    if (ACTIVE_SELF_UPDATE_STATES.has(operation.state)) {
        return { started: true, reason: "already-running", snapshot: getStackTransferCompatibilitySnapshot() };
    }

    if (!status.updateAvailable || !status.remoteDigest) {
        return { started: false, reason: "no-update-available", snapshot: getStackTransferCompatibilitySnapshot() };
    }

    await manager.requestSidecarUpdate(
        `ghcr.io/${status.repo}@${status.remoteDigest}`,
        false,
        status.remoteBuild.revision || undefined,
    );

    return { started: true, snapshot: getStackTransferCompatibilitySnapshot() };
}
