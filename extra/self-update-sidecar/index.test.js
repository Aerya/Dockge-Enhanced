"use strict";
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const root = fs.mkdtempSync(path.join(os.tmpdir(), "dockge-sidecar-test-"));
process.env.SELF_UPDATE_STATE_DIR = root;
const sidecar = require("./index.js");
test.after(() => fs.rmSync(root, { recursive: true, force: true }));

function clock() {
    let value = 0;
    return { now: () => value, sleep: ms => { value += ms; } };
}

test("a healthy container must remain healthy for the stability period", () => {
    const time = clock();
    const docker = args => args[1] === "inspect" ? JSON.stringify({ State: { Running: true, Status: "running", Health: { Status: "healthy" } } }) : "";
    assert.equal(sidecar.waitReady("dockge", { ...time, docker, stableMs: 4_000, timeoutMs: 10_000, pollMs: 1_000 }), true);
});

test("without a healthcheck the application status endpoint is required", () => {
    const time = clock();
    const calls = [];
    const docker = args => { calls.push(args); return args[1] === "inspect" ? JSON.stringify({ State: { Running: true, Status: "running" } }) : "ok"; };
    assert.equal(sidecar.waitReady("dockge", { ...time, docker, stableMs: 2_000, timeoutMs: 8_000, pollMs: 1_000 }), true);
    assert.ok(calls.some(args => args.join(" ").includes("wget -qO- http://127.0.0.1:5001/status")));
});

test("a container that starts and then crashes fails readiness", () => {
    const time = clock(); let inspections = 0;
    const docker = args => {
        if (args[1] !== "inspect") return "ok";
        inspections += 1;
        return JSON.stringify({ State: inspections < 3 ? { Running: true, Status: "running" } : { Running: false, Status: "exited" } });
    };
    assert.equal(sidecar.waitReady("dockge", { ...time, docker, stableMs: 5_000, timeoutMs: 10_000, pollMs: 1_000 }), false);
});

test("a running process with an unavailable status endpoint is rejected", () => {
    const time = clock();
    const docker = args => { if (args[1] === "inspect") return JSON.stringify({ State: { Running: true, Status: "running" } }); throw new Error("not ready"); };
    assert.equal(sidecar.waitReady("dockge", { ...time, docker, stableMs: 2_000, timeoutMs: 4_000, pollMs: 1_000 }), false);
});

test("Docker API fallback pulls the immutable GHCR target before container creation", () => {
    process.env.SELF_UPDATE_ALLOW_TEST_IMAGES = "";
    const image = `ghcr.io/aerya/dockge-enhanced@sha256:${"a".repeat(64)}`;
    const calls = [];
    sidecar.ensureTargetImage(image, {
        docker: (args, options) => {
            calls.push({ args, options });
            return "";
        },
    });
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0].args, [ "image", "pull", image ]);
    assert.equal(calls[0].options.timeout, 600_000);
});

test("test images do not trigger a registry pull", () => {
    process.env.SELF_UPDATE_ALLOW_TEST_IMAGES = "dockge-enhanced:test-v2";
    let called = false;
    sidecar.ensureTargetImage("dockge-enhanced:test-v2", {
        docker: () => { called = true; return ""; },
    });
    assert.equal(called, false);
});

test("Compose keeps the original absolute project directory and relative bind semantics", () => {
    const work = path.join(root, "relative-bind"); fs.mkdirSync(work, { recursive: true });
    const composeFile = path.join(work, "compose.yaml"); fs.writeFileSync(composeFile, "services:\n  dockge:\n    volumes:\n      - ./data:/app/data\n");
    process.env.SELF_UPDATE_COMPOSE_DIR = work;
    process.env.SELF_UPDATE_ALLOW_TEST_IMAGES = "dockge-enhanced:test-v2";
    const calls = [];
    sidecar.composeUpdate({ id: "a".repeat(32), compose: { workingDir: work, configFiles: [ composeFile ], project: "test", service: "dockge" } }, "dockge-enhanced:test-v2", { docker: args => { calls.push(args); return ""; } });
    const up = calls.find(args => args.includes("up"));
    assert.deepEqual(up.slice(0, 4), [ "compose", "--project-directory", work, "-p" ]);
    assert.ok(up.includes(composeFile));
    assert.equal(up.includes("/compose"), false);
});

function signedPlan(overrides = {}) {
    const id = crypto.randomBytes(16).toString("hex");
    const plan = { version: 1, id, issuedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 60_000).toISOString(), targetContainerId: "container-id", targetContainerName: "dockge-test", targetImage: "dockge-enhanced:test-v2", previousImage: "dockge-enhanced:test-v1", previousImageId: `sha256:${"1".repeat(64)}`, allowedRepository: "aerya/dockge-enhanced", recoveryFile: `${id}.json`, ...overrides };
    process.env.SELF_UPDATE_TARGET_CONTAINER_ID = plan.targetContainerId;
    process.env.SELF_UPDATE_TARGET_CONTAINER_NAME = plan.targetContainerName;
    const secret = Buffer.alloc(32, 7); fs.writeFileSync(path.join(root, "plan.key"), secret);
    const planPath = path.join(root, `${id}.json`);
    fs.writeFileSync(planPath, JSON.stringify({ plan, signature: crypto.createHmac("sha256", secret).update(JSON.stringify(plan)).digest("hex") }));
    return { plan, planPath };
}

test("expired plans and mismatched repositories are rejected and valid plans cannot be replayed", () => {
    process.env.SELF_UPDATE_ALLOW_TEST_IMAGES = "";
    process.env.SELF_UPDATE_ALLOWED_REPOSITORY = "aerya/dockge-enhanced";
    const expired = signedPlan({ targetImage: `ghcr.io/aerya/dockge-enhanced@sha256:${"a".repeat(64)}`, expiresAt: new Date(Date.now() - 1).toISOString() });
    assert.throws(() => sidecar.readAndClaimPlan(expired.planPath), /expired/);
    const foreign = signedPlan({ targetImage: `ghcr.io/foreign/dockge-enhanced@sha256:${"b".repeat(64)}` });
    assert.throws(() => sidecar.readAndClaimPlan(foreign.planPath), /repository/);
    const otherContainer = signedPlan({ targetImage: `ghcr.io/aerya/dockge-enhanced@sha256:${"d".repeat(64)}` });
    process.env.SELF_UPDATE_TARGET_CONTAINER_NAME = "another-container";
    assert.throws(() => sidecar.readAndClaimPlan(otherContainer.planPath), /authorized container/);
    const valid = signedPlan({ targetImage: `ghcr.io/aerya/dockge-enhanced@sha256:${"c".repeat(64)}` });
    sidecar.readAndClaimPlan(valid.planPath);
    assert.throws(() => sidecar.readAndClaimPlan(valid.planPath), /ENOENT/);
});

test("failed readiness rolls back and persists a deduplicatable terminal result", async () => {
    process.env.SELF_UPDATE_ALLOW_TEST_IMAGES = "dockge-enhanced:test-v2";
    const work = path.join(root, "rollback"); fs.mkdirSync(work, { recursive: true });
    const composeFile = path.join(work, "compose.yaml"); fs.writeFileSync(composeFile, "services:\n  dockge:\n    image: dockge-enhanced:test-v1\n");
    process.env.SELF_UPDATE_COMPOSE_DIR = work;
    const { plan, planPath } = signedPlan({ compose: { workingDir: work, configFiles: [ composeFile ], project: "test", service: "dockge" } });
    fs.mkdirSync(path.join(root, "recovery"), { recursive: true });
    fs.writeFileSync(path.join(root, "recovery", plan.recoveryFile), JSON.stringify({ id: plan.id, targetContainerId: plan.targetContainerId, targetContainerName: plan.targetContainerName, previousImage: plan.previousImage, previousImageId: plan.previousImageId, config: {}, hostConfig: {}, endpointsConfig: {} }));
    let phase = "old"; const time = clock();
    const docker = args => {
        if (args[1] === "inspect") return JSON.stringify({ Id: "container-id", Name: "/dockge-test", Config: { Image: phase === "new" ? "dockge-enhanced:test-v2" : "dockge-enhanced:test-v1" }, State: { Running: true, Status: "running" } });
        if (args.includes("up")) { phase = phase === "old" ? "new" : "old"; return ""; }
        if (args.includes("wget")) { if (phase === "new") throw new Error("not ready"); return "ok"; }
        return "";
    };
    const result = await sidecar.run({ planPath, docker, ...time, stableMs: 2_000, timeoutMs: 4_000, pollMs: 1_000 });
    assert.equal(result, "rolled-back");
    const status = JSON.parse(fs.readFileSync(path.join(root, "status.json")));
    assert.equal(status.state, "rolled-back"); assert.equal(status.notificationPending, true); assert.equal(status.rollbackAttempted, true);
    assert.equal(fs.existsSync(`${planPath}.claimed`), false);
    assert.equal(fs.existsSync(path.join(root, `${plan.id}.override.yaml`)), false);
});

test("a Compose creation failure restores the previous image without inspecting a missing replacement", async () => {
    process.env.SELF_UPDATE_ALLOW_TEST_IMAGES = "dockge-enhanced:test-v2";
    const work = path.join(root, "missing-replacement"); fs.mkdirSync(work, { recursive: true });
    const composeFile = path.join(work, "compose.yaml"); fs.writeFileSync(composeFile, "services:\n  dockge:\n    image: dockge-enhanced:test-v1\n");
    process.env.SELF_UPDATE_COMPOSE_DIR = work;
    const { plan, planPath } = signedPlan({ compose: { workingDir: work, configFiles: [ composeFile ], project: "test", service: "dockge" } });
    fs.mkdirSync(path.join(root, "recovery"), { recursive: true });
    fs.writeFileSync(path.join(root, "recovery", plan.recoveryFile), JSON.stringify({ id: plan.id, targetContainerId: plan.targetContainerId, targetContainerName: plan.targetContainerName, previousImage: plan.previousImage, previousImageId: plan.previousImageId, config: {}, hostConfig: {}, endpointsConfig: {} }));
    let upCalls = 0; const time = clock();
    const docker = args => {
        if (args[1] === "inspect") return JSON.stringify({ Id: "container-id", Name: "/dockge-test", Config: { Image: "dockge-enhanced:test-v1" }, State: { Running: true, Status: "running" } });
        if (args.includes("up")) { upCalls += 1; if (upCalls === 1) throw new Error("replacement creation failed"); return ""; }
        if (args.includes("wget")) return "ok";
        return "";
    };
    const result = await sidecar.run({ planPath, docker, ...time, stableMs: 2_000, timeoutMs: 4_000, pollMs: 1_000 });
    assert.equal(result, "rolled-back");
    assert.equal(upCalls, 2);
    const status = JSON.parse(fs.readFileSync(path.join(root, "status.json")));
    assert.equal(status.state, "rolled-back");
});

test("Compose rollback failure falls back to the signed recovery snapshot when the target container no longer exists", async () => {
    process.env.SELF_UPDATE_ALLOW_TEST_IMAGES = "dockge-enhanced:test-v2";
    const work = path.join(root, "snapshot-fallback"); fs.mkdirSync(work, { recursive: true });
    const composeFile = path.join(work, "compose.yaml"); fs.writeFileSync(composeFile, "services:\n  dockge:\n    image: dockge-enhanced:test-v1\n");
    process.env.SELF_UPDATE_COMPOSE_DIR = work;
    const { plan, planPath } = signedPlan({ compose: { workingDir: work, configFiles: [ composeFile ], project: "test", service: "dockge" } });
    fs.mkdirSync(path.join(root, "recovery"), { recursive: true });
    fs.writeFileSync(path.join(root, "recovery", plan.recoveryFile), JSON.stringify({ id: plan.id, targetContainerId: plan.targetContainerId, targetContainerName: plan.targetContainerName, previousImage: plan.previousImage, previousImageId: plan.previousImageId, config: {}, hostConfig: {}, endpointsConfig: {} }));
    const time = clock(); let initialInspect = true; let recovered = false; const apiCalls = [];
    const docker = args => {
        if (args[1] === "inspect") {
            if (initialInspect) { initialInspect = false; return JSON.stringify({ Id: "container-id", Name: "/dockge-test", Config: { Image: "dockge-enhanced:test-v1" }, State: { Running: true, Status: "running" } }); }
            if (!recovered) throw new Error("No such container: dockge-test");
            return JSON.stringify({ Id: "recovered-id", Name: "/dockge-test", Config: { Image: plan.previousImageId }, State: { Running: true, Status: "running" } });
        }
        if (args.includes("up")) throw new Error("compose create failed");
        if (args.includes("wget")) return "ok";
        return "";
    };
    const dockerApi = async (method, requestPath) => {
        apiCalls.push([ method, requestPath ]);
        if (method === "POST" && requestPath.startsWith("/containers/create")) { recovered = true; return JSON.stringify({ Id: "recovered-id" }); }
        return "";
    };
    const result = await sidecar.run({ planPath, docker, dockerApi, ...time, stableMs: 2_000, timeoutMs: 4_000, pollMs: 1_000 });
    assert.equal(result, "rolled-back");
    assert.ok(apiCalls.some(([ method, requestPath ]) => method === "POST" && requestPath.startsWith("/containers/create?name=dockge-test")));
    const status = JSON.parse(fs.readFileSync(path.join(root, "status.json")));
    assert.match(status.message, /restored from the recovery snapshot/);
});

test("snapshot recovery tolerates an already deleted container and removes any replacement by name", async () => {
    const calls = [];
    const recovery = { targetContainerName: "dockge-test", config: {}, hostConfig: {}, endpointsConfig: {} };
    const dockerApi = async (method, requestPath, body, options = {}) => {
        calls.push({ method, requestPath, options });
        if (method === "POST" && requestPath.startsWith("/containers/create")) return JSON.stringify({ Id: "restored-id" });
        return "";
    };
    await sidecar.snapshotCreate(recovery, null, `sha256:${"2".repeat(64)}`, { dockerApi });
    assert.ok(calls.some(call => call.requestPath === "/containers/dockge-test/stop?t=30" && call.options.allow404 === true));
    assert.ok(calls.some(call => call.requestPath === "/containers/dockge-test?force=1" && call.options.allow404 === true));
    assert.ok(calls.some(call => call.requestPath === "/containers/create?name=dockge-test"));
});
