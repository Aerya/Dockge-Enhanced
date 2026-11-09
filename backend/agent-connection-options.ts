import type { ManagerOptions, SocketOptions } from "socket.io-client";

export interface AgentConnectionOptions {
    oneWay: boolean;
    proxyUsername: string;
    proxyPassword: string;
}

export function agentConnectionOptions(url: string, value: unknown): AgentConnectionOptions {
    if (value === undefined || value === null || value === "") {
        return { oneWay: false,
            proxyUsername: "",
            proxyPassword: "" };
    }
    let parsedValue: unknown = value;
    if (typeof value === "string") {
        try {
            parsedValue = JSON.parse(value);
        } catch {
            // Do not expose malformed serialized credentials in JSON errors.
            parsedValue = null;
        }
    }
    const raw = parsedValue as Record<string, unknown> | null;
    if (!raw || typeof raw !== "object" || Array.isArray(raw)
        || typeof raw.oneWay !== "boolean"
        || typeof raw.proxyUsername !== "string" || typeof raw.proxyPassword !== "string") {
        throw new Error("Invalid agent connection options");
    }
    const { oneWay, proxyUsername, proxyPassword } = raw;
    if (proxyUsername.length > 256 || proxyPassword.length > 4096
        || /[:\r\n]/.test(proxyUsername) || /[\r\n]/.test(proxyPassword)
        || Boolean(proxyUsername) !== Boolean(proxyPassword)) {
        throw new Error("Invalid proxy credentials");
    }
    if (proxyUsername) {
        const parsed = new URL(url);
        if (parsed.protocol !== "https:" || parsed.username || parsed.password
            || parsed.search || parsed.hash || ![ "", "/" ].includes(parsed.pathname) || !oneWay) {
            throw new Error("Proxy authentication requires an HTTPS origin and a one-way connection");
        }
    }
    return { oneWay,
        proxyUsername,
        proxyPassword };
}

/** Never follow redirects carrying credentials, or share proxy secrets in the mesh. */
export function agentTransportOptions(url: string, value?: unknown): Partial<ManagerOptions & SocketOptions> & {
    transportOptions?: { websocket: { followRedirects: boolean;
        maxRedirects: number } };
} {
    const options = agentConnectionOptions(url, value);
    return options.proxyUsername ? {
        transports: [ "websocket" ],
        transportOptions: { websocket: { followRedirects: false,
            maxRedirects: 0 } },
        extraHeaders: {
            endpoint: new URL(url).host,
            Authorization: `Basic ${Buffer.from(`${options.proxyUsername}:${options.proxyPassword}`).toString("base64")}`,
        },
    } : { extraHeaders: { endpoint: new URL(url).host } };
}
