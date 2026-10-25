import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm, readdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { request } from "node:http";
import { prepareRollout, rolloutTransport } from "./service-rollout";
import { LABEL_ROLLOUT, ROLLOUT_HEALTH_PREFIX } from "../common/service-rollout";

// Explicit opt-in only. Unique project, images, files and loopback port.
// Never runs prune, never mounts application data, never addresses production IDs.
test("isolated Docker: real proxy, successive updates, failed health and persistent discovery", {
    skip: process.env.RUN_DOCKER_ROLLOUT_TEST !== "1",
    timeout: 300_000,
}, async () => {
    const project = "rollout-test-" + randomUUID().slice(0, 8);
    const root = await mkdtemp(path.join(os.tmpdir(), project + "-"));
    const file = path.join(root, "compose.json");
    const stateDir = path.join(root, "state");
    const image = project + ":app";
    const proxyImage = "traefik:" + project;
    const transport = rolloutTransport([ "compose", "-p", project, "-f", file ], root);
    let polling: ReturnType<typeof setInterval> | undefined;
    const httpFailures: string[] = [];
    try {
        const proxySource = process.env.ROLLOUT_TRAEFIK_SOURCE;
        assert.ok(proxySource, "Provide an existing local Traefik image ID");
        await transport.docker([ "image", "tag", proxySource, proxyImage ], 15_000);
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
        const config = {
            services: {
                proxy: {
                    image: proxyImage,
                    command: [ "--providers.docker=true", "--providers.docker.exposedbydefault=false",
                        "--providers.docker.constraints=Label(`dockge.rollout.fixture`, `" + project + "`)",
                        "--entrypoints.web.address=:80" ],
                    ports: [ "127.0.0.1::80" ],
                    volumes: [ "/var/run/docker.sock:/var/run/docker.sock:ro" ],
                },
                app: {
                    image,
                    labels: {
                        [LABEL_ROLLOUT]: "true",
                        "dockge.rollout.fixture": project,
                        "traefik.enable": "true",
                        "traefik.http.routers.fixture.rule": "Host(`rollout.invalid`)",
                        "traefik.http.services.fixture.loadbalancer.server.port": "8080",
                    },
                    healthcheck: { test: [ "CMD-SHELL", ROLLOUT_HEALTH_PREFIX + "wget -q -O- http://127.0.0.1:8080/ | grep -q version" ],
                        interval: "1s",
                        timeout: "1s",
                        retries: 1 },
                },
            },
        };
        await writeFile(file, JSON.stringify(config));
        await transport.compose([ "up", "-d", "--wait", "--wait-timeout", "30" ], 60_000);
        const address = (await transport.compose([ "port", "proxy", "80" ], 15_000)).trim();
        const get = async () => {
            return new Promise<string>((resolve, reject) => {
                const req = request("http://" + address, { headers: { Host: "rollout.invalid" } }, response => {
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
        };
        for (let i = 0; i < 20; i++) {
            try {
                if ((await get()).includes("version-one")) {
                    break;
                }
            } catch { /* proxy discovery */ }
            await new Promise(resolve => setTimeout(resolve, 500));
        }
        assert.match(await get(), /version-one/);
        const first = (await transport.compose([ "ps", "-q", "app" ], 15_000)).trim();
        polling = setInterval(() => {
            get().catch(error => httpFailures.push(String(error)));
        }, 200);
        for (const version of [ "version-two", "version-three" ]) {
            const plan = await prepareRollout(transport.compose, transport.docker, [ "app" ], { stateDir });
            assert.ok(plan);
            await build(version);
            await plan.execute();
            assert.match(await get(), new RegExp(version));
            assert.equal((await transport.compose([ "ps", "-aq", "app" ], 15_000)).trim().split("\n").length, 1);
            await assert.rejects(readdir(stateDir), { code: "ENOENT" }, "rollout creates no auxiliary Compose override");
            const stable = (await transport.compose([ "ps", "-q", "app" ], 15_000)).trim();
            await transport.compose([ "up", "-d", "--no-deps", "app" ], 30_000);
            assert.equal((await transport.compose([ "ps", "-q", "app" ], 15_000)).trim(), stable, "ordinary Deploy preserves the replica");
        }
        const latest = (await transport.compose([ "ps", "-q", "app" ], 15_000)).trim();
        assert.notEqual(first, latest);
        const inspect = JSON.parse(await transport.docker([ "inspect", latest ], 15_000));
        const recorded = inspect[0].Config.Labels["com.docker.compose.project.config_files"].split(",");
        assert.deepEqual(recorded, [ file ], "discovery depends only on the original Compose file");
        const discovery = rolloutTransport([ "compose", "-p", project, ...recorded.flatMap((value: string) => [ "-f", value ]) ], root);
        assert.ok(JSON.parse(await discovery.compose([ "config", "--format", "json" ], 15_000)).services.app);
        const failing = await prepareRollout(discovery.compose, transport.docker, [ "app" ], { stateDir });
        await build("broken");
        await assert.rejects(failing!.execute(), /Rollout failed/);
        assert.equal((await transport.compose([ "ps", "-q", "app" ], 15_000)).trim(), latest);
        assert.match(await get(), /version-three/);
        clearInterval(polling);
        polling = undefined;
        assert.deepEqual(httpFailures, [], "new HTTP requests must remain served during replacement");
    } catch (error) {
        console.error(await transport.compose([ "logs", "--tail", "20", "proxy" ], 15_000).catch(() => "proxy logs unavailable"));
        throw error;
    } finally {
        if (polling) {
            clearInterval(polling);
        }
        await transport.compose([ "down", "--remove-orphans", "--timeout", "5" ], 30_000).catch(() => {});
        const fixtureImages = (await transport.docker([ "image", "ls", "-q", "--filter", "label=dockge.rollout.fixture=" + project ], 15_000)).trim().split(/\s+/).filter(Boolean);
        await transport.docker([ "image", "rm", image, proxyImage, ...fixtureImages ], 30_000).catch(() => {});
        await rm(root, { recursive: true,
            force: true });
    }
});
