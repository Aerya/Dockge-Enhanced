import assert from "node:assert/strict";
import test from "node:test";
import { parseDockerPort, resolveEndpointHostname } from "./util-common";

test("configured primary hostname overrides the browser domain for local port links (#538)", () => {
    const hostname = resolveEndpointHostname("", undefined, "dockge.example.test", "https:", "192.168.8.222");
    assert.equal(parseDockerPort("0.0.0.0:5000->5000/tcp", hostname).url, "http://192.168.8.222:5000");
});

test("linked instance primary hostname overrides its agent URL", () => {
    const hostname = resolveEndpointHostname("agent.example.test:5001", "https://agent.example.test", "main.example.test", "https:", "service.example.test");
    assert.equal(parseDockerPort("5000:5000", hostname).url, "http://service.example.test:5000");
});

test("missing or blank configuration preserves local and legacy agent fallbacks", () => {
    assert.equal(resolveEndpointHostname("", undefined, "browser.example.test", "https:", "  "), "browser.example.test");
    assert.equal(resolveEndpointHostname("agent.example.test:5001", undefined, "browser.example.test"), "agent.example.test");
    assert.equal(resolveEndpointHostname("agent.example.test:5001", "https://proxy.example.test", "browser.example.test", "https:", ""), "proxy.example.test");
});

test("configured IPv6 and explicit localhost remain valid port link hosts", () => {
    for (const configured of [ "2001:db8::1", "[2001:db8::1]" ]) {
        const hostname = resolveEndpointHostname("", undefined, "browser.example.test", "http:", configured);
        assert.equal(parseDockerPort("5000:5000", hostname).url, "http://[2001:db8::1]:5000");
    }
    assert.equal(resolveEndpointHostname("", undefined, "browser.example.test", "http:", " localhost "), "localhost");
});

test("builds published-port links with the stack instance hostname", () => {
    const hostname = resolveEndpointHostname("target.example.test:5001", "http://target.example.test:5001", "source.example.test", "http:");
    assert.equal(hostname, "target.example.test");
    assert.deepEqual(parseDockerPort("0.0.0.0:6462->8080/tcp", hostname), {
        url: "http://target.example.test:6462",
        display: "6462",
    });
});

test("keeps the browser hostname for the local instance", () => {
    assert.equal(resolveEndpointHostname("", undefined, "local.example.test", "https:"), "local.example.test");
});

test("keeps existing short port syntax behaviour", () => {
    const hostname = "example.test";

    assert.deepEqual(parseDockerPort("3000", hostname), {
        url: "http://example.test:3000",
        display: "3000",
    });

    assert.deepEqual(parseDockerPort("3000-3005", hostname), {
        url: "http://example.test:3000",
        display: "3000-3005",
    });

    assert.deepEqual(parseDockerPort("8000:8000", hostname), {
        url: "http://example.test:8000",
        display: "8000",
    });

    assert.deepEqual(parseDockerPort("9090-9091:8080-8081", hostname), {
        url: "http://example.test:9090",
        display: "9090-9091",
    });

    assert.deepEqual(parseDockerPort("127.0.0.1:8001:8001", hostname), {
        url: "http://127.0.0.1:8001",
        display: "127.0.0.1:8001",
    });

    assert.deepEqual(parseDockerPort("6060:6060/udp", hostname), {
        url: "udp://example.test:6060",
        display: "6060",
    });

    assert.deepEqual(parseDockerPort("443:443", hostname), {
        url: "https://example.test:443",
        display: "443",
    });
});

test("supports Compose long port syntax from dockge issue 998", () => {
    assert.deepEqual(
        parseDockerPort({
            mode: "ingress",
            protocol: "tcp",
            published: 30432,
            target: 30432,
        }, "example.test"),
        {
            url: "http://example.test:30432",
            display: "30432",
        }
    );
});

test("supports long syntax with published as string", () => {
    assert.deepEqual(
        parseDockerPort({
            protocol: "tcp",
            published: "8080",
            target: 80,
        }, "example.test"),
        {
            url: "http://example.test:8080",
            display: "8080",
        }
    );
});

test("supports long syntax UDP and IPv4 host_ip", () => {
    assert.deepEqual(
        parseDockerPort({
            protocol: "udp",
            published: 5353,
            target: 5353,
            host_ip: "127.0.0.1",
        }, "example.test"),
        {
            url: "udp://127.0.0.1:5353",
            display: "5353",
        }
    );
});

test("supports long syntax IPv6 host_ip", () => {
    assert.deepEqual(
        parseDockerPort({
            protocol: "tcp",
            published: 8080,
            target: 80,
            host_ip: "::1",
        }, "example.test"),
        {
            url: "http://[::1]:8080",
            display: "8080",
        }
    );
});

test("does not throw when long syntax has no published port", () => {
    assert.deepEqual(
        parseDockerPort({
            protocol: "tcp",
            target: 8080,
        }, "example.test"),
        {
            url: "",
            display: "8080",
        }
    );
});
