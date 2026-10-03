import { ValidationError } from "./util-server";

interface BackupState {
    isBackupRunActive(): boolean;
    isRestoreRunActive(): boolean;
    settings: {
        stackPolicies?: Record<string, { mode: string }>;
    };
}

export function assertStackPauseAllowed(backup: BackupState, stackName: string, paused: boolean): void {
    if (backup.isBackupRunActive() || backup.isRestoreRunActive()) {
        throw new ValidationError("A Restic backup or restore is running; retry after it completes.");
    }
    const policy = backup.settings.stackPolicies?.[stackName];
    if (paused && policy && policy.mode !== "hot") {
        throw new ValidationError("This stack uses a stop or hook-based Restic backup policy; switch to hot backup before pausing it.");
    }
}

/** Compare immutable container IDs rather than mutable Compose project names. */
export function assertNotSelfStack(currentId: string | undefined, targetIds: string[]): void {
    if (!currentId) {
        throw new ValidationError("Cannot identify this Enhanced container; stack pause is unavailable.");
    }
    if (targetIds.some((id) => id.length >= 12 && (currentId.startsWith(id) || id.startsWith(currentId)))) {
        throw new ValidationError("Dockge-Enhanced cannot pause its own stack.");
    }
}
