import test from "node:test";
import assert from "node:assert/strict";
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
