import test from "node:test";
import assert from "node:assert/strict";
import dns from "node:dns";
import { DEFAULT_REGISTRY_DNS, normalizeRegistryDnsSettings, registryDnsLookup } from "./registry-dns-fallback";

test("registry DNS fallback is disabled by default", () => {
    assert.equal(DEFAULT_REGISTRY_DNS.enabled, false);
    assert.ok(DEFAULT_REGISTRY_DNS.servers.some(server => server.includes(":")));
    assert.ok(DEFAULT_REGISTRY_DNS.servers.some(server => server.includes(".")));
});

test("validates and deduplicates configured DNS servers", () => {
    assert.deepEqual(normalizeRegistryDnsSettings({ enabled: true,
        servers: [ "1.1.1.1", "1.1.1.1", "2606:4700:4700::1111" ] }), {
        enabled: true,
        servers: [ "1.1.1.1", "2606:4700:4700::1111" ],
    });
    assert.throws(() => normalizeRegistryDnsSettings({ enabled: true,
        servers: [ "https://example.com" ] }));
    assert.throws(() => normalizeRegistryDnsSettings({ enabled: "yes",
        servers: [] }));
    assert.throws(() => normalizeRegistryDnsSettings({ enabled: true,
        servers: [ "127.0.0.1:53" ] }));
});

test("system resolver still handles literal loopback IPs", async () => {
    const lookup = registryDnsLookup({ enabled: true,
        servers: [ "1.1.1.1" ] });
    await new Promise<void>((resolve, reject) => {
        lookup("127.0.0.1", { family: 4 }, (error, address) => {
            if (error) {
                reject(error);
                return;
            }
            try {
                assert.equal(address, "127.0.0.1");
                resolve();
            } catch (err) {
                reject(err);
            }
        });
    });
});

// Deterministic DNS tests: no outbound network requests or host resolver changes.
function fakeSystemLookup(code: string | null, address = "192.0.2.10"): typeof dns.lookup {
    return ((_hostname: string, options: dns.LookupOptions, callback: (error: NodeJS.ErrnoException | null, addresses: string | dns.LookupAddress[], family?: number) => void) => {
        if (code) {
            const failure = Object.assign(new Error("system DNS failed"), { code });
            callback(failure, options.all ? [] : "", undefined);
        } else if (options.all) {
            callback(null, [ { address,
                family: 4 } ]);
        } else {
            callback(null, address, 4);
        }
    }) as typeof dns.lookup;
}

function query(
    lookup: typeof dns.lookup,
    all = false,
): Promise<{ error: NodeJS.ErrnoException | null;
    result: string | dns.LookupAddress[];
    family?: number }> {
    return new Promise(resolve => {
        const invoke = lookup as (hostname: string, options: dns.LookupOptions, callback: (error: NodeJS.ErrnoException | null, result: string | dns.LookupAddress[], family?: number) => void) => void;
        invoke("registry.example.test", { family: 0,
            all }, (error: NodeJS.ErrnoException | null, result: string | dns.LookupAddress[], family?: number) => {
            resolve({ error,
                result,
                family });
        });
    });
}

test("system DNS success remains authoritative; fallback is not called", async () => {
    let calls = 0;
    const lookup = registryDnsLookup({ enabled: true,
        servers: [ "1.1.1.1" ] }, fakeSystemLookup(null), async () => {
        calls += 1;
        return "198.51.100.2";
    });
    const result = await query(lookup);
    assert.equal(result.error, null);
    assert.equal(result.result, "192.0.2.10");
    assert.equal(calls, 0);
});

test("disabled fallback preserves the original system DNS error", async () => {
    let calls = 0;
    const lookup = registryDnsLookup({ enabled: false,
        servers: [ "1.1.1.1" ] }, fakeSystemLookup("ENOTFOUND"), async () => {
        calls += 1;
        return "198.51.100.2";
    });
    const result = await query(lookup);
    assert.equal(result.error?.code, "ENOTFOUND");
    assert.equal(calls, 0);
});

test("DNS errors trigger fallback and preserve all:true lookup contract", async () => {
    const seen: Array<4 | 6> = [];
    const lookup = registryDnsLookup({ enabled: true,
        servers: [ "1.1.1.1", "2606:4700:4700::1111" ] }, fakeSystemLookup("EAI_AGAIN"), async (_hostname, family) => {
        seen.push(family);
        return "198.51.100.9";
    });
    const result = await query(lookup, true);
    assert.equal(result.error, null);
    assert.deepEqual(result.result, [ { address: "198.51.100.9",
        family: 4 } ]);
    assert.deepEqual(seen, [ 4 ]);
});

test("non-DNS errors never trigger fallback", async () => {
    let calls = 0;
    const lookup = registryDnsLookup({ enabled: true,
        servers: [ "1.1.1.1" ] }, fakeSystemLookup("ECONNREFUSED"), async () => {
        calls += 1;
        return "198.51.100.2";
    });
    const result = await query(lookup);
    assert.equal(result.error?.code, "ECONNREFUSED");
    assert.equal(calls, 0);
});

test("fallback tries IPv6 when IPv4 fallback fails", async () => {
    const seen: Array<4 | 6> = [];
    const lookup = registryDnsLookup({ enabled: true,
        servers: [ "2001:4860:4860::8888" ] }, fakeSystemLookup("ENOTFOUND"), async (_hostname, family) => {
        seen.push(family);
        if (family === 4) {
            throw new Error("no IPv4 answer");
        }
        return "2001:db8::10";
    });
    const result = await query(lookup);
    assert.equal(result.error, null);
    assert.equal(result.result, "2001:db8::10");
    assert.equal(result.family, 6);
    assert.deepEqual(seen, [ 4, 6 ]);
});

test("when all fallback resolvers fail, original DNS failure is retained", async () => {
    const lookup = registryDnsLookup({ enabled: true,
        servers: [ "1.1.1.1" ] }, fakeSystemLookup("EAI_AGAIN"), async () => {
        throw new Error("fallback timed out");
    });
    const result = await query(lookup);
    assert.equal(result.error?.code, "EAI_AGAIN");
});

test("rejects more than twelve DNS servers", () => {
    assert.throws(() => normalizeRegistryDnsSettings({ enabled: true,
        servers: Array(13).fill("1.1.1.1") }));
});
