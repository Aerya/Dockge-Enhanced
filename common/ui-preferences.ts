export const NAVIGATION_ITEMS = [
    { id: "services",
        label: "serviceLinks.title" },
    { id: "apps",
        label: "appCatalog.title" },
    { id: "topology",
        label: "topology.title" },
    { id: "console",
        label: "console" },
    { id: "external",
        label: "externalStacks.nav" },
    { id: "files",
        label: "files" },
    { id: "search",
        label: "globalSearch.open" },
] as const;
export const CATALOG_IDS = [ "lissy93", "portainer", "pi-amd64", "pi-arm64", "linuxserver", "truenas", "umbrel", "runtipi", "roqueos", "yundera" ];
export interface UiPreferences {
    hiddenNavigation: string[];
    disabledCatalogSources: string[];
}
export const defaultUiPreferences = (): UiPreferences => ({ hiddenNavigation: [],
    disabledCatalogSources: [] });
export function validateUiPreferences(value: unknown): UiPreferences {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new Error("uiPreferences.invalid");
    }
    const input = value as UiPreferences;
    const check = (list: unknown, allowed: readonly string[]): list is string[] =>
        Array.isArray(list) && list.length <= allowed.length && new Set(list).size === list.length
        && list.every(id => typeof id === "string" && allowed.includes(id));
    if (Object.keys(input).length !== 2 || !check(input.hiddenNavigation, NAVIGATION_ITEMS.map(item => item.id))
        || !check(input.disabledCatalogSources, CATALOG_IDS)) {
        throw new Error("uiPreferences.invalid");
    }
    return { hiddenNavigation: [ ...input.hiddenNavigation ],
        disabledCatalogSources: [ ...input.disabledCatalogSources ] };
}
