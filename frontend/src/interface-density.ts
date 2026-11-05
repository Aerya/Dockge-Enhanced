type DensityStorage = Pick<Storage, "getItem" | "setItem">;

export function loadCompactInterface(storage: DensityStorage, username: string | null): boolean {
    if (!username) {
        return false;
    }
    try {
        return storage.getItem(`interface-density:${username}`) === "compact";
    } catch {
        return false;
    }
}

export function saveCompactInterface(storage: DensityStorage, username: string | null, compact: boolean): void {
    if (!username) {
        return;
    }
    try {
        storage.setItem(`interface-density:${username}`, compact ? "compact" : "classic");
    } catch {
        // Restricted browser storage must not prevent switching the current view.
    }
}
