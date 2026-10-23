import assert from "node:assert/strict";
import test from "node:test";
import { portLinkIpLiteral, validatePortLinkSettings } from "./port-link-settings";
import { parseDockerPortLink, resolveEndpointHostname } from "./util-common";

test("IP mode uses the linked instance IP, never the central browser or its hostname", () => {
    for (const endpoint of [ "192.0.2.10:5001", "192.0.2.11:5001" ]) {
        const host = resolveEndpointHostname(endpoint, `http://${endpoint}`, "192.0.2.1", "http:", "unresolvable-name", "ip");
        assert.equal(parseDockerPortLink("55480:80", host, "ip").url, `http://${endpoint.split(":")[0]}:55480/`);
    }
});

test("local IP, explicit remote IP and IPv6 are supported", () => {
    assert.equal(resolveEndpointHostname("192.0.2.10:5001", "https://proxy.example", "192.0.2.1", "https:", "agent", "ip"), "192.0.2.10");
    assert.equal(resolveEndpointHostname("", undefined, "192.0.2.1", "http:", "local-name", "ip"), "192.0.2.1");
    const host = resolveEndpointHostname("agent.example:5001", "https://agent.example", "192.0.2.1", "https:", "agent", "ip", "2001:db8::2");
    assert.equal(parseDockerPortLink("8443:443", host, "ip").url, "http://[2001:db8::2]:8443/");
    assert.equal(resolveEndpointHostname("192.0.2.10:5001", undefined, "192.0.2.1", "http:", "", "ip", "192.0.2.20"), "192.0.2.20");
});

test("DNS-only linked instance has no misleading clickable IP link", () => {
    const host = resolveEndpointHostname("agent.example:5001", undefined, "192.0.2.1", "http:", "agent", "ip");
    assert.equal(host, "");
    assert.equal(parseDockerPortLink("8080:80", host, "ip").url, "");
    assert.equal(parseDockerPortLink("8080:80", host, "ip").display, "8080");
});

test("hostname mode and older agents preserve previous defaults", () => {
    assert.equal(resolveEndpointHostname("192.0.2.10:5001", undefined, "central", "http:", "service.example"), "service.example");
    assert.equal(resolveEndpointHostname("192.0.2.10:5001", undefined, "central"), "192.0.2.10");
    assert.equal(resolveEndpointHostname("", undefined, "browser.example"), "browser.example");
});

test("IP preference applies to long syntax without changing the published port or protocol", () => {
    assert.equal(parseDockerPortLink({ published: 8080,
        target: 80,
        host_ip: "0.0.0.0" }, "192.0.2.10", "ip").url, "http://192.0.2.10:8080/");
    assert.equal(parseDockerPortLink("443:443", "192.0.2.10", "ip").url, "https://192.0.2.10/");
    assert.equal(parseDockerPortLink({ target: 80 }, "192.0.2.10", "ip").url, "");
});

test("settings validation rejects URLs, DNS names, wildcard addresses and malformed IPs", () => {
    for (const ip of [ "host", "https://192.0.2.1", "192.0.2.1:80", "999.0.0.1", "0.0.0.0", "::", null, 42 ]) {
        assert.throws(() => validatePortLinkSettings({ portLinkIp: ip }));
    }
    assert.throws(() => validatePortLinkSettings({ portLinkAddressMode: "other" }));
    validatePortLinkSettings({});
    validatePortLinkSettings({ portLinkAddressMode: "hostname",
        portLinkIp: "" });
    validatePortLinkSettings({ portLinkAddressMode: "ip",
        portLinkIp: " 192.0.2.10 " });
    assert.equal(portLinkIpLiteral("[2001:db8::1]"), "[2001:db8::1]");
});
