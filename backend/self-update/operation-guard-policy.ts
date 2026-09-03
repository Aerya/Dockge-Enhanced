import type { SelfUpdateBlockerCode } from "./types";

const EXTERNAL_STACK_ACTIVE_STATES = new Set([ "preparing", "updating", "waiting-health", "rolling-back" ]);

export interface SelfUpdateOperationSnapshot {
    activeEditor: boolean;
    imageWork: boolean;
    resticBackup: boolean;
    resticRestore: boolean;
    stackTransfer: boolean;
    stackReplication: boolean;
    trivyScan: boolean;
    externalStackIntegration: boolean;
}

export interface SelfUpdateBlocker {
    code: SelfUpdateBlockerCode;
    message: string;
}

export const BLOCKER_MESSAGES: Record<SelfUpdateBlockerCode, string> = {
    "active-editor": "unsaved compose or environment changes are being edited",
    "external-stack-integration": "a protected external-stack integration is in progress",
    "restic-restore": "a Restic restore is in progress",
    "restic-backup": "a Restic backup or backup verification is in progress",
    "stack-transfer": "a stack copy, move or data transfer is in progress",
    "stack-replication": "a stack replication or recovery test is in progress",
    "image-work": "an image update or image check is in progress",
    "trivy-scan": "an image security scan is in progress",
    "state-check-error": "the state of sensitive operations could not be verified safely",
};

export function selectSelfUpdateBlocker(snapshot: SelfUpdateOperationSnapshot): SelfUpdateBlocker | null {
    const ordered: Array<[SelfUpdateBlockerCode, boolean]> = [
        [ "active-editor", snapshot.activeEditor ],
        [ "external-stack-integration", snapshot.externalStackIntegration ],
        [ "restic-restore", snapshot.resticRestore ],
        [ "restic-backup", snapshot.resticBackup ],
        [ "stack-transfer", snapshot.stackTransfer ],
        [ "stack-replication", snapshot.stackReplication ],
        [ "image-work", snapshot.imageWork ],
        [ "trivy-scan", snapshot.trivyScan ],
    ];
    const match = ordered.find(([, active]) => active);
    return match ? { code: match[0], message: BLOCKER_MESSAGES[match[0]] } : null;
}

export function isExternalStackIntegrationStateActive(state: unknown): boolean {
    return EXTERNAL_STACK_ACTIVE_STATES.has(String(state ?? ""));
}
