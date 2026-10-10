/** Optional, application-scoped DNS fallback for registry HTTP requests only. */
import dns from "node:dns";
import { isIP } from "node:net";
import https from "node:https";
import http from "node:http";
import type { AxiosRequestConfig } from "axios";
import { Settings } from "./settings";
import { log } from "./log";

export interface RegistryDnsSettings {
    enabled: boolean;
    servers: string[];
}
export const DEFAULT_REGISTRY_DNS: RegistryDnsSettings = {
    enabled: false,
    servers: [ "9.9.9.9", "1.1.1.1", "2620:fe::fe", "2606:4700:4700::1111" ],
};
const KEY = "registryDnsFallback";
const DNS_CODES = new Set([ "ENOTFOUND", "EAI_AGAIN", "ETIMEOUT", "ESERVFAIL", "EREFUSED", "ENODATA", "ENOTIMP" ]);

export function normalizeRegistryDnsSettings(value: unknown): RegistryDnsSettings {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
        throw new Error("Invalid registry DNS settings");
    }
    const input = value as Partial<RegistryDnsSettings>;
    if (typeof input.enabled !== "boolean" || !Array.isArray(input.servers) || input.servers.length > 12) {
        throw new Error("Invalid registry DNS settings");
    }
    if (!input.servers.every(s => typeof s === "string" && isIP(s) !== 0)) {
        throw new Error("DNS servers must be IPv4 or IPv6 addresses");
    }
    return { enabled: input.enabled,
        servers: [ ...new Set(input.servers) ] };
}

export async function getRegistryDnsSettings(): Promise<RegistryDnsSettings> {
    const stored = await Settings.get(KEY);
    return stored == null ? { ...DEFAULT_REGISTRY_DNS,
        servers: [ ...DEFAULT_REGISTRY_DNS.servers ] } : normalizeRegistryDnsSettings(stored);
}

export async function saveRegistryDnsSettings(value: unknown): Promise<RegistryDnsSettings> {
    const settings = normalizeRegistryDnsSettings(value);
    await Settings.set(KEY, settings);
    return settings;
}

export async function resolveRegistryDns(hostname: string, family: 4 | 6, servers: string[]): Promise<string> {
    let lastError: unknown;
    for (const server of servers) {
        const resolver = new dns.promises.Resolver({ timeout: 2000,
            tries: 1 });
        resolver.setServers([ server ]);
        try {
            const result = family === 6 ? await resolver.resolve6(hostname) : await resolver.resolve4(hostname);
            if (result.length) {
                log.info("registry-dns", `Fallback DNS ${server} resolved ${hostname} (${family === 4 ? "IPv4" : "IPv6"})`);
                return result[0];
            }
        } catch (error) {
            lastError = error;
            log.warn("registry-dns", `Fallback DNS ${server} failed for ${hostname}: ${(error as Error).message}`);
        }
    }
    throw lastError ?? new Error(`All DNS fallbacks failed for ${hostname}`);
}

export function registryDnsLookup(
    settings: RegistryDnsSettings,
    systemLookup: typeof dns.lookup = dns.lookup,
    fallbackResolve: typeof resolveRegistryDns = resolveRegistryDns,
): typeof dns.lookup {
    // Node 22's HTTP Agent may request all addresses; preserve that lookup contract.
    const lookup = (hostname: string, options: dns.LookupOptions & { all?: boolean }, callback: (error: NodeJS.ErrnoException | null, address: string | dns.LookupAddress[], family?: number) => void) => {
        systemLookup(hostname, options, (error: NodeJS.ErrnoException | null, addresses: string | dns.LookupAddress[], family?: number) => {
            if (!error || !settings.enabled || !DNS_CODES.has(error.code ?? "") || isIP(hostname)) {
                callback(error, addresses, family);
                return;
            }
            log.warn("registry-dns", `System DNS failed for ${hostname} (${error.code}); attempting configured fallback`);
            const families: Array<4 | 6> = options.family === 6 ? [ 6 ] : options.family === 4 ? [ 4 ] : [ 4, 6 ];
            (async () => {
                let lastError: unknown;
                for (const requested of families) {
                    try {
                        const address = await fallbackResolve(hostname, requested, settings.servers);
                        return { address,
                            family: requested };
                    } catch (err) {
                        lastError = err;
                    }
                }
                throw lastError;
            })().then(
                result => options.all ? callback(null, [ result ]) : callback(null, result.address, result.family),
                fallbackError => {
                    log.error("registry-dns", `DNS fallback exhausted for ${hostname}: ${String(fallbackError)}`);
                    callback(error, addresses, family);
                },
            );
        });
    };
    return lookup as typeof dns.lookup;
}

/** No global DNS changes and no Engine options: only these Axios HTTP(S) requests. */
export async function registryDnsAxiosOptions(): Promise<Pick<AxiosRequestConfig, "httpAgent" | "httpsAgent">> {
    const settings = await getRegistryDnsSettings();
    if (!settings.enabled || !settings.servers.length) {
        return {};
    }
    const lookup = registryDnsLookup(settings);
    return { httpAgent: new http.Agent({ lookup }),
        httpsAgent: new https.Agent({ lookup }) };
}

export interface RegistryDnsProbe {
    type: "A" | "AAAA";
    durationMs: number;
    address?: string;
    errorCode?: string;
}

export interface RegistryDnsTestResult {
    server: string;
    family: number;
    results: RegistryDnsProbe[];
}

/** Diagnostic only: A and AAAA queries over EACH configured resolver, no host DNS changes. */
export async function testRegistryDns(hostname: string): Promise<RegistryDnsTestResult[]> {
    if (!/^[a-z0-9.-]+$/i.test(hostname) || hostname.length > 253 || hostname.includes("..")) {
        throw new Error("Invalid test hostname");
    }
    const { servers } = await getRegistryDnsSettings();
    return Promise.all(servers.map(async server => {
        const resolver = new dns.promises.Resolver({ timeout: 2000,
            tries: 1 });
        resolver.setServers([ server ]);
        const probe = async (type: "A" | "AAAA"): Promise<RegistryDnsProbe> => {
            const start = performance.now();
            try {
                const records = type === "A" ? await resolver.resolve4(hostname) : await resolver.resolve6(hostname);
                if (!records.length) {
                    return { type,
                        durationMs: Math.round(performance.now() - start),
                        errorCode: "ENODATA" };
                }
                return { type,
                    durationMs: Math.round(performance.now() - start),
                    address: records[0] };
            } catch (error) {
                const code = (error as NodeJS.ErrnoException).code;
                return { type,
                    durationMs: Math.round(performance.now() - start),
                    errorCode: code ?? "EUNKNOWN" };
            }
        };
        const results = await Promise.all([ probe("A"), probe("AAAA") ]);
        return { server,
            family: isIP(server),
            results };
    }));
}
