import { UpdatePause } from "../watchers/update-policy";

export type SelfUpdateMode = "manual" | "sidecar" | "agent";
export type SelfUpdateScheduleType = "immediate" | "window";
export type SelfUpdateBlockerCode = "active-editor" | "image-work" | "restic-backup" | "restic-restore" | "stack-transfer" | "stack-replication" | "trivy-scan" | "external-stack-integration" | "state-check-error";

export type SelfUpdateStage =
    | "preparing"
    | "backup"
    | "verify-backup"
    | "prune-backup"
    | "prepare-updater"
    | "pull-target"
    | "replace-container"
    | "health-check"
    | "rollback";

export interface SelfUpdateStageTiming {
    stage: SelfUpdateStage;
    startedAt: string;
    finishedAt?: string | null;
}

export interface SelfUpdateSettings {
    mode: SelfUpdateMode;
    schedule: {
        type: SelfUpdateScheduleType;
        start: string;
        end: string;
        days: number[];
    };
    pause: UpdatePause;
}

export interface SelfUpdatePlan {
    version: 1;
    id: string;
    issuedAt: string;
    expiresAt: string;
    targetContainerId: string;
    targetContainerName: string;
    targetImage: string;
    targetRevision?: string;
    previousImage: string;
    previousImageId: string;
    allowedRepository: string;
    recoveryFile: string;
    compose?: {
        workingDir: string;
        configFiles: string[];
        project: string;
        service: string;
    };
}

export interface SelfUpdateOperation {
    id: string;
    state: "idle" | "scheduled" | "backing-up" | "verifying-backup" | "updating" | "waiting-health" | "rolling-back" | "succeeded" | "failed" | "rolled-back" | "rollback-failed";
    message: string;
    startedAt: string | null;
    finishedAt: string | null;
    targetImage: string;
    rollbackAttempted: boolean;
    stage?: SelfUpdateStage;
    stageStartedAt?: string | null;
    stageHistory?: SelfUpdateStageTiming[];
    deferredBy?: SelfUpdateBlockerCode;
    notificationPending?: boolean;
    notificationSentAt?: string | null;
}

export interface SelfUpdateProgress {
    phase: "backup" | "verification" | "retention";
    label: string;
    completed?: number;
    total?: number;
    filesDone?: number;
    totalFiles?: number;
    destinationIndex?: number;
    destinationCount?: number;
    snapshotsToRemove?: number;
}
