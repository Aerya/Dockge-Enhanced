import * as fs from "node:fs/promises";
import * as path from "node:path";
import { Settings } from "../settings";
import { BackupManager } from "../watchers/backup-manager";
import { ImageWatcher } from "../watchers/image-watcher";
import { TrivyScanner } from "../watchers/trivy-scanner";
import {
    BLOCKER_MESSAGES,
    isExternalStackIntegrationStateActive,
    selectSelfUpdateBlocker,
    SelfUpdateBlocker,
} from "./operation-guard-policy";

const DATA_DIR = process.env.DOCKGE_DATA_DIR ?? "/opt/dockge/data";
const EXTERNAL_STACK_ACCESS_STATUS = path.join(DATA_DIR, "external-stack-access", "status.json");

function records(value: unknown): Array<Record<string, unknown>> {
    return Array.isArray(value)
        ? value.filter((item): item is Record<string, unknown> => !!item && typeof item === "object" && !Array.isArray(item))
        : [];
}

async function hasActiveStackTransfer(): Promise<boolean> {
    const [ targetJobs, sourceJobs, pendingMoves ] = await Promise.all([
        Settings.get("stackTransferJobs"),
        Settings.get("stackTransferDataSourceJobs"),
        Settings.get("pendingStackMoves"),
    ]);
    return records(targetJobs).some((job) => [ "queued", "running", "target-ready" ].includes(String(job.status ?? "")))
        || records(sourceJobs).some((job) => [ "snapshotted", "source-stopped" ].includes(String(job.status ?? "")))
        || records(pendingMoves).some((move) => String(move.status ?? "") === "pending");
}

async function hasActiveStackReplication(): Promise<boolean> {
    const policies = await Settings.get("stackReplicationPolicies");
    return records(policies).some((policy) => String(policy.status ?? "") === "running");
}

async function hasActiveExternalStackIntegration(): Promise<boolean> {
    try {
        const operation = JSON.parse(await fs.readFile(EXTERNAL_STACK_ACCESS_STATUS, "utf8")) as { state?: unknown };
        return isExternalStackIntegrationStateActive(operation.state);
    } catch (error) {
        if ((error as NodeJS.ErrnoException)?.code === "ENOENT") return false;
        throw error;
    }
}

export async function getSelfUpdateBlocker(): Promise<SelfUpdateBlocker | null> {
    try {
        const [ stackTransfer, stackReplication, externalStackIntegration ] = await Promise.all([
            hasActiveStackTransfer(),
            hasActiveStackReplication(),
            hasActiveExternalStackIntegration(),
        ]);
        return selectSelfUpdateBlocker({
            imageWork: ImageWatcher.getInstance().isBusy(),
            resticBackup: BackupManager.getInstance().isBackupRunActive(),
            resticRestore: BackupManager.getInstance().isRestoreRunActive(),
            stackTransfer,
            stackReplication,
            trivyScan: TrivyScanner.getInstance().getStatus().running,
            externalStackIntegration,
        });
    } catch {
        return { code: "state-check-error", message: BLOCKER_MESSAGES["state-check-error"] };
    }
}
