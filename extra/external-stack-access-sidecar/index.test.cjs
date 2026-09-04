"use strict";
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const root = fs.mkdtempSync(path.join(os.tmpdir(), "dockge-compose-helper-test-"));
process.env.EXTERNAL_STACK_ACCESS_STATE_DIR = root;
const helper = require("./index.cjs");
test.after(() => fs.rmSync(root, { recursive: true, force: true }));

function composePlan(work, overrides = {}) {
    return {
        version: 1,
        action: "external-stack-access",
        id: crypto.randomBytes(16).toString("hex"),
        issuedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
        targetContainerId: "container-id",
        targetContainerName: "dockge-test",
        previousImage: "dockge-enhanced:test",
        previousImageId: `sha256:${"1".repeat(64)}`,
        externalProject: "external-test",
        requestedPath: "/opt/external-test",
        addBind: true,
        compose: { workingDir: work, configFiles: [ path.join(work, "compose.yaml") ], envFiles: [], project: "dockge", service: "dockge" },
        ...overrides,
    };
}

function signedPlan(plan) {
    process.env.EXTERNAL_STACK_ACCESS_COMPOSE_DIR = plan.compose.workingDir;
    process.env.EXTERNAL_STACK_ACCESS_TARGET_ID = plan.targetContainerId;
    process.env.EXTERNAL_STACK_ACCESS_TARGET_NAME = plan.targetContainerName;
    const secret = Buffer.alloc(32, 9);
    fs.writeFileSync(path.join(root, "plan.key"), secret);
    const planPath = path.join(root, `${plan.id}.json`);
    const signature = crypto.createHmac("sha256", secret).update(JSON.stringify(plan)).digest("hex");
    fs.writeFileSync(planPath, JSON.stringify({ plan, signature }));
    return planPath;
}

function clock() {
    let value = 0;
    return { now: () => value, sleep: ms => { value += ms; } };
}

test("adds the exact host bind and allowlist entry without dropping existing configuration", () => {
    const work = path.join(root, "patch");
    fs.mkdirSync(work, { recursive: true });
    const raw = "services:\n  dockge:\n    image: dockge-enhanced:test\n    environment:\n      DOCKGE_STACKS_DIR: /opt/stacks\n    volumes:\n      - ./data:/app/data\n";
    const patched = helper.patchDocument(raw, composePlan(work));
    assert.match(patched, /DOCKGE_STACKS_DIR: \/opt\/stacks/);
    assert.match(patched, /DOCKGE_EXTERNAL_STACKS_ALLOWED_PATHS: \/opt\/external-test/);
    assert.match(patched, /type: bind/);
    assert.match(patched, /source: \/opt\/external-test/);
    assert.match(patched, /target: \/opt\/external-test/);
    assert.match(patched, /\.\/data:\/app\/data/);
});

test("an already visible path only updates the allowlist", () => {
    const work = path.join(root, "allowlist-only");
    fs.mkdirSync(work, { recursive: true });
    const raw = "services:\n  dockge:\n    environment:\n      DOCKGE_EXTERNAL_STACKS_ALLOWED_PATHS: /opt/first\n";
    const patched = helper.patchDocument(raw, composePlan(work, { addBind: false }));
    assert.match(patched, /\/opt\/first,\/opt\/external-test/);
    assert.doesNotMatch(patched, /volumes:/);
});


test("patches only the first Compose file that defines the Dockge service", () => {
    const work = path.join(root, "multi-compose");
    fs.mkdirSync(work, { recursive: true });
    const base = path.join(work, "compose.yaml");
    const override = path.join(work, "compose.override.yaml");
    fs.writeFileSync(base, "services:\n  dockge:\n    image: dockge-enhanced:test\n");
    fs.writeFileSync(override, "services:\n  dockge:\n    restart: unless-stopped\n");
    const envFile = path.join(work, "dockge.env");
    fs.writeFileSync(envFile, "TAG=test\n");
    const plan = composePlan(work, { compose: { workingDir: work, configFiles: [ base, override ], envFiles: [ envFile ], project: "dockge", service: "dockge" } });
    const calls = [];
    helper.applyComposeAccess(plan, { docker: args => { calls.push(args); return ""; } });
    assert.match(fs.readFileSync(base, "utf8"), /DOCKGE_EXTERNAL_STACKS_ALLOWED_PATHS/);
    assert.doesNotMatch(fs.readFileSync(override, "utf8"), /DOCKGE_EXTERNAL_STACKS_ALLOWED_PATHS/);
    assert.deepEqual(calls[0].slice(0, 10), [ "compose", "--project-directory", work, "-p", "dockge", "--env-file", envFile, "-f", base, "-f" ]);
    assert.ok(calls[0].includes(override));
});

test("verifies that the recreated container exposes every authorized path", () => {
    const plan = composePlan("/tmp", {
        requestedPaths: [
            { path: "/opt/external-test", addBind: true },
            { path: "/mnt/app-data", addBind: true },
        ],
    });
    assert.equal(helper.accessApplied(plan, {
        Config: { Env: [ "DOCKGE_EXTERNAL_STACKS_ALLOWED_PATHS=/opt/external-test,/mnt/app-data" ] },
        Mounts: [
            { Type: "bind", Source: "/opt/external-test", Destination: "/opt/external-test" },
            { Type: "bind", Source: "/mnt/app-data", Destination: "/mnt/app-data" },
        ],
    }), true);
    assert.equal(helper.accessApplied(plan, {
        Config: { Env: [ "DOCKGE_EXTERNAL_STACKS_ALLOWED_PATHS=/opt/external-test,/mnt/app-data" ] },
        Mounts: [ { Type: "bind", Source: "/opt/external-test", Destination: "/opt/external-test" } ],
    }), false);
});

test("interpolated allowlists and forged or expired plans are rejected", () => {
    const work = path.join(root, "policy");
    fs.mkdirSync(work, { recursive: true });
    const composeFile = path.join(work, "compose.yaml");
    fs.writeFileSync(composeFile, "services:\n  dockge:\n    environment:\n      DOCKGE_EXTERNAL_STACKS_ALLOWED_PATHS: ${EXTERNAL_PATHS}\n");
    assert.throws(() => helper.patchDocument(fs.readFileSync(composeFile, "utf8"), composePlan(work)), /interpolation/);

    fs.writeFileSync(composeFile, "services:\n  dockge:\n    image: dockge-enhanced:test\n");
    const expired = composePlan(work, { expiresAt: new Date(Date.now() - 1).toISOString() });
    assert.throws(() => helper.readAndClaimPlan(signedPlan(expired)), /expired/);
    const foreignTarget = composePlan(work);
    const foreignPath = signedPlan(foreignTarget);
    process.env.EXTERNAL_STACK_ACCESS_TARGET_NAME = "another-container";
    assert.throws(() => helper.readAndClaimPlan(foreignPath), /authorized container/);
});

test("failed readiness restores the exact Compose backup and recreates the previous service", async () => {
    const work = path.join(root, "rollback");
    fs.mkdirSync(work, { recursive: true });
    const composeFile = path.join(work, "compose.yaml");
    const original = "services:\n  dockge:\n    image: dockge-enhanced:test\n";
    fs.writeFileSync(composeFile, original);
    const plan = composePlan(work);
    const planPath = signedPlan(plan);
    let phase = "old";
    let recreates = 0;
    const docker = args => {
        if (args[1] === "inspect") return JSON.stringify({ Id: "container-id", Name: "/dockge-test", Image: plan.previousImageId, State: { Running: true, Status: "running" } });
        if (args.includes("up")) {
            recreates += 1;
            phase = recreates === 1 ? "new" : "old";
            return "";
        }
        if (args.includes("wget")) {
            if (phase === "new") throw new Error("not ready");
            return "ok";
        }
        return "";
    };
    const result = await helper.run({ planPath, docker, ...clock(), stableMs: 2_000, timeoutMs: 4_000, pollMs: 1_000 });
    assert.equal(result, "rolled-back");
    assert.equal(recreates, 2);
    assert.equal(fs.readFileSync(composeFile, "utf8"), original);
    assert.equal(JSON.parse(fs.readFileSync(path.join(root, "status.json"))).state, "rolled-back");
    assert.equal(fs.statSync(path.join(root, "recovery")).uid, fs.statSync(root).uid);
});
