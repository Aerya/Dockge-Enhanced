import test from "node:test";
import assert from "node:assert/strict";
import { topologyPortUrl, topologyRoute } from "./topology";
import type { TopologySnapshot, TopologyContainer } from "../../common/docker-topology";
const snapshot: TopologySnapshot = { capturedAt: "",
    containers: [],
    networks: [],
    unavailable: 0,
    primaryHostname: "",
    portLinkAddressMode: "hostname",
    portLinkIp: "" };
const port = { address: "0.0.0.0",
    published: 8080,
    target: 80,
    protocol: "tcp" };
test("port links use the owning instance, IP preference, IPv6 and refuse UDP or loopback", () => {
    assert.equal(topologyPortUrl(port, snapshot, "remote:5001", "https://remote.example", "central.example", "https:"), "http://remote.example:8080/");
    assert.equal(topologyPortUrl(port, { ...snapshot,
        portLinkAddressMode: "ip",
        portLinkIp: "192.0.2.10" }, "remote:5001", undefined, "central.example", "http:"), "http://192.0.2.10:8080/");
    assert.equal(topologyPortUrl(port, { ...snapshot,
        portLinkAddressMode: "ip" }, "remote:5001", undefined, "192.0.2.1", "http:"), "");
    assert.equal(topologyPortUrl({ ...port,
        published: 443 }, snapshot, "[2001:db8::1]:5001", undefined, "central", "http:"), "https://[2001:db8::1]/");
    for (const p of [{ ...port,
        protocol: "udp" }, { ...port,
        address: "127.0.0.1" }, { ...port,
        address: "::1" }, { ...port,
        address: "0:0:0:0:0:0:0:1" }, { ...port,
        published: 0 }]) {
        assert.equal(topologyPortUrl(p, snapshot, "", undefined, "central", "http:"), "");
    }
});
test("stack and container navigation preserve remote identity and do not invent unmanaged routes", () => {
    const c = { stack: "demo",
        id: "abcdef" } as TopologyContainer;
    assert.equal(topologyRoute(c, "remote:5001"), "/compose/demo/remote%3A5001");
    assert.equal(topologyRoute(c, "remote:5001", true), "/container/demo/abcdef/remote%3A5001");
    assert.equal(topologyRoute({ ...c,
        stack: "" }, ""), null);
});
