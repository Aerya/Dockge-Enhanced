import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { request } from "node:http";
import { connect } from "node:net";
import { once } from "node:events";
import { RELAY_IMAGE } from "../common/rollout-relay";
import { addRolloutRelay } from "../frontend/src/rollout-relay";
import { prepareRollout, rolloutTransport } from "./service-rollout";

test("Docker relay: fixed port, successive updates, long connection, failed health and restart", {
    skip: process.env.RUN_DOCKER_ROLLOUT_TEST !== "1",
    timeout: 240_000,
}, async () => {
    const project = "rollout-relay-test-" + randomUUID().slice(0, 8);
    const root = await mkdtemp(path.join(os.tmpdir(), project));
    const file = path.join(root, "compose.json");
    const image = project + ":app";
    const transport = rolloutTransport([ "compose", "-p", project, "-f", file ], root);
    const stateDir = path.join(root, "state");
    let polling: ReturnType<typeof setInterval> | undefined;
    let held: ReturnType<typeof connect> | undefined;
    const failures: string[] = [];
    let requests = 0;
    try {
        await writeFile(path.join(root, "Dockerfile"), [
            "FROM busybox:stable",
            "LABEL dockge.rollout.fixture=" + project,
            "COPY index.html /www/index.html",
            "CMD [\"httpd\", \"-f\", \"-p\", \"8080\", \"-h\", \"/www\"]",
        ].join("\n"));
        const build = async (version: string) => {
            await writeFile(path.join(root, "index.html"), version);
            await transport.docker([ "build", "--pull=false", "-t", image, root ], 60_000);
        };
        await build("version-one");
        const config = addRolloutRelay({ services: { app: {
            image,
            ports: [ "127.0.0.1::8080" ],
            healthcheck: { test: [ "CMD-SHELL", "wget -q -O- http://127.0.0.1:8080/ | grep -q version" ],
                interval: "1s",
                timeout: "1s",
                retries: 1 },
        } } }, "app", 8080);
        // A separate reverse proxy sees only a fixed upstream, like an external
        // NPM/Nginx installation. It never learns the application replica IDs.
        config.services.gateway = {
            image: RELAY_IMAGE,
            ports: [ "127.0.0.1::80" ],
            entrypoint: [ "/bin/sh", "-ec" ],
            command: [ "printf '%s' \"$$GATEWAY_CONFIG\" > /etc/nginx/conf.d/default.conf; exec nginx -g 'daemon off;'" ],
            environment: { GATEWAY_CONFIG: "server { listen 80; location / { proxy_pass http://app-rollout-relay:8080; } }" },
            depends_on: { "app-rollout-relay": { condition: "service_healthy" } },
        };
        const gatewayNames = [ "gateway" ];
        if (process.env.ROLLOUT_PROXY_MATRIX === "1") {
            for (const [ name, proxyImage, configuration, launch ] of [
                [ "caddy", "caddy:2-alpine", ":80 {\n reverse_proxy app-rollout-relay:8080\n}\n", "caddy run --config /tmp/proxy.conf --adapter caddyfile" ],
                [ "haproxy", "haproxy:3.2-alpine", "global\n maxconn 2048\ndefaults\n mode http\n timeout connect 5s\n timeout client 60s\n timeout server 60s\nfrontend public\n bind :80\n default_backend app\nbackend app\n server relay app-rollout-relay:8080\n", "haproxy -db -f /tmp/proxy.conf" ],
            ]) {
                config.services[name] = {
                    image: proxyImage,
                    ports: [ "127.0.0.1::80" ],
                    entrypoint: [ "/bin/sh", "-ec" ],
                    command: [ "printf '%s' \"$$GATEWAY_CONFIG\" > /tmp/proxy.conf; exec " + launch ],
                    environment: { GATEWAY_CONFIG: configuration },
                    depends_on: { "app-rollout-relay": { condition: "service_healthy" } },
                };
                gatewayNames.push(name);
            }
        }
        await writeFile(file, JSON.stringify(config));
        await transport.compose([ "up", "-d", "--wait", "--wait-timeout", "30" ], 60_000);
        let address = (await transport.compose([ "port", "app-rollout-relay", "8080" ], 15_000)).trim();
        const gateways = await Promise.all(gatewayNames.map(async name => (await transport.compose([ "port", name, "80" ], 15_000)).trim()));
        const get = (destination = address) => new Promise<string>((resolve, reject) => {
            const req = request("http://" + destination, { agent: false }, response => {
                let body = "";
                response.setEncoding("utf8");
                response.on("data", chunk => {
                    body += chunk;
                });
                response.on("end", () => response.statusCode === 200 ? resolve(body) : reject(new Error("HTTP " + response.statusCode)));
            });
            req.on("error", reject);
            req.setTimeout(3000, () => req.destroy(new Error("HTTP timeout")));
            req.end();
        });
        assert.match(await get(), /version-one/);
        for (const gateway of gateways) {
            assert.match(await get(gateway), /version-one/);
        }
        polling = setInterval(() => {
            requests += 1 + gateways.length;
            get().catch(error => failures.push(String(error)));
            gateways.forEach((gateway, index) => get(gateway).catch(error => failures.push(gatewayNames[index] + ": " + String(error))));
        }, 100);
        const relayId = (await transport.compose([ "ps", "-q", "app-rollout-relay" ], 15_000)).trim();
        for (const version of [ "version-two", "version-three" ]) {
            const old = (await transport.compose([ "ps", "-q", "app" ], 15_000)).trim();
            const plan = await prepareRollout(transport.compose, transport.docker, [ "app" ], { stateDir });
            assert.ok(plan);
            assert.deepEqual(plan.managedServices, [ "app-rollout-relay" ]);
            await assert.rejects(plan.execute(() => {
                throw new Error("access.denied");
            }), /access.denied/);
            assert.equal((await transport.compose([ "ps", "-q", "app" ], 15_000)).trim(), old);
            if (version === "version-two") {
                held = connect(Number(address.split(":").at(-1)), "127.0.0.1");
                await once(held, "connect");
                held.write("GET / HTTP/1.1\r\nHost: test\r\n");
            }
            await build(version);
            const execution = plan.execute();
            let executionError: unknown;
            void execution.catch(error => {
                executionError = error;
            }); // Awaited below, while HTTP probes run.
            // Observe the new route while the old TCP request remains open.
            if (held) {
                // This observes a bounded multi-step Docker operation, not a
                // latency assertion. All HTTP failures are still counted below.
                for (let attempt = 0; attempt < 300; attempt++) {
                    if (executionError) {
                        throw executionError;
                    }
                    if ((await get()).includes(version)) {
                        break;
                    }
                    await new Promise(resolve => setTimeout(resolve, 200));
                }
                assert.match(await get(), new RegExp(version));
                assert.equal((await transport.docker([ "inspect", "--format", "{{.State.Running}}", old ], 15_000)).trim(), "true");
                const response = new Promise<string>(resolve => {
                    let data = "";
                    held!.on("data", chunk => {
                        data += chunk;
                    });
                    held!.on("end", () => resolve(data));
                });
                held.write("\r\n");
                assert.match(await response, /version-one/);
                held.destroy();
                held = undefined;
            }
            await execution;
            assert.match(await get(), new RegExp(version));
            for (const gateway of gateways) {
                assert.match(await get(gateway), new RegExp(version));
            }
            assert.equal((await transport.compose([ "ps", "-aq", "app" ], 15_000)).trim().split("\n").length, 1);
            assert.equal((await transport.compose([ "ps", "-q", "app-rollout-relay" ], 15_000)).trim(), relayId);
            const stableApp = (await transport.compose([ "ps", "-q", "app" ], 15_000)).trim();
            await transport.compose([ "up", "-d", "--no-deps", "app" ], 30_000);
            assert.equal((await transport.compose([ "ps", "-q", "app" ], 15_000)).trim(), stableApp,
                "ordinary Deploy must not recreate a successfully updated service");
        }
        const old = (await transport.compose([ "ps", "-q", "app" ], 15_000)).trim();
        const failed = await prepareRollout(transport.compose, transport.docker, [ "app" ], { stateDir });
        await build("broken");
        await assert.rejects(failed!.execute(), /Rollout failed/);
        assert.equal((await transport.compose([ "ps", "-q", "app" ], 15_000)).trim(), old);
        assert.match(await get(), /version-three/);
        // A connection which outlives the drain budget must never be killed to
        // manufacture a successful result. Both generations remain recoverable.
        held = connect(Number(address.split(":").at(-1)), "127.0.0.1");
        await once(held, "connect");
        held.write("GET / HTTP/1.1\r\nHost: test\r\n");
        const blocked = await prepareRollout(transport.compose, transport.docker, [ "app" ], { stateDir,
            attempts: 3 });
        await build("version-four");
        await assert.rejects(blocked!.execute(), /retirement incomplete/);
        assert.equal((await transport.docker([ "inspect", "--format", "{{.State.Running}}", old ], 15_000)).trim(), "true");
        assert.equal((await transport.compose([ "ps", "-aq", "app" ], 15_000)).trim().split("\n").length, 2);
        assert.match(await get(), /version-three/);
        held.destroy();
        held = undefined;
        await assert.rejects(prepareRollout(transport.compose, transport.docker, [ "app" ], { stateDir }), /leftover/);
        clearInterval(polling);
        polling = undefined;
        await new Promise(resolve => setTimeout(resolve, 300));
        assert.deepEqual(failures, []);
        assert.ok(requests > 50);
        console.log("Relay requests served during updates:", requests);
        await transport.compose([ "restart", "app-rollout-relay" ], 30_000);
        // Docker may reassign an ephemeral host port on restart. Real migrated
        // ports are explicit; the test intentionally requests a random free port.
        address = (await transport.compose([ "port", "app-rollout-relay", "8080" ], 15_000)).trim();
        for (let attempt = 0; attempt < 20; attempt++) {
            try {
                if ((await get()).includes("version-three")) {
                    break;
                }
            } catch { /* restarting relay */ }
            await new Promise(resolve => setTimeout(resolve, 300));
        }
        assert.match(await get(), /version-three/);
        // Keep the relay configuration volume: this is precisely the recovery
        // path that used to restart forever on a deleted app-2 DNS name.
        await transport.compose([ "down", "--timeout", "5" ], 30_000);
        await transport.compose([ "up", "-d", "--wait", "--wait-timeout", "45" ], 60_000);
        address = (await transport.compose([ "port", "app-rollout-relay", "8080" ], 15_000)).trim();
        assert.match(await get(), /version-four/);
    } finally {
        if (polling) {
            clearInterval(polling);
        }
        held?.destroy();
        await transport.compose([ "logs", "--tail", "10", "app-rollout-relay" ], 15_000).then(console.log).catch(() => {});
        // Only this UUID-named fixture and its generated empty config volume.
        await transport.compose([ "down", "--volumes", "--remove-orphans", "--timeout", "5" ], 30_000);
        const images = (await transport.docker([ "image", "ls", "-q", "--filter", "label=dockge.rollout.fixture=" + project ], 15_000)).trim().split(/\s+/).filter(Boolean);
        if (images.length) {
            await transport.docker([ "image", "rm", image, ...images ], 30_000).catch(() => {});
        }
        await rm(root, { recursive: true,
            force: true });
    }
});
