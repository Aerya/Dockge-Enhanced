export type HealthcheckMethod = "http" | "tcp";

export interface HealthcheckProposal {
    method: HealthcheckMethod;
    target: string;
    candidates: number[];
    ambiguous: boolean;
}

type ServicePorts = {
    ports?: unknown;
    expose?: unknown;
};

const HTTP_PORTS = new Set([ 80, 443, 3000, 5000, 5001, 8000, 8001, 8080, 8081, 8443, 9000 ]);
const HTTPS_PORTS = new Set([ 443, 8443 ]);

function validPort(value: unknown): number | null {
    const port = Number(value);
    return Number.isInteger(port) && port >= 1 && port <= 65535 ? port : null;
}

function exposedPort(value: unknown): number | null {
    if (typeof value === "number") {
        return validPort(value);
    }
    if (typeof value === "string") {
        // Short syntax: [host IP:]published:target[/protocol], or target[/protocol].
        const match = value.match(/^(?:.*:)?(\d+)(?:\/(tcp|udp))?$/i);
        return match && (!match[2] || match[2].toLowerCase() === "tcp") ? validPort(match[1]) : null;
    }
    if (value && typeof value === "object" && !Array.isArray(value)) {
        const entry = value as { target?: unknown;
            protocol?: unknown };
        return !entry.protocol || entry.protocol === "tcp" ? validPort(entry.target) : null;
    }
    return null;
}

export function proposeServiceHealthcheck(service: ServicePorts): HealthcheckProposal | null {
    const entries = [ ...(Array.isArray(service.ports) ? service.ports : []), ...(Array.isArray(service.expose) ? service.expose : []) ];
    const candidates = [ ...new Set(entries.map(exposedPort).filter((port): port is number => port !== null)) ];
    const httpCandidates = candidates.filter((port) => HTTP_PORTS.has(port));
    const preferred = httpCandidates.length === 1 ? httpCandidates[0] : candidates.length === 1 ? candidates[0] : null;
    if (preferred === null) {
        return candidates.length ? { method: "tcp",
            target: "",
            candidates,
            ambiguous: true } : null;
    }
    if (HTTP_PORTS.has(preferred)) {
        const scheme = HTTPS_PORTS.has(preferred) ? "https" : "http";
        return { method: "http",
            target: `${scheme}://127.0.0.1:${preferred}/`,
            candidates,
            ambiguous: false };
    }
    return { method: "tcp",
        target: String(preferred),
        candidates,
        ambiguous: false };
}

function shellQuote(value: string): string {
    // Compose interpolates $ even inside a shell-quoted YAML value.
    return `'${value.replaceAll("$", () => "$$").replaceAll("'", "'\\''")}'`;
}

export function buildServiceHealthcheck(method: HealthcheckMethod, target: string): { test: ["CMD-SHELL", string];
    interval: string;
    timeout: string;
    retries: number;
    start_period: string } {
    let command: string;
    if (method === "http") {
        let url: URL;
        try {
            url = new URL(target);
        } catch {
            throw new Error("invalidUrl");
        }
        if (!([ "http:", "https:" ].includes(url.protocol)) || ![ "127.0.0.1", "localhost", "[::1]" ].includes(url.hostname) || url.username || url.password) {
            throw new Error("invalidUrl");
        }
        const quotedUrl = shellQuote(url.toString());
        command = `if command -v curl >/dev/null 2>&1; then curl -fsS --max-time 5 ${quotedUrl} >/dev/null; elif command -v wget >/dev/null 2>&1; then wget -q -T 5 -O /dev/null ${quotedUrl}; else exit 1; fi`;
    } else {
        const port = validPort(target);
        if (port === null) {
            throw new Error("invalidPort");
        }
        command = `command -v nc >/dev/null 2>&1 && nc -z -w 5 127.0.0.1 ${port}`;
    }
    return {
        test: [ "CMD-SHELL", command ],
        interval: "30s",
        timeout: "7s",
        retries: 3,
        start_period: "30s",
    };
}
