import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID, randomBytes } from "node:crypto";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { request } from "node:http";
import { addRolloutRelay } from "../frontend/src/rollout-relay";
import { prepareRollout, rolloutTransport } from "./service-rollout";
import { fixtureDockerProxy } from "./rollout-docker-fixture";

test("real NPM and PlugNPiN retain publication throughout successive rolling updates", {
    skip: process.env.RUN_DOCKER_ROLLOUT_TEST !== "1",
    timeout: 420_000,
}, async () => {
    const project = "rollout-npm-test-" + randomUUID().slice(0, 8);
    const root = await mkdtemp(path.join(os.tmpdir(), project));
    const file = path.join(root, "compose.json");
    const image = project + ":app";
    const password = randomBytes(32).toString("base64url");
    const domain = project + ".invalid";
    const { docker, compose } = rolloutTransport([ "compose", "-p", project, "-f", file ], root);
    const proxy = await fixtureDockerProxy(project);
    let polling: ReturnType<typeof setInterval> | undefined;
    const failures: string[] = [];
    try {
        await writeFile(path.join(root, "Dockerfile"), `FROM busybox:stable\nLABEL dockge.rollout.fixture=${project}\nCOPY index.html /www/index.html\nCMD ["httpd", "-f", "-p", "8080", "-h", "/www"]\n`);
        const build = async (version: string) => {
            await writeFile(path.join(root, "index.html"), version);
            await docker([ "build", "--pull=false", "-t", image, root ], 60_000);
        };
        await build("version-one");
        const config = addRolloutRelay({ services: { app: { image,
            labels: { "plugNPiN.url": domain,
                "plugNPiN.ip": "app-rollout-relay:8080" },
            healthcheck: { test: [ "CMD-SHELL", "wget -q -O- http://127.0.0.1:8080 | grep -q version" ],
                interval: "1s",
                timeout: "1s",
                retries: 3 },
        } } }, "app", 8080);
        config.services.npm = { image: "jc21/nginx-proxy-manager:latest",
            ports: [ "127.0.0.1::81", "127.0.0.1::80" ],
            environment: { INITIAL_ADMIN_EMAIL: "fixture@example.invalid",
                INITIAL_ADMIN_PASSWORD: password,
                DISABLE_IPV6: "true" },
            volumes: [ "npm-data:/data", "npm-certs:/etc/letsencrypt" ] };
        config.volumes = { ...config.volumes,
            "npm-data": {},
            "npm-certs": {} };
        await writeFile(file, JSON.stringify(config));
        await compose([ "up", "-d" ], 180_000);
        const api = "http://" + (await compose([ "port", "npm", "81" ], 15_000)).trim();
        const publicUrl = "http://" + (await compose([ "port", "npm", "80" ], 15_000)).trim();
        let token = "";
        for (let attempt = 0; attempt < 120 && !token; attempt++) {
            try {
                const response = await fetch(api + "/api/tokens", { method: "POST",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({ identity: "fixture@example.invalid",
                        secret: password }),
                    signal: AbortSignal.timeout(2000) });
                if (response.ok) {
                    token = (await response.json()).token;
                }
            } catch { /* isolated NPM database is initializing */ }
            if (!token) {
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }
        assert.ok(token, "isolated NPM administrator authenticates");
        config.services.plugnpin = { image: "ghcr.io/deepspace2/plugnpin:1.0.0",
            network_mode: "host",
            environment: { DOCKER_HOST: `tcp://127.0.0.1:${proxy.port}`,
                NGINX_PROXY_MANAGER_HOST: api,
                NGINX_PROXY_MANAGER_USERNAME: "fixture@example.invalid",
                NGINX_PROXY_MANAGER_PASSWORD: password,
                PIHOLE_DISABLED: "true",
                ADGUARD_HOME_DISABLED: "true",
                RUN_INTERVAL: "5s",
                METRICS: "false" } };
        await writeFile(file, JSON.stringify(config));
        await compose([ "up", "-d", "--no-deps", "plugnpin" ], 120_000);
        const hosts = async () => {
            const response = await fetch(api + "/api/nginx/proxy-hosts", { headers: { authorization: "Bearer " + token },
                signal: AbortSignal.timeout(3000) });
            assert.equal(response.status, 200);
            return await response.json() as { id: number;
                domain_names: string[] }[];
        };
        let hostId: number | undefined;
        for (let attempt = 0; attempt < 60 && !hostId; attempt++) {
            hostId = (await hosts()).find(host => host.domain_names.includes(domain))?.id;
            if (!hostId) {
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }
        assert.ok(hostId, "real PlugNPiN created the NPM proxy host");
        const get = () => new Promise<string>((resolve, reject) => {
            const req = request(publicUrl, { headers: { host: domain },
                agent: false }, response => {
                let body = "";
                response.on("data", chunk => {
                    body += chunk;
                });
                response.on("end", () => response.statusCode === 200 ? resolve(body) : reject(new Error("HTTP " + response.statusCode)));
            });
            req.on("error", reject);
            req.setTimeout(3000, () => req.destroy(new Error("NPM timeout")));
            req.end();
        });
        // NPM persists the host before its asynchronous nginx reload finishes.
        for (let attempt = 0; attempt < 60; attempt++) {
            try {
                if (await get() === "version-one") {
                    break;
                }
            } catch { /* initial publication */ }
            await new Promise(resolve => setTimeout(resolve, 500));
        }
        assert.equal(await get(), "version-one");
        polling = setInterval(() => {
            get().catch(error => failures.push(String(error)));
            hosts().then(list => {
                if (list.length !== 1 || list[0].id !== hostId) {
                    failures.push("publication changed");
                }
            }).catch(error => failures.push(String(error)));
        }, 200);
        for (const version of [ "version-two", "version-three" ]) {
            const plan = await prepareRollout(compose, docker, [ "app" ], { stateDir: path.join(root, "journal"),
                projectPath: root });
            assert.ok(plan);
            await build(version);
            await plan.execute();
            assert.equal(await get(), version);
            assert.deepEqual((await hosts()).map(host => host.id), [ hostId ]);
        }
        clearInterval(polling);
        polling = undefined;
        await new Promise(resolve => setTimeout(resolve, 500));
        assert.deepEqual(failures, []);
    } catch (error) {
        // Do not print NPM startup logs: its bootstrap logs contain the disposable password.
        console.error("NPM integration failed:", error instanceof Error ? error.message : "unknown");
        throw error;
    } finally {
        if (polling) {
            clearInterval(polling);
        }
        await compose([ "down", "--volumes", "--remove-orphans", "--timeout", "5" ], 60_000);
        await proxy.close();
        await docker([ "image", "rm", image ], 30_000).catch(() => {});
        const images = (await docker([ "image", "ls", "-q", "--filter", "label=dockge.rollout.fixture=" + project ], 15_000)).trim().split(/\s+/).filter(Boolean);
        if (images.length) {
            await docker([ "image", "rm", ...images ], 30_000);
        }
        await rm(root, { recursive: true,
            force: true });
    }
});
