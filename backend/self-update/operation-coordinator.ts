/**
 * Process-local hand-off between the self-update preparation and ImageWatcher.
 *
 * The persisted operation status covers the detached sidecar lifetime. This
 * short-lived lock closes the gap before that status has been written.
 */
let preparationInProgress = false;

export function beginSelfUpdatePreparation(): boolean {
    if (preparationInProgress) {
        return false;
    }
    preparationInProgress = true;
    return true;
}

export function endSelfUpdatePreparation(): void {
    preparationInProgress = false;
}

export function isSelfUpdatePreparationInProgress(): boolean {
    return preparationInProgress;
}
