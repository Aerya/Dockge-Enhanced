import assert from "node:assert/strict";
import test from "node:test";
import { parseDockerPort, resolveEndpointHostname } from "./util-common";

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
