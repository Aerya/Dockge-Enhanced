/** Shared in-process gate: native Restic must not race stopped application stacks. */
let applicationBackupActive = false;
export function isZerobyteApplicationBackupActive(): boolean {
    return applicationBackupActive;
}
export function setZerobyteApplicationBackupActive(active: boolean): void {
    applicationBackupActive = active;
}
