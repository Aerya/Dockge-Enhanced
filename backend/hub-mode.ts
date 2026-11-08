/** Restart-required deployment mode. Never inferred from a missing Docker socket. */
export function hubOnly(env = process.env): boolean {
    const value = env.DOCKGE_HUB_ONLY ?? "0";
    if (![ "0", "1" ].includes(value)) {
        throw new Error("DOCKGE_HUB_ONLY must be 0 or 1");
    }
    return value === "1";
}

export function requireLocalRuntime(): void {
    if (hubOnly()) {
        throw new Error("Hub-only mode: local Docker operations are disabled; select a linked instance");
    }
}

const HUB_LOCAL_RPC = new Set([
    "appCatalogList", "appCatalogDraft", "appCatalogSources", "appCatalogBrowse", "appCatalogSourceDraft",
]);

export function requireLocalRpc(event: string): void {
    if (!HUB_LOCAL_RPC.has(event)) {
        requireLocalRuntime();
    }
}
