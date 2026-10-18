export interface StackURL {
    url: string;
    label?: string;
}

/** Read both legacy URL strings and labelled links without changing the Compose. */
export function stackURLValue(value: unknown): StackURL | null {
    if (typeof value === "string") {
        return { url: value };
    }
    if (value && typeof value === "object" && !Array.isArray(value)) {
        const item = value as Record<string, unknown>;
        if (typeof item.url === "string" && (item.label === undefined || typeof item.label === "string")) {
            return { url: item.url,
                label: item.label as string | undefined };
        }
    }
    return null;
}

/** Only web links may be opened from a Compose file. */
export function stackURLLinks(values: unknown): { url: string;
    display: string }[] {
    if (!Array.isArray(values)) {
        return [];
    }
    return values.flatMap(value => {
        const item = stackURLValue(value);
        if (!item) {
            return [];
        }
        try {
            const parsed = new URL(item.url);
            if (![ "http:", "https:" ].includes(parsed.protocol)) {
                return [];
            }
            return [{
                url: parsed.href,
                display: item.label?.trim() || parsed.host + (parsed.pathname === "/" ? "" : parsed.pathname) + parsed.search + parsed.hash,
            }];
        } catch {
            return [];
        }
    });
}
