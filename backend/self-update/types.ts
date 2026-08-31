import { UpdatePause } from "../watchers/update-policy";

export type SelfUpdateMode = "manual" | "sidecar" | "agent";
export type SelfUpdateScheduleType = "immediate" | "window";

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
    previousImage: string;
    compose?: {
        workingDir: string;
        configFiles: string[];
        project: string;
        service: string;
    };
}

export interface SelfUpdateOperation {
    id: string;
    state: "idle" | "scheduled" | "backing-up" | "verifying-backup" | "updating" | "waiting-health" | "succeeded" | "failed" | "rolled-back";
    message: string;
    startedAt: string | null;
    finishedAt: string | null;
    targetImage: string;
    rollbackAttempted: boolean;
}

export interface SelfUpdateProgress {
    phase: "backup" | "verification";
    label: string;
    completed?: number;
    total?: number;
    filesDone?: number;
    totalFiles?: number;
    destinationIndex?: number;
    destinationCount?: number;
}
