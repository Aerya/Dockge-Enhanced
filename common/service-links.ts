export interface ServiceLink {
    id: string;
    name: string;
    url: string;
    group: string;
    enabled: boolean;
}
export interface ServiceLinksConfig {
    revision: number;
    links: ServiceLink[];
    showStackLinks: boolean;
}
export const defaultServiceLinks = (): ServiceLinksConfig => ({ revision: 0,
    links: [],
    showStackLinks: true });

export function safeServiceUrl(value: unknown): string | null {
    if (typeof value !== "string" || value.length > 2048 || /[\u0000-\u0020\u007f]/.test(value)) {
        return null;
    }
    try {
        const url = new URL(value);
        return [ "http:", "https:" ].includes(url.protocol) && !url.username && !url.password ? url.href : null;
    } catch {
        return null;
    }
}

export function validateServiceLinks(value: unknown): ServiceLinksConfig {
    const data = value as Partial<ServiceLinksConfig>;
    if (!data || !Number.isSafeInteger(data.revision) || data.revision! < 0 || !Array.isArray(data.links) || data.links.length > 200 || typeof data.showStackLinks !== "boolean") {
        throw new Error("serviceLinks.invalid");
    }
    const ids = new Set<string>();
    const links = data.links.map(link => {
        const url = safeServiceUrl(link?.url);
        if (!link || typeof link.id !== "string" || !/^[a-zA-Z0-9_-]{1,100}$/.test(link.id) || ids.has(link.id) || typeof link.name !== "string" || !link.name.trim() || link.name.length > 100 || typeof link.group !== "string" || link.group.length > 100 || typeof link.enabled !== "boolean" || !url) {
            throw new Error("serviceLinks.invalid");
        }
        ids.add(link.id);
        return { id: link.id,
            name: link.name.trim(),
            url,
            group: link.group.trim(),
            enabled: link.enabled };
    });
    return { revision: data.revision!,
        links,
        showStackLinks: data.showStackLinks };
}

/** Read only the explicitly declared URLs, never service environments or labels. */
export function composeServiceUrls(value: unknown): string[] {
    const document = value as { "x-dockge"?: { urls?: unknown } } | null;
    const urls = document?.["x-dockge"]?.urls;
    return Array.isArray(urls) ? [ ...new Set(urls.slice(0, 100).map(safeServiceUrl).filter((url): url is string => url !== null)) ] : [];
}
