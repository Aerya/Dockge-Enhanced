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
    state: "idle" | "scheduled" | "backing-up" | "updating" | "waiting-health" | "succeeded" | "failed" | "rolled-back";
    message: string;
    startedAt: string | null;
    finishedAt: string | null;
    targetImage: string;
    rollbackAttempted: boolean;
}
