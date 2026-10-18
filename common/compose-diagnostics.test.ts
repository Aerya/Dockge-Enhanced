import test from "node:test";
import assert from "node:assert/strict";
import { findPortConflicts, findImageDrift, modelPorts, PublishedPort } from "./compose-diagnostics";
import { prepareImageSync } from "../frontend/src/compose-drift";
import { parse } from "yaml";

const port = (published: string, protocol = "tcp", host = ""): PublishedPort => ({ owner: "fixture",
    service: "web",
    published,
    protocol,
    host });

test("ports: ranges overlap; ephemeral and invalid ports do not conflict", () => {
    assert.equal(findPortConflicts([ port("8000-8010") ], [ port("8005") ]).length, 1);
    for (const value of [ "0", "bad", "70000", "9000-8000" ]) {
        assert.deepEqual(findPortConflicts([ port(value) ], [ port("8005") ]), []);
    }
});

test("ports: protocol and explicit host binding are distinct, wildcards conflict", () => {
    assert.equal(findPortConflicts([ port("80", "tcp", "127.0.0.1") ], [ port("80", "udp") ]).length, 0);
    assert.equal(findPortConflicts([ port("80", "tcp", "127.0.0.1") ], [ port("80", "tcp", "127.0.0.2") ]).length, 0);
    assert.equal(findPortConflicts([ port("80", "tcp", "127.0.0.1") ], [ port("80", "tcp", "::") ]).length, 1);
});

test("resolved Compose long syntax keeps ownership and protocols", () => {
    assert.deepEqual(modelPorts({ services: { web: { ports: [{ published: "8080-8082",
        protocol: "udp",
        host_ip: "127.0.0.1" }] } } }, "demo"),
    [{ owner: "demo",
        service: "web",
        published: "8080-8082",
        protocol: "udp",
        host: "127.0.0.1" }]);
});

test("drift: equivalent default tags do not cause drift; digest is not invented", () => {
    assert.deepEqual(findImageDrift({ services: { web: { image: "nginx" } } }, [{ service: "web",
        image: "docker.io/library/nginx:latest" }]), []);
    const result = findImageDrift({ services: { web: { image: "nginx:1" } } }, [{ service: "web",
        image: "nginx:2" }, { service: "web",
        image: "nginx:1" }]);
    assert.equal(result.length, 1);
    assert.deepEqual(result[0].running, [ "nginx:2", "nginx:1" ]);
});

test("drift: stopped/missing services and build-only services are not invented", () => {
    assert.deepEqual(findImageDrift({ services: { web: { image: "nginx:1" },
        builder: {} } }, []), []);
});

test("sync preserves comments, labels, volumes and unrelated services", () => {
    const source = "services:\n  web:\n    image: nginx:1 # pinned\n    volumes: [data:/data]\n    labels: {custom: keep}\n  db:\n    image: postgres:16\nvolumes:\n  data: {}\n";
    const changed = prepareImageSync(source, "web", "nginx:2");
    assert.match(changed, /# pinned/);
    const expected = parse(source);
    expected.services.web.image = "nginx:2";
    assert.deepEqual(parse(changed), expected);
});

test("sync refuses interpolated images, aliases and missing explicit image keys", () => {
    for (const source of [
        "services:\n  web:\n    image: nginx:${TAG}\n",
        "x-image: &img nginx:1\nservices:\n  web:\n    image: *img\n",
        "services:\n  web:\n    image: &img nginx:1\n  other:\n    image: *img\n",
        "services:\n  web:\n    build: .\n",
    ]) {
        assert.throws(() => prepareImageSync(source, "web", "nginx:2"));
    }
});
