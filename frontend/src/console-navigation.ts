type NavigationStorage = Pick<Storage, "getItem" | "setItem">;

export function loadHiddenConsole(storage: NavigationStorage, username: string | null): boolean {
    try {
        return !!username && storage.getItem(`hide-console:${username}`) === "true";
    } catch {
        return false;
    }
}

export function saveHiddenConsole(storage: NavigationStorage, username: string | null, hidden: boolean): void {
    if (!username) {
        return;
    }
    try {
        storage.setItem(`hide-console:${username}`, String(hidden));
    } catch {
        // Browser storage restrictions do not prevent changing this view.
    }
}
