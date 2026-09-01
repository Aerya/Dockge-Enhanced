"use strict";
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const YAML = require("yaml");

const stateDir = process.env.EXTERNAL_STACK_ACCESS_STATE_DIR || "/state/external-stack-access";
const keyPath = path.join(stateDir, "plan.key");
const statusPath = path.join(stateDir, "status.json");
const terminalStates = new Set([ "succeeded", "failed", "rolled-back", "rollback-failed" ]);

function ensureDirectory(directory) {
    if (fs.existsSync(directory)) return;
    const parent = path.dirname(directory);
    ensureDirectory(parent);
    const ownership = fs.statSync(parent);
    fs.mkdirSync(directory, { mode: 0o700 });
    fs.chownSync(directory, ownership.uid, ownership.gid);
}

function atomicWrite(file, content, mode = 0o600) {
    ensureDirectory(path.dirname(file));
    let ownership = null;
    try {
        const existing = fs.statSync(file);
        ownership = { uid: existing.uid, gid: existing.gid };
    } catch {
        try {
            const parent = fs.statSync(path.dirname(file));
            ownership = { uid: parent.uid, gid: parent.gid };
        } catch {
            // Root-owned fallback for a brand-new state file.
        }
    }
    const temporary = path.join(path.dirname(file), `.${path.basename(file)}.${process.pid}.${crypto.randomBytes(6).toString("hex")}.tmp`);
    const fd = fs.openSync(temporary, "wx", mode);
    try {
        fs.writeFileSync(fd, content);
        fs.fchmodSync(fd, mode);
        if (ownership) fs.fchownSync(fd, ownership.uid, ownership.gid);
        fs.fsyncSync(fd);
    } finally {
        fs.closeSync(fd);
    }
    fs.renameSync(temporary, file);
}

function atomicWriteJson(file, value) {
    atomicWrite(file, `${JSON.stringify(value, null, 2)}\n`);
}

function writeStatus(state, message, rollbackAttempted, plan) {
    atomicWriteJson(statusPath, {
        id: plan?.id || "",
        project: plan?.externalProject || "",
        requestedPath: plan?.requestedPath || "",
        state,
        message,
        startedAt: plan?.issuedAt || null,
        finishedAt: terminalStates.has(state) ? new Date().toISOString() : null,
        rollbackAttempted: rollbackAttempted === true,
    });
}

function safeName(value) {
    return typeof value === "string" && /^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(value);
}

function inside(root, candidate) {
    if (!path.isAbsolute(root) || !path.isAbsolute(candidate)) return false;
    const relative = path.relative(root, candidate);
    return relative === "" || (relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

function requireRegularFile(file, label) {
    const stat = fs.lstatSync(file);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`${label} must be a regular file`);
    return stat;
}

function validateCompose(compose) {
    if (!safeName(compose?.project) || !safeName(compose?.service) || !path.isAbsolute(compose?.workingDir) || process.env.EXTERNAL_STACK_ACCESS_COMPOSE_DIR !== compose.workingDir) throw new Error("Invalid Dockge-Enhanced Compose context");
    const root = fs.realpathSync(compose.workingDir);
    if (!Array.isArray(compose.configFiles) || compose.configFiles.length === 0) throw new Error("Dockge-Enhanced Compose config is missing");
    for (const file of compose.configFiles) {
        if (!inside(compose.workingDir, file) || !inside(root, fs.realpathSync(file))) throw new Error("Compose config path escapes its working directory");
        requireRegularFile(file, "Compose config");
    }
}

function readAndClaimPlan(planPath = process.env.EXTERNAL_STACK_ACCESS_PLAN) {
    if (!planPath || path.dirname(planPath) !== stateDir || !/^[a-f0-9]{32}\.json$/.test(path.basename(planPath))) throw new Error("Invalid external-stack access plan path");
    requireRegularFile(planPath, "External-stack access plan");
    requireRegularFile(keyPath, "External-stack access plan key");
    const payload = JSON.parse(fs.readFileSync(planPath, "utf8"));
    const secret = fs.readFileSync(keyPath);
    const expected = crypto.createHmac("sha256", secret).update(JSON.stringify(payload.plan)).digest("hex");
    if (!payload.plan || typeof payload.signature !== "string" || payload.signature.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(payload.signature))) throw new Error("External-stack access plan signature is invalid");
    const plan = payload.plan;
    if (plan.version !== 1 || plan.action !== "external-stack-access" || !/^[a-f0-9]{32}$/.test(plan.id) || path.basename(planPath) !== `${plan.id}.json` || !Number.isFinite(Date.parse(plan.expiresAt)) || Date.parse(plan.expiresAt) <= Date.now()) throw new Error("External-stack access plan is expired or malformed");
    if (!safeName(plan.targetContainerName) || !safeName(plan.externalProject)) throw new Error("External-stack access target is invalid");
    if (process.env.EXTERNAL_STACK_ACCESS_TARGET_ID !== plan.targetContainerId || process.env.EXTERNAL_STACK_ACCESS_TARGET_NAME !== plan.targetContainerName) throw new Error("External-stack access target does not match the authorized container");
    if (!path.isAbsolute(plan.requestedPath) || path.resolve(plan.requestedPath) !== plan.requestedPath || plan.requestedPath === "/") throw new Error("Requested external path is invalid");
    if (typeof plan.addBind !== "boolean") throw new Error("Requested external-path operation is invalid");
    validateCompose(plan.compose);
    const claimed = `${planPath}.claimed`;
    fs.renameSync(planPath, claimed);
    return { plan, claimed };
}

function docker(args, options = {}) {
    return execFileSync("docker", args, { encoding: "utf8", stdio: [ "ignore", "pipe", "pipe" ], ...options });
}

function inspect(name, deps = {}) {
    return JSON.parse((deps.docker || docker)([ "container", "inspect", name, "--format", "{{json .}}" ]));
}

function applicationReady(name, inspected, deps = {}) {
    const state = inspected.State || {};
    if (!state.Running || [ "exited", "dead", "restarting" ].includes(state.Status)) return false;
    if (state.Health) return state.Health.Status === "healthy";
    try {
        (deps.docker || docker)([ "container", "exec", name, "wget", "-qO-", "http://127.0.0.1:5001/status" ], { timeout: 10_000 });
        return true;
    } catch {
        return false;
    }
}

function waitReady(name, options = {}) {
    const now = options.now || Date.now;
    const sleep = options.sleep || ((ms) => execFileSync("sleep", [ String(ms / 1000) ]));
    const deadline = now() + (options.timeoutMs ?? 180_000);
    const stableMs = options.stableMs ?? 15_000;
    const pollMs = options.pollMs ?? 2_000;
    let readySince = null;
    while (now() < deadline) {
        try {
            const current = inspect(name, options);
            if ([ "exited", "dead", "restarting" ].includes(current.State?.Status)) return false;
            if (applicationReady(name, current, options)) {
                if (readySince === null) readySince = now();
                if (now() - readySince >= stableMs) return true;
            } else {
                readySince = null;
            }
        } catch {
            readySince = null;
        }
        sleep(pollMs);
    }
    return false;
}

function mergeAllowedPath(current, requestedPath) {
    const value = current == null ? "" : String(current);
    if (value.includes("${") || value.includes("$")) throw new Error("DOCKGE_EXTERNAL_STACKS_ALLOWED_PATHS uses interpolation and must be edited manually");
    const roots = value.split(/[\n,]/).map((entry) => entry.trim()).filter(Boolean);
    if (!roots.includes(requestedPath)) roots.push(requestedPath);
    return roots.join(",");
}

function bindMount(entry) {
    if (typeof entry === "string") {
        const parts = entry.split(":");
        return parts.length >= 2 ? { source: parts[0], target: parts[1] } : null;
    }
    if (entry && typeof entry === "object" && entry.type === "bind") return { source: String(entry.source || ""), target: String(entry.target || "") };
    return null;
}

function patchDocument(raw, plan) {
    const doc = YAML.parseDocument(raw);
    if (doc.errors.length > 0) throw new Error(`Invalid Compose YAML: ${doc.errors[0].message}`);
    const service = doc.getIn([ "services", plan.compose.service ], true);
    if (!YAML.isMap(service)) return null;

    if (plan.addBind) {
        let volumes = service.get("volumes", true);
        if (volumes == null) {
            service.set("volumes", doc.createNode([]));
            volumes = service.get("volumes", true);
        }
        if (!YAML.isSeq(volumes)) throw new Error("Dockge-Enhanced service volumes must be a list");
        const covered = volumes.items.some((item) => {
            const mount = bindMount(item?.toJSON());
            return mount?.source && mount.source === mount.target && inside(mount.target, plan.requestedPath);
        });
        if (!covered) volumes.add(`${plan.requestedPath}:${plan.requestedPath}`);
    }

    let environment = service.get("environment", true);
    if (environment == null) {
        service.set("environment", doc.createNode({}));
        environment = service.get("environment", true);
    }
    if (YAML.isMap(environment)) {
        environment.set("DOCKGE_EXTERNAL_STACKS_ALLOWED_PATHS", mergeAllowedPath(environment.get("DOCKGE_EXTERNAL_STACKS_ALLOWED_PATHS"), plan.requestedPath));
    } else if (YAML.isSeq(environment)) {
        const prefix = "DOCKGE_EXTERNAL_STACKS_ALLOWED_PATHS=";
        const index = environment.items.findIndex((item) => String(item?.toJSON() || "").startsWith(prefix));
        const current = index >= 0 ? String(environment.items[index].toJSON()).slice(prefix.length) : "";
        const updated = `${prefix}${mergeAllowedPath(current, plan.requestedPath)}`;
        if (index >= 0) environment.set(index, updated);
        else environment.add(updated);
    } else {
        throw new Error("Dockge-Enhanced service environment must be a map or list");
    }
    return doc.toString({ lineWidth: 0 });
}

function composeArgs(compose) {
    const args = [ "compose", "--project-directory", compose.workingDir, "-p", compose.project ];
    for (const file of compose.configFiles) args.push("-f", file);
    return args;
}

function backupCompose(plan) {
    const files = plan.compose.configFiles.map((file) => {
        const stat = requireRegularFile(file, "Compose config");
        const content = fs.readFileSync(file);
        if (content.length > 4 * 1024 * 1024) throw new Error("Compose config is too large to back up safely");
        return { file, mode: stat.mode & 0o777, content: content.toString("base64") };
    });
    const backupPath = path.join(stateDir, "recovery", `${plan.id}.json`);
    atomicWriteJson(backupPath, { version: 1, id: plan.id, files });
    return { backupPath, files };
}

function restoreCompose(backup) {
    for (const item of backup.files) atomicWrite(item.file, Buffer.from(item.content, "base64"), item.mode);
}

function applyComposeAccess(plan, deps = {}) {
    let patchedFile = "";
    for (const file of plan.compose.configFiles) {
        const raw = fs.readFileSync(file, "utf8");
        const patched = patchDocument(raw, plan);
        if (patched !== null) {
            if (patchedFile) throw new Error("Dockge-Enhanced service is defined in multiple Compose files");
            patchedFile = file;
            const stat = fs.statSync(file);
            atomicWrite(file, patched, stat.mode & 0o777);
        }
    }
    if (!patchedFile) throw new Error("Dockge-Enhanced service was not found in its Compose files");
    const base = composeArgs(plan.compose);
    (deps.docker || docker)([ ...base, "config", "--quiet" ], { timeout: 60_000 });
    (deps.docker || docker)([ ...base, "up", "-d", "--no-deps", plan.compose.service ], { timeout: 180_000 });
}

async function run(deps = {}) {
    let claimed;
    let plan;
    try {
        ({ plan, claimed } = readAndClaimPlan(deps.planPath));
        const delay = Math.min(5_000, Math.max(0, Number(process.env.EXTERNAL_STACK_ACCESS_START_DELAY_MS) || 0));
        if (delay) (deps.sleep || ((ms) => execFileSync("sleep", [ String(ms / 1000) ])))(delay);
        const inspected = inspect(plan.targetContainerId, deps);
        if (inspected.Id !== plan.targetContainerId || String(inspected.Name || "").replace(/^\//, "") !== plan.targetContainerName || inspected.Image !== plan.previousImageId) throw new Error("External-stack access plan does not match the running Dockge-Enhanced container");
        const backup = backupCompose(plan);
        writeStatus("updating", "Updating the Dockge-Enhanced Compose configuration", false, plan);
        let updateError;
        try {
            applyComposeAccess(plan, deps);
            writeStatus("waiting-health", "Waiting for Dockge-Enhanced to become ready", false, plan);
            if (waitReady(plan.targetContainerName, deps)) {
                writeStatus("succeeded", "External path added to Dockge-Enhanced", false, plan);
                return "succeeded";
            }
            updateError = new Error("Dockge-Enhanced did not remain ready");
        } catch (error) {
            updateError = error;
        }
        writeStatus("rolling-back", `Configuration failed; restoring the Compose backup: ${updateError instanceof Error ? updateError.message : String(updateError)}`, true, plan);
        try {
            restoreCompose(backup);
            const base = composeArgs(plan.compose);
            (deps.docker || docker)([ ...base, "config", "--quiet" ], { timeout: 60_000 });
            (deps.docker || docker)([ ...base, "up", "-d", "--no-deps", plan.compose.service ], { timeout: 180_000 });
            if (waitReady(plan.targetContainerName, deps)) {
                writeStatus("rolled-back", `Configuration failed and the previous Compose was restored: ${updateError instanceof Error ? updateError.message : String(updateError)}`, true, plan);
                return "rolled-back";
            }
            throw new Error("Restored Dockge-Enhanced did not become ready");
        } catch (rollbackError) {
            writeStatus("rollback-failed", `Configuration and rollback failed: ${rollbackError instanceof Error ? rollbackError.message : String(rollbackError)}`, true, plan);
            return "rollback-failed";
        }
    } catch (error) {
        writeStatus("failed", error instanceof Error ? error.message : String(error), false, plan);
        return "failed";
    } finally {
        if (claimed) fs.rmSync(claimed, { force: true });
    }
}

module.exports = { applicationReady, applyComposeAccess, atomicWrite, backupCompose, bindMount, ensureDirectory, inside, mergeAllowedPath, patchDocument, readAndClaimPlan, restoreCompose, run, waitReady, writeStatus };
if (require.main === module) run().then((result) => {
    if ([ "failed", "rollback-failed" ].includes(result)) process.exitCode = 1;
}).catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
