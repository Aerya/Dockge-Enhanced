import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { randomUUID } from "node:crypto";
import { execFile, spawn, type ChildProcess } from "node:child_process";
import { promisify } from "node:util";
import { request } from "node:https";
import { once } from "node:events";
import WebSocket from "ws";
import { addRolloutRelay } from "../frontend/src/rollout-relay";
import { prepareRollout, rolloutTransport } from "./service-rollout";
import { readdir } from "node:fs/promises";

test("Docker TLS/WebSocket remains open beyond two minutes and retirement resumes after Enhanced restart", {
    skip: process.env.RUN_DOCKER_ROLLOUT_TEST !== "1",
    timeout: 360_000,
}, async () => {
    const project = "rollout-tls-test-" + randomUUID().slice(0, 8);
    const root = await mkdtemp(path.join(os.tmpdir(), project));
    const file = path.join(root, "compose.json");
    const image = project + ":app";
    const { docker, compose } = rolloutTransport([ "compose", "-p", project, "-f", file ], root);
    const sockets: WebSocket[] = [];
    let polling: ReturnType<typeof setInterval> | undefined;
    let recoveryProcess: ChildProcess | undefined;
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
        const stateDir = path.join(root, "journal");
        const plan = await prepareRollout(compose, docker, [ "app" ], { stateDir,
            projectPath: root });
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
        const pending = await running;
        assert.deepEqual(pending.pending, [ "app" ]);
        assert.equal(ws.readyState, WebSocket.OPEN, "old connection survives the entire foreground drain budget");
        assert.equal(await get(), "version-two", "timeout must not restore the old route");
        assert.ok(messages.length > 1000, "real WebSocket exchanged messages for over two minutes");
        // No shared objects/callbacks: a fresh OS process must reconstruct the
        // transaction solely from the persisted journal and live Docker state.
        recoveryProcess = spawn(process.execPath, [ "--import", "tsx", "--input-type=module", "-e", `
            import { RolloutRecovery } from './backend/rollout-recovery.ts';
            import { rolloutTransport } from './backend/service-rollout.ts';
            const worker = new RolloutRecovery(${JSON.stringify(stateDir)}, rolloutTransport([], process.cwd()).docker, async () => false);
            await worker.load();
            await worker.tick();
            worker.start();
            console.log('RECOVERY_READY');
            setInterval(() => {}, 1000);
        ` ], { stdio: [ "ignore", "pipe", "pipe" ] });
        await new Promise<void>((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error("Recovery process did not start")), 30_000);
            recoveryProcess!.once("exit", code => {
                clearTimeout(timer);
                reject(new Error("Recovery process exited: " + code));
            });
            recoveryProcess!.stdout!.on("data", output => {
                if (String(output).includes("RECOVERY_READY")) {
                    clearTimeout(timer);
                    resolve();
                }
            });
        });
        const journalPath = path.join(stateDir, (await readdir(stateDir)).find(file => file.endsWith(".json"))!);
        const readJournal = async () => JSON.parse(await readFile(journalPath, "utf8"));
        assert.equal(ws.readyState, WebSocket.OPEN, "recovery reconfiguration preserves old connections");
        assert.equal((await readJournal()).phase, "draining");
        ws.close();
        await once(ws, "close");
        next.close();
        await once(next, "close");
        const current = new WebSocket("wss://" + address, { ca });
        sockets.push(current);
        assert.equal((await once(current, "message"))[0].toString(), "version-two");
        for (let attempt = 0; attempt < 90 && (await readJournal()).phase !== "completed"; attempt++) {
            await new Promise(resolve => setTimeout(resolve, 500));
        }
        assert.equal((await readJournal()).phase, "completed", "retirement completes automatically in the restarted process");
        await assert.rejects(docker([ "inspect", old ], 15_000), /./);
        assert.equal(current.readyState, WebSocket.OPEN, "new-generation WebSocket is not interrupted by retirement");
        assert.equal(await get(), "version-two");
        clearInterval(polling);
        polling = undefined;
        assert.deepEqual(failures, []);
    } catch (error) {
        console.error("TLS scenario failed before cleanup:", error);
        await compose([ "logs", "--tail", "10", "app", "app-rollout-relay" ], 15_000).then(console.log).catch(() => {});
        throw error;
    } finally {
        if (recoveryProcess && recoveryProcess.exitCode === null) {
            recoveryProcess.kill("SIGTERM");
            await once(recoveryProcess, "exit");
        }
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
