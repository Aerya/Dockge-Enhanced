import assert from "node:assert/strict";
import { test } from "node:test";
import { parseDocument } from "yaml";
import { buildServiceHealthcheck, proposeServiceHealthcheck } from "./service-healthcheck";

test("proposes the container port and HTTP URL, not the published host port", () => {
    assert.deepEqual(proposeServiceHealthcheck({ ports: [ "127.0.0.1:7879:8080" ] }), {
        method: "http",
        target: "http://127.0.0.1:8080/",
        candidates: [ 8080 ],
        ambiguous: false,
    });
});

test("prefers a unique HTTP port, handles long syntax and HTTPS", () => {
    assert.deepEqual(proposeServiceHealthcheck({ ports: [{ target: 443,
        published: 8443 }, "9001:9001" ] }), {
        method: "http",
        target: "https://127.0.0.1:443/",
        candidates: [ 443, 9001 ],
        ambiguous: false,
    });
});

test("does not guess among ambiguous or non-TCP ports", () => {
    assert.deepEqual(proposeServiceHealthcheck({ ports: [ "8000:8000", "8080:8080", "53:53/udp" ] }), {
        method: "tcp",
        target: "",
        candidates: [ 8000, 8080 ],
        ambiguous: true,
    });
    assert.equal(proposeServiceHealthcheck({ ports: [ "53:53/udp" ] }), null);
});

test("generates an opt-in HTTP check with a quoted local URL", () => {
    const check = buildServiceHealthcheck("http", "http://127.0.0.1:8080/health?value=it's-ok&price=$5");
    assert.equal(check.test[0], "CMD-SHELL");
    assert.match(check.test[1], /curl -fsS/);
    assert.match(check.test[1], /wget -q/);
    assert.match(check.test[1], /value=it%27s-ok/);
    assert.doesNotMatch(check.test[1], /value=it's-ok/);
    assert.match(check.test[1], /price=\$\$5/);
    assert.equal(check.interval, "30s");
});

test("rejects remote URLs, shell injection and invalid TCP ports", () => {
    assert.throws(() => buildServiceHealthcheck("http", "http://example.com/"), /invalidUrl/);
    assert.throws(() => buildServiceHealthcheck("http", "file:///etc/passwd"), /invalidUrl/);
    assert.throws(() => buildServiceHealthcheck("tcp", "8080; exit 0"), /invalidPort/);
    assert.throws(() => buildServiceHealthcheck("tcp", "65536"), /invalidPort/);
    assert.match(buildServiceHealthcheck("tcp", "8080").test[1], /nc -z -w 5 127\.0\.0\.1 8080/);
});

test("Compose serialization keeps existing service labels, ports and other services", () => {
    const doc = parseDocument("services:\n  web:\n    image: busybox:stable\n    labels:\n      app.example: kept\n    ports:\n      - \"18080:8080\"\n  worker:\n    image: busybox:stable\n");
    doc.setIn([ "services", "web", "healthcheck" ], buildServiceHealthcheck("http", "http://127.0.0.1:8080/"));
    const parsed = parseDocument(doc.toString()).toJS() as { services: Record<string, { labels?: Record<string, string>;
        ports?: string[];
        healthcheck?: { test: string[] } }> };
    assert.equal(parsed.services.web.labels?.["app.example"], "kept");
    assert.deepEqual(parsed.services.web.ports, [ "18080:8080" ]);
    assert.equal(parsed.services.web.healthcheck?.test[0], "CMD-SHELL");
    assert.equal(parsed.services.worker.healthcheck, undefined);
});
