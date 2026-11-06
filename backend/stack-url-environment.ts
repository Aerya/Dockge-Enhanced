import { parse } from "yaml";
import { stackURLLinks, type StackURL } from "../common/stack-urls";

/** Resolve on the hosting instance; return only validated links, never the environment/configuration. */
export async function resolvedStackUrls(compose: string, loadResolvedCompose: () => Promise<string>, hasOverrides = false): Promise<{ links: StackURL[];
    unavailable: boolean }> {
    try {
        const raw = parse(compose)?.["x-dockge"]?.urls;
        if ((!Array.isArray(raw) || raw.length === 0) && !hasOverrides) {
            return { links: [],
                unavailable: false };
        }
        const values = hasOverrides || JSON.stringify(raw ?? []).includes("$")
            ? parse(await loadResolvedCompose())?.["x-dockge"]?.urls : raw;
        return { links: stackURLLinks(values).map(link => ({ url: link.url,
            label: link.display })),
        unavailable: false };
    } catch {
        // Compose errors may contain secrets or full substituted configuration.
        return { links: [],
            unavailable: true };
    }
}
