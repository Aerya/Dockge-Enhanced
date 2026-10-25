import test from "node:test";
import assert from "node:assert/strict";
import { addRolloutRelay } from "./rollout-relay";
import { relayConfig, LABEL_RELAY } from "../../common/rollout-relay";
import { rolloutProblems } from "../../common/service-rollout";

function model() {
    return { services: { web: {
        image: "example:latest",
        ports: [ "127.0.0.1:18080:8080" ],
        healthcheck: { test: [ "CMD", "true" ] },
        labels: { "plugNPiN.url": "demo.invalid",
            "plugNPiN.ip": "192.0.2.1:18080",
            custom: "keep" },
    } },
    volumes: { existing: { external: true } } };
}

test("relay draft migration preserves host port and moves publication ownership, without mutating input", () => {
    const original = model();
    const snapshot = structuredClone(original);
    const next = addRolloutRelay(original, "web", 8080);
    assert.deepEqual(original, snapshot);
    assert.equal(next.services.web.ports, undefined);
    assert.deepEqual(next.services["web-rollout-relay"].ports, original.services.web.ports);
    assert.deepEqual(next.services.web.healthcheck, original.services.web.healthcheck);
    assert.equal((next.services.web.labels as Record<string, string>)["plugNPiN.url"], undefined);
    assert.equal((next.services.web.labels as Record<string, string>).custom, "keep");
    assert.equal((next.services["web-rollout-relay"].labels as Record<string, string>)["plugNPiN.url"], "demo.invalid");
    assert.deepEqual(next.volumes?.existing, { external: true });
    assert.deepEqual(rolloutProblems(next.services.web), []);
    assert.match(String(next.services["web-rollout-relay"].command), /\$\$DOCKGE_RELAY_BOOTSTRAP/);
    const bootstrap = String((next.services["web-rollout-relay"].environment as Record<string, unknown>).DOCKGE_RELAY_BOOTSTRAP);
    assert.doesNotMatch(bootstrap, /placeholder/);
    assert.match(bootstrap, /server \$\{COMPOSE_PROJECT_NAME\}-web-rollout-origin:8080 backup;/);
});

test("list labels are preserved and duplicate relay generation is refused", () => {
    const input = model();
    const service = input.services.web as Record<string, unknown>;
    service.labels = [ "plugNPiN.url=demo.invalid", "custom=unchanged" ];
    const next = addRolloutRelay(input, "web", 8080);
    assert.deepEqual(next.services.web.labels, [ "custom=unchanged", LABEL_RELAY + "=web-rollout-relay", "dockge.rollout.enabled=true" ]);
    assert.throws(() => addRolloutRelay(next, "web", 8080));
});

test("uncertain port/configuration migrations are refused, never silently rewritten", () => {
    for (const changes of [
        { ports: [ "53:53/udp" ] }, { ports: [ "${PORT}:8080" ] }, { ports: [ "8000-8010:8000-8010" ] },
        { ports: [ "443:8443" ] }, { container_name: "fixed" }, { network_mode: "host" },
        { profiles: [ "test" ] }, { extends: "base.yml" }, { healthcheck: { disable: true } },
        { labels: { caddy: "example.test" } }, { environment: { VIRTUAL_HOST: "example.test" } },
    ]) {
        const input = model();
        Object.assign(input.services.web, changes);
        assert.throws(() => addRolloutRelay(input, "web", 8080));
    }
});

test("CPU/RAM limits, replicas and existing network options are preserved", () => {
    const input = model();
    Object.assign(input.services.web, { deploy: { replicas: 2,
        resources: { limits: { cpus: "0.5",
            memory: "128M" } } },
    networks: { public: { aliases: [ "existing-alias" ] } } });
    const next = addRolloutRelay(input, "web", 8080);
    assert.deepEqual(next.services.web.deploy, (input.services.web as Record<string, unknown>).deploy);
    assert.deepEqual((next.services.web.networks as Record<string, unknown>).public, { aliases: [ "existing-alias" ] });
    assert.deepEqual((next.services.web.networks as Record<string, unknown>)["web-rollout-relay"], { aliases: [ "${COMPOSE_PROJECT_NAME}-web-rollout-origin" ] });
});

test("arbitrary configuration injection and invalid ports are rejected", () => {
    for (const host of [ "foo;include /secret;", "../file", "foo\nserver", "", "[::1]" ]) {
        assert.throws(() => relayConfig([ host ], 8080));
    }
    for (const port of [ 0, 65536, 1.5, NaN ]) {
        assert.throws(() => relayConfig([ "web" ], port));
    }
});

test("PlugNPiN on application replicas is refused even when Traefik labels exist", () => {
    const service = model().services.web;
    assert.ok(rolloutProblems(service).includes("plugnpin-labels-must-belong-to-stable-relay"));
});

test("relay mode refuses discovery which would bypass the stable entry point", () => {
    const service = addRolloutRelay(model(), "web", 8080).services.web;
    for (const labels of [{ "traefik.enable": "true" }, { caddy: "example.test" }]) {
        const candidate = { ...service,
            labels: { ...service.labels as object,
                ...labels } };
        assert.ok(rolloutProblems(candidate).includes("proxy-discovery-must-target-relay-not-application"));
    }
});
