/** A literal address only: never resolve DNS or use a container address. */
export function portLinkIpLiteral(value: unknown): string {
    if (typeof value !== "string") {
        return "";
    }
    const ip = value.trim();
    if (/^(?:0|[1-9]\d{0,2})(?:\.(?:0|[1-9]\d{0,2})){3}$/.test(ip)) {
        return ip.split(".").every(part => Number(part) <= 255) && ip !== "0.0.0.0" ? ip : "";
    }
    const bare = ip.startsWith("[") && ip.endsWith("]") ? ip.slice(1, -1) : ip;
    if (!bare.includes(":") || !/^[\da-f:.]+$/i.test(bare)) {
        return "";
    }
    try {
        const hostname = new URL(`http://[${bare}]/`).hostname;
        return hostname === "[::]" ? "" : hostname;
    } catch {
        return "";
    }
}

/** Validate only supplied fields, so older clients keep existing settings. */
export function validatePortLinkSettings(settings: { portLinkAddressMode?: unknown;
    portLinkIp?: unknown }): void {
    if (settings.portLinkAddressMode !== undefined && settings.portLinkAddressMode !== "hostname" && settings.portLinkAddressMode !== "ip") {
        throw new Error("portLinks.invalidMode");
    }
    if (settings.portLinkIp !== undefined) {
        if (typeof settings.portLinkIp !== "string" || (settings.portLinkIp.trim() && !portLinkIpLiteral(settings.portLinkIp))) {
            throw new Error("portLinks.invalidIp");
        }
        settings.portLinkIp = settings.portLinkIp.trim();
    }
}
