import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { request } from "node:https";
import { once } from "node:events";
import WebSocket from "ws";
import { addRolloutRelay } from "../frontend/src/rollout-relay";
import { prepareRollout, rolloutTransport } from "./service-rollout";

test("Docker TLS passthrough and real WebSocket survive a healthy rolling switch", {
    skip: process.env.RUN_DOCKER_ROLLOUT_TEST !== "1",
    timeout: 180_000,
}, async () => {
    const project = "rollout-tls-test-" + randomUUID().slice(0, 8);
    const root = await mkdtemp(path.join(os.tmpdir(), project));
    const file = path.join(root, "compose.json");
    const image = project + ":app";
    const { docker, compose } = rolloutTransport([ "compose", "-p", project, "-f", file ], root);
    const sockets: WebSocket[] = [];
    let polling: ReturnType<typeof setInterval> | undefined;
    const failures: string[] = [];
    try {
        await promisify(execFile)("openssl", [ "req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "1",
            "-keyout", path.join(root, "key.pem"), "-out", path.join(root, "cert.pem"), "-subj", "/CN=localhost",
            "-addext", "subjectAltName=DNS:localhost,IP:127.0.0.1" ]);
        const ca = await readFile(path.join(root, "cert.pem"));
        await writeFile(path.join(root, "server.mjs"), `
import https from 'node:https';
import fs from 'node:fs';
import crypto from 'node:crypto';
const version = fs.readFileSync('/fixture/version', 'utf8');
const server = https.createServer({key: fs.readFileSync('/fixture/key.pem'), cert: fs.readFileSync('/fixture/cert.pem')}, (_req, res) => res.end(version));
server.on('upgrade', (req, socket) => {
 const accept = crypto.createHash('sha1').update(req.headers['sec-websocket-key'] + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
 socket.write('HTTP/1.1 101 Switching Protocols\\r\\nUpgrade: websocket\\r\\nConnection: Upgrade\\r\\nSec-WebSocket-Accept: ' + accept + '\\r\\n\\r\\n');
 const frame = Buffer.concat([Buffer.from([0x81, Buffer.byteLength(version)]), Buffer.from(version)]);
 const timer = setInterval(() => socket.write(frame), 100);
 socket.on('data', data => { if ((data[0] & 15) === 8) { socket.end(Buffer.from([0x88, 0])); } });
 socket.on('error', () => {});
 socket.on('close', () => clearInterval(timer));
});
server.listen(8443, '0.0.0.0');
`);
        await writeFile(path.join(root, "Dockerfile"), `FROM node:24.22.1-alpine\nLABEL dockge.rollout.fixture=${project}\nCOPY server.mjs version key.pem cert.pem /fixture/\nCMD ["node", "/fixture/server.mjs"]\n`);
        const build = async (version: string) => {
            await writeFile(path.join(root, "version"), version);
            await docker([ "build", "--pull=false", "-t", image, root ], 60_000);
        };
        await build("version-one");
        const config = addRolloutRelay({ services: { app: { image,
            ports: [ "127.0.0.1::8443" ],
            healthcheck: { test: [ "CMD", "node", "-e", "require('https').get({host:'127.0.0.1',port:8443,ca:require('fs').readFileSync('/fixture/cert.pem')},r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))" ],
                interval: "1s",
                timeout: "2s",
                retries: 3 } } } }, "app", 8443);
        await writeFile(file, JSON.stringify(config));
        await compose([ "up", "-d", "--wait", "--wait-timeout", "45" ], 60_000);
        const address = (await compose([ "port", "app-rollout-relay", "8443" ], 15_000)).trim();
        const get = () => new Promise<string>((resolve, reject) => {
            const req = request("https://" + address, { ca,
                agent: false }, response => {
                let body = "";
                response.on("data", chunk => {
                    body += chunk;
                });
                response.on("end", () => response.statusCode === 200 ? resolve(body) : reject(new Error("HTTP " + response.statusCode)));
            });
            req.on("error", reject);
            req.setTimeout(3000, () => req.destroy(new Error("TLS timeout")));
            req.end();
        });
        assert.equal(await get(), "version-one");
        const ws = new WebSocket("wss://" + address, { ca });
        sockets.push(ws);
        const messages: string[] = [];
        ws.on("message", data => messages.push(data.toString()));
        await once(ws, "open");
        const old = (await compose([ "ps", "-q", "app" ], 15_000)).trim();
        const plan = await prepareRollout(compose, docker, [ "app" ]);
        await build("version-two");
        polling = setInterval(() => {
            get().catch(error => failures.push(String(error)));
        }, 100);
        const running = plan!.execute();
        let error: unknown;
        void running.catch(reason => {
            error = reason;
        });
        for (let attempt = 0; attempt < 300 && await get() !== "version-two"; attempt++) {
            if (error) {
                throw error;
            }
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        assert.equal(await get(), "version-two");
        assert.ok(messages.length > 10 && messages.every(message => message === "version-one"));
        assert.equal(ws.readyState, WebSocket.OPEN, "old WebSocket stays open after route switch");
        assert.equal((await docker([ "inspect", "--format", "{{.State.Running}}", old ], 15_000)).trim(), "true");
        const next = new WebSocket("wss://" + address, { ca });
        sockets.push(next);
        assert.equal((await once(next, "message"))[0].toString(), "version-two");
        ws.close();
        await once(ws, "close");
        await running;
        assert.equal(await get(), "version-two");
        next.close();
        await once(next, "close");
        clearInterval(polling);
        polling = undefined;
        assert.deepEqual(failures, []);
    } catch (error) {
        console.error("TLS scenario failed before cleanup:", error);
        await compose([ "logs", "--tail", "10", "app", "app-rollout-relay" ], 15_000).then(console.log).catch(() => {});
        throw error;
    } finally {
        if (polling) {
            clearInterval(polling);
        }
        sockets.forEach(socket => socket.terminate());
        await compose([ "down", "--volumes", "--remove-orphans", "--timeout", "5" ], 30_000);
        await docker([ "image", "rm", image ], 30_000).catch(() => {});
        const images = (await docker([ "image", "ls", "-q", "--filter", "label=dockge.rollout.fixture=" + project ], 15_000)).trim().split(/\s+/).filter(Boolean);
        if (images.length) {
            await docker([ "image", "rm", ...images ], 30_000);
        }
        await rm(root, { recursive: true,
            force: true });
    }
});
