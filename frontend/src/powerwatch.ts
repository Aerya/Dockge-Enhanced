export interface PowerWatchFrontendSnapshot {
    enabled?: boolean;
    mode?: "managed" | "external";
    reachable?: boolean;
    totalWatts?: number | null;
    confidence?: "Measured" | "Estimated" | null;
    timestamp?: string | null;
    webUrl?: string | null;
    status?: "disabled" | "online" | "stopped" | "offline";
}

export function formatPowerWatts(value: unknown, locale = "en"): string {
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
        return "—";
    }
    if (value >= 1000) {
        return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(value / 1000)} kW`;
    }
    return `${new Intl.NumberFormat(locale, { minimumFractionDigits: 0,
        maximumFractionDigits: 1 }).format(value)} W`;
}

export function resolvePowerWatchWebUrl(
    webUrl: string | null | undefined,
    browserHostname: string,
    agentUrl = "",
): string | null {
    if (!webUrl) {
        return null;
    }
    let parsed: URL;
    try {
        parsed = new URL(webUrl);
    } catch {
        return null;
    }
    if (![ "http:", "https:" ].includes(parsed.protocol) || parsed.username || parsed.password) {
        return null;
    }
    const loopback = [ "localhost", "127.0.0.1", "0.0.0.0", "::1", "[::1]" ].includes(parsed.hostname);
    if (loopback) {
        let replacement = browserHostname;
        if (agentUrl) {
            try {
                replacement = new URL(agentUrl).hostname;
            } catch {
                return null;
            }
        }
        if (replacement.includes(":") && !replacement.startsWith("[")) {
            replacement = `[${replacement}]`;
        }
        parsed.hostname = replacement;
    }
    return parsed.toString().replace(/\/$/, "");
}
