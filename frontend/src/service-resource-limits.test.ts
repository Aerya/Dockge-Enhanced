import assert from "node:assert/strict";
import { test } from "node:test";
import { parse, stringify } from "yaml";
import { applyResourceLimits, readResourceLimits } from "./service-resource-limits";

test("no defaults and no mutation until explicitly applied", () => {
    const service = { image: "busybox:stable" };
    assert.deepEqual(readResourceLimits(service), { cpu: "",
        memory: "" });
    assert.equal(applyResourceLimits(service, { cpu: "",
        memory: "" }), service);
    const result = applyResourceLimits(service, { cpu: "0.5",
        memory: "512M" });
    assert.deepEqual(result, { image: "busybox:stable",
        deploy: { resources: { limits: { cpus: "0.5",
            memory: "512M" } } } });
    assert.deepEqual(service, { image: "busybox:stable" });
});

test("round-trip preserves labels, reservations, replicas, GPU devices and other services", () => {
    const compose = parse(`services:
  web:
    image: busybox:stable
    labels: {dockge.status.ignore: "true"}
    deploy:
      replicas: 2
      resources:
        limits: {pids: 100}
        reservations:
          memory: 32M
          devices: [{capabilities: [gpu]}]
  db: {image: busybox:stable}
`);
    const original = structuredClone(compose);
    compose.services.web = applyResourceLimits(compose.services.web, { cpu: "1.25",
        memory: "1G" });
    const saved = parse(stringify(compose));
    assert.deepEqual(saved.services.db, original.services.db);
    assert.deepEqual(saved.services.web.labels, original.services.web.labels);
    assert.equal(saved.services.web.deploy.replicas, 2);
    assert.deepEqual(saved.services.web.deploy.resources.reservations, original.services.web.deploy.resources.reservations);
    assert.equal(saved.services.web.deploy.resources.limits.pids, 100);
});

test("existing aliases stay consistent; removal only clears CPU/RAM, not reservations", () => {
    const service = { cpus: 1,
        mem_limit: "1G",
        deploy: { resources: { limits: { cpus: "1",
            memory: "1G",
            pids: 10 },
        reservations: { memory: "64M" } } } };
    const changed = applyResourceLimits(service, { cpu: "0.5",
        memory: "256M" });
    assert.equal(changed.cpus, 0.5);
    assert.equal(changed.mem_limit, "256M");
    const removed = applyResourceLimits(changed, { cpu: "",
        memory: "" });
    assert.ok(!Object.hasOwn(removed, "cpus") && !Object.hasOwn(removed, "mem_limit"));
    assert.deepEqual(removed.deploy, { resources: { limits: { pids: 10 },
        reservations: { memory: "64M" } } });
    assert.deepEqual(applyResourceLimits({ cpus: 1 }, { cpu: "",
        memory: "" }), {});
});

test("untouched interpolated values and other settings remain exact", () => {
    const service = { cpus: "${CPU_LIMIT}",
        mem_limit: "${MEM_LIMIT:-512M}",
        cpu_shares: 512 };
    assert.equal(applyResourceLimits(service, readResourceLimits(service)), service);
    assert.deepEqual(applyResourceLimits(service, { cpu: "0.5",
        memory: "${MEM_LIMIT:-512M}" }), {
        cpus: 0.5,
        mem_limit: "${MEM_LIMIT:-512M}",
        cpu_shares: 512,
        deploy: { resources: { limits: { cpus: "0.5" } } },
    });
});

test("shared YAML anchors do not change a sibling service", () => {
    const compose = parse("services:\n  a:\n    deploy: &shared\n      resources:\n        limits: {cpus: '1', memory: 64M}\n  b:\n    deploy: *shared\n");
    const sibling = structuredClone(compose.services.b);
    compose.services.a = applyResourceLimits(compose.services.a, { cpu: "2",
        memory: "128M" });
    assert.deepEqual(compose.services.b, sibling);
});

test("invalid new values fail atomically without changing the service", () => {
    const service = { image: "busybox:stable" };
    for (const cpu of [ "-1", "NaN", "Infinity", "0", "0,5", "1e5", "0.0000000001", "${CPU}" ]) {
        assert.throws(() => applyResourceLimits(service, { cpu,
            memory: "" }), /invalidCpu/);
    }
    for (const memory of [ "-1G", "Infinity", "0", "1M", "potato", "999999999999999999G", "${RAM}" ]) {
        assert.throws(() => applyResourceLimits(service, { cpu: "1",
            memory }), /invalidMemory/);
    }
    assert.deepEqual(service, { image: "busybox:stable" });
    assert.throws(() => applyResourceLimits({ deploy: "${DEPLOY}" }, { cpu: "1",
        memory: "" }), /invalidStructure/);
});
