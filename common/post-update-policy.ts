import { composeLabelValue } from "./compose-labels";

export const POST_UPDATE_CLEANUP = "dockge.update.cleanup";
export const POST_UPDATE_ROLLBACK = "dockge.update.rollback";
export const ROLLBACK_RETENTION_MS = 24 * 60 * 60 * 1000;

export interface PostUpdatePolicy {
    cleanup: boolean;
    rollback: boolean;
}

/** Missing settings opt in; malformed settings fail closed for deletion. */
export function postUpdatePolicy(labels?: Record<string, unknown> | unknown[]): PostUpdatePolicy {
    const cleanup = composeLabelValue(labels, POST_UPDATE_CLEANUP);
    const rollback = composeLabelValue(labels, POST_UPDATE_ROLLBACK);
    return {
        cleanup: cleanup === undefined || cleanup === true || cleanup === "true",
        rollback: rollback !== false && rollback !== "false",
    };
}

export function postUpdateCleanupDue(policy: PostUpdatePolicy, completedAt: number): number | null {
    if (!Number.isFinite(completedAt)) {
        throw new Error("Invalid update completion time");
    }
    return policy.cleanup ? completedAt + (policy.rollback ? ROLLBACK_RETENTION_MS : 0) : null;
}
