"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const http = require("http");
const { execFileSync } = require("child_process");

const planPath = process.env.SELF_UPDATE_PLAN;
const stateDir = "/state/self-update";
const keyPath = path.join(stateDir, "plan.key");
const socketPath = "/var/run/docker.sock";

function fail(message) {
    writeStatus("failed", message, false);
    process.exitCode = 1;
    throw new Error(message);
}

function writeStatus(state, message, rollbackAttempted) {
    fs.mkdirSync(stateDir, { recursive: true, mode: 0o700 });
    fs.writeFileSync(path.join(stateDir, "status.json"), JSON.stringify({
        state,
        message,
        rollbackAttempted: rollbackAttempted === true,
        finishedAt: [ "succeeded", "failed", "rolled-back" ].includes(state) ? new Date().toISOString() : null,
    }, null, 2), { mode: 0o600 });
}

function canonical(value) { return JSON.stringify(value); }

function readPlan() {
    if (!planPath || !planPath.startsWith(`${stateDir}/`)) fail("Invalid self-update plan path");
    const payload = JSON.parse(fs.readFileSync(planPath, "utf8"));
    const secret = fs.readFileSync(keyPath);
    const expected = crypto.createHmac("sha256", secret).update(canonical(payload.plan)).digest("hex");
    if (!payload.plan || typeof payload.signature !== "string" || payload.signature.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(payload.signature))) fail("Self-update plan signature is invalid");
    const plan = payload.plan;
    if (plan.version !== 1 || !/^[a-f0-9]{32}$/.test(plan.id) || Date.parse(plan.expiresAt) <= Date.now()) fail("Self-update plan is expired or malformed");
    const production = /^ghcr\.io\/[a-z0-9._-]+\/dockge-enhanced(?::[a-z0-9._-]+|@sha256:[a-f0-9]{64})$/i;
    const allowedTest = (process.env.SELF_UPDATE_ALLOW_TEST_IMAGES || "").split(",").filter(Boolean);
    if (!production.test(plan.targetImage) && !allowedTest.includes(plan.targetImage)) fail("Self-update target image is not allowed");
    return plan;
}

function docker(args, options = {}) {
    return execFileSync("docker", args, { encoding: "utf8", stdio: [ "ignore", "pipe", "pipe" ], ...options });
}

function inspect(name) { return JSON.parse(docker([ "container", "inspect", name, "--format", "{{json .}}" ])); }

function waitHealthy(name, timeoutMs = 180000) {
    writeStatus("waiting-health", "Waiting for Dockge-Enhanced healthcheck", false);
    const until = Date.now() + timeoutMs;
    while (Date.now() < until) {
        try {
            const state = inspect(name).State || {};
            if (state.Health?.Status === "healthy") return true;
            if (!state.Health && state.Running === true) return true;
            if (state.Status === "exited" || state.Status === "dead") return false;
        } catch { /* container is still being created */ }
        execFileSync("sleep", [ "2" ]);
    }
    return false;
}

function composeUpdate(plan, image) {
    const files = plan.compose.configFiles.map((file) => path.join("/compose", path.basename(file)));
    const override = path.join(stateDir, `${plan.id}.override.yaml`);
    fs.writeFileSync(override, `services:\n  ${plan.compose.service}:\n    image: ${JSON.stringify(image)}\n`, { mode: 0o600 });
    const base = [ "compose", "--project-directory", "/compose", "-p", plan.compose.project ];
    for (const file of files) base.push("-f", file);
    base.push("-f", override);
    const allowedTest = (process.env.SELF_UPDATE_ALLOW_TEST_IMAGES || "").split(",").filter(Boolean);
    if (!allowedTest.includes(image)) {
        docker([ ...base, "pull", plan.compose.service ], { timeout: 600000 });
    }
    docker([ ...base, "up", "-d", "--no-deps", plan.compose.service ], { timeout: 180000 });
}

function dockerApi(method, requestPath, body) {
    return new Promise((resolve, reject) => {
        const req = http.request({ socketPath, path: requestPath, method, headers: body ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) } : undefined }, (res) => {
            let raw = "";
            res.on("data", (chunk) => { raw += chunk; });
            res.on("end", () => res.statusCode >= 200 && res.statusCode < 300 ? resolve(raw) : reject(new Error(`Docker API ${method} ${requestPath}: ${res.statusCode} ${raw.slice(0, 500)}`)));
        });
        req.on("error", reject);
        if (body) req.write(body);
        req.end();
    });
}

async function snapshotCreate(inspected, image) {
    const name = String(inspected.Name || "").replace(/^\//, "");
    const config = { ...(inspected.Config || {}), Image: image };
    delete config.Hostname;
    delete config.Domainname;
    const body = JSON.stringify({
        ...config,
        HostConfig: inspected.HostConfig,
        NetworkingConfig: { EndpointsConfig: inspected.NetworkSettings?.Networks || {} },
    });
    await dockerApi("POST", `/containers/${encodeURIComponent(inspected.Id)}/stop?t=30`);
    await dockerApi("DELETE", `/containers/${encodeURIComponent(inspected.Id)}?force=1`);
    const created = JSON.parse(await dockerApi("POST", `/containers/create?name=${encodeURIComponent(name)}`, body));
    await dockerApi("POST", `/containers/${encodeURIComponent(created.Id)}/start`);
}

async function run() {
    const plan = readPlan();
    const inspected = inspect(plan.targetContainerId);
    if (inspected.Id !== plan.targetContainerId || String(inspected.Name || "").replace(/^\//, "") !== plan.targetContainerName || inspected.Config?.Image !== plan.previousImage) {
        fail("Self-update plan does not match the current Dockge-Enhanced container");
    }
    writeStatus("updating", plan.compose ? "Updating through Docker Compose" : "Updating from Docker snapshot fallback", false);
    try {
        if (plan.compose && process.env.SELF_UPDATE_COMPOSE_DIR === "/compose") composeUpdate(plan, plan.targetImage);
        else await snapshotCreate(inspected, plan.targetImage);
        if (waitHealthy(plan.targetContainerName)) {
            writeStatus("succeeded", "Dockge-Enhanced updated successfully", false);
            return;
        }
        writeStatus("updating", "Healthcheck failed; rolling back", true);
        if (plan.compose && process.env.SELF_UPDATE_COMPOSE_DIR === "/compose") {
            composeUpdate(plan, plan.previousImage);
        } else {
            const current = inspect(plan.targetContainerName);
            await snapshotCreate(current, plan.previousImage);
        }
        if (waitHealthy(plan.targetContainerName)) writeStatus("rolled-back", "Healthcheck failed; previous container restored", true);
        else fail("Healthcheck failed and rollback did not restore Dockge-Enhanced");
    } catch (error) {
        fail(error instanceof Error ? error.message : String(error));
    }
}

run().catch((error) => { console.error(error); process.exit(1); });
