"use strict";
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const http = require("http");
const https = require("https");
const { execFileSync } = require("child_process");
const stateDir = process.env.SELF_UPDATE_STATE_DIR || "/state/self-update";
const keyPath = path.join(stateDir, "plan.key");
const socketPath = process.env.DOCKGE_DOCKER_SOCKET || "/var/run/docker.sock";
const terminalStates = new Set([ "succeeded", "failed", "rolled-back", "rollback-failed" ]);

function atomicWriteJson(file, value) {
    fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
    const temporary = path.join(path.dirname(file), `.${path.basename(file)}.${process.pid}.${crypto.randomBytes(6).toString("hex")}.tmp`);
    const fd = fs.openSync(temporary, "wx", 0o600);
    try { fs.writeFileSync(fd, `${JSON.stringify(value, null, 2)}\n`); fs.fsyncSync(fd); }
    finally { fs.closeSync(fd); }
    fs.renameSync(temporary, file);
    fs.chmodSync(file, 0o600);
}
function writeStatus(state, message, rollbackAttempted, plan, stage) {
    const statusPath = path.join(stateDir, "status.json");
    let previous = {};
    try { previous = JSON.parse(fs.readFileSync(statusPath, "utf8")); } catch { /* first status write */ }

    const now = new Date().toISOString();
    const history = Array.isArray(previous.stageHistory)
        ? previous.stageHistory.map(entry => ({ ...entry }))
        : [];
    const currentStage = stage || previous.stage;
    let stageStartedAt = previous.stageStartedAt || now;

    if (currentStage && previous.stage !== currentStage) {
        const active = history[history.length - 1];
        if (active && !active.finishedAt) active.finishedAt = now;
        history.push({ stage: currentStage, startedAt: now, finishedAt: null });
        stageStartedAt = now;
    } else if (currentStage && history.length === 0) {
        history.push({ stage: currentStage, startedAt: stageStartedAt, finishedAt: null });
    }

    if (terminalStates.has(state)) {
        const active = history[history.length - 1];
        if (active && !active.finishedAt) active.finishedAt = now;
    }

    atomicWriteJson(statusPath, {
        id: plan?.id || previous.id || "",
        state,
        message,
        startedAt: previous.startedAt || plan?.issuedAt || null,
        finishedAt: terminalStates.has(state) ? now : null,
        targetImage: plan?.targetImage || previous.targetImage || "",
        rollbackAttempted: rollbackAttempted === true,
        stage: currentStage,
        stageStartedAt,
        stageHistory: history,
        notificationPending: terminalStates.has(state),
        notificationSentAt: null,
    });
}
function safeName(value) { return typeof value === "string" && /^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(value); }
function inside(root, candidate) {
    if (!path.isAbsolute(root) || !path.isAbsolute(candidate)) return false;
    const relative = path.relative(root, candidate);
    return relative === "" || (relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}
function imageRepository(image) {
    const match = String(image).match(/^ghcr\.io\/(.+?)(?::[a-z0-9._-]+|@sha256:[a-f0-9]{64})$/i);
    return match ? match[1].toLowerCase() : "";
}
function requireRegularFile(file, label) {
    const stat = fs.lstatSync(file);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`${label} must be a regular file`);
}
function validateCompose(compose) {
    if (!safeName(compose.project) || !safeName(compose.service) || !path.isAbsolute(compose.workingDir) || process.env.SELF_UPDATE_COMPOSE_DIR !== compose.workingDir) throw new Error("Invalid Compose self-update context");
    const root = fs.realpathSync(compose.workingDir);
    if (!Array.isArray(compose.configFiles) || compose.configFiles.length === 0) throw new Error("Compose config is missing");
    for (const file of compose.configFiles) {
        if (!inside(compose.workingDir, file) || !inside(root, fs.realpathSync(file)) || !fs.statSync(file).isFile()) throw new Error("Compose config path escapes its working directory");
    }
}
function readAndClaimPlan(planPath = process.env.SELF_UPDATE_PLAN) {
    if (!planPath || path.dirname(planPath) !== stateDir || !/^[a-f0-9]{32}\.json$/.test(path.basename(planPath))) throw new Error("Invalid self-update plan path");
    requireRegularFile(planPath, "Self-update plan");
    requireRegularFile(keyPath, "Self-update plan key");
    const payload = JSON.parse(fs.readFileSync(planPath, "utf8"));
    const secret = fs.readFileSync(keyPath);
    const expected = crypto.createHmac("sha256", secret).update(JSON.stringify(payload.plan)).digest("hex");
    if (!payload.plan || typeof payload.signature !== "string" || payload.signature.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(payload.signature))) throw new Error("Self-update plan signature is invalid");
    const plan = payload.plan;
    if (plan.version !== 1 || !/^[a-f0-9]{32}$/.test(plan.id) || path.basename(planPath) !== `${plan.id}.json` || !Number.isFinite(Date.parse(plan.expiresAt)) || Date.parse(plan.expiresAt) <= Date.now()) throw new Error("Self-update plan is expired or malformed");
    if (!safeName(plan.targetContainerName)) throw new Error("Invalid self-update target container");
    if (process.env.SELF_UPDATE_TARGET_CONTAINER_ID !== plan.targetContainerId || process.env.SELF_UPDATE_TARGET_CONTAINER_NAME !== plan.targetContainerName) throw new Error("Self-update target does not match the authorized container");
    const allowedTests = (process.env.SELF_UPDATE_ALLOW_TEST_IMAGES || "").split(",").map(value => value.trim()).filter(Boolean);
    const configuredRepository = (process.env.SELF_UPDATE_ALLOWED_REPOSITORY || "").trim().toLowerCase().replace(/^ghcr\.io\//, "");
    const testTarget = allowedTests.includes(plan.targetImage);
    if (!testTarget && (!configuredRepository || plan.allowedRepository !== configuredRepository || imageRepository(plan.targetImage) !== configuredRepository)) throw new Error("Self-update target repository is not allowed");
    if (!testTarget && !/@sha256:[a-f0-9]{64}$/i.test(plan.targetImage)) throw new Error("Production self-update target must use an immutable digest");
    if (!/^[a-f0-9]{32}\.json$/.test(plan.recoveryFile)) throw new Error("Invalid recovery snapshot path");
    if (plan.compose) validateCompose(plan.compose);
    const claimed = `${planPath}.claimed`;
    fs.renameSync(planPath, claimed);
    return { plan, claimed };
}
function docker(args, options = {}) { return execFileSync("docker", args, { encoding: "utf8", stdio: [ "ignore", "pipe", "pipe" ], ...options }); }
function waitForStart(plan, timeoutMs = 60_000) {
    const startFile = process.env.SELF_UPDATE_START_FILE;
    if (!startFile) return;
    if (path.dirname(startFile) !== stateDir || path.basename(startFile) !== `${plan.id}.start`) throw new Error("Invalid self-update sidecar start signal");
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        if (fs.existsSync(startFile)) return;
        execFileSync("sleep", [ "0.1" ]);
    }
    throw new Error("Updater sidecar network setup did not complete");
}
function ensureTargetImage(image, deps = {}) {
    const allowedTests = (process.env.SELF_UPDATE_ALLOW_TEST_IMAGES || "").split(",").map(value => value.trim()).filter(Boolean);
    if (allowedTests.includes(image)) return;
    if (!/^ghcr\.io\/.+@sha256:[a-f0-9]{64}$/i.test(image)) throw new Error("Production self-update target must use an immutable GHCR digest");
    console.log(`[SelfUpdateUpdater] Pull de l’image cible — ${image}`);
    (deps.docker || docker)([ "image", "pull", image ], { timeout: 600_000 });
    console.log(`[SelfUpdateUpdater] Image cible disponible localement — ${image}`);
}
function inspect(name, deps = {}) { return JSON.parse((deps.docker || docker)([ "container", "inspect", name, "--format", "{{json .}}" ])); }
function applicationReady(name, inspected, deps = {}) {
    const state = inspected.State || {};
    if (!state.Running || [ "exited", "dead", "restarting" ].includes(state.Status)) return false;
    if (state.Health) return state.Health.Status === "healthy";
    try { (deps.docker || docker)([ "container", "exec", name, "wget", "-qO-", "http://127.0.0.1:5001/status" ], { timeout: 10_000 }); return true; }
    catch { return false; }
}
function waitReady(name, options = {}) {
    const now = options.now || Date.now;
    const sleep = options.sleep || (ms => execFileSync("sleep", [ String(ms / 1000) ]));
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
            } else readySince = null;
        } catch { readySince = null; }
        sleep(pollMs);
    }
    return false;
}
function composeUpdate(plan, image, deps = {}) {
    validateCompose(plan.compose);
    // Docker Compose writes every -f path into permanent container labels. The file
    // must therefore exist on the Docker host even after this updater exits.
    const override = path.join(stateDir, `${plan.id}.override.yaml`);
    const hostStateDir = process.env.SELF_UPDATE_HOST_STATE_DIR;
    if (!hostStateDir || !path.isAbsolute(hostStateDir)) {
        throw new Error("The host-visible self-update state directory is required for Compose updates");
    }
    const hostOverride = path.join(hostStateDir, `${plan.id}.override.yaml`);
    atomicWriteJson(override, { services: { [plan.compose.service]: { image } } });
    const base = [ "compose", "--project-directory", plan.compose.workingDir, "-p", plan.compose.project ];
    for (const file of plan.compose.configFiles) base.push("-f", file);
    base.push("-f", hostOverride);
    const allowedTests = (process.env.SELF_UPDATE_ALLOW_TEST_IMAGES || "").split(",").filter(Boolean);
    if (!allowedTests.includes(image) && /^ghcr\.io\//i.test(image)) {
        deps.onStage?.("pull-target");
        (deps.docker || docker)([ ...base, "pull", plan.compose.service ], { timeout: 600_000 });
    }
    deps.onStage?.("replace-container");
    (deps.docker || docker)([ ...base, "up", "-d", "--no-deps", plan.compose.service ], { timeout: 180_000 });
    return override;
}
function dockerApi(method, requestPath, body, options = {}) {
    return new Promise((resolve, reject) => {
        const configuredHost = process.env.DOCKER_HOST;
        let requestOptions = { socketPath, path: requestPath, method, headers: body ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) } : undefined };
        let client = http;
        if (configuredHost?.startsWith("tcp://")) {
            const endpoint = new URL(configuredHost);
            requestOptions = { ...requestOptions, hostname: endpoint.hostname, port: endpoint.port, socketPath: undefined };
            if (process.env.DOCKER_TLS_VERIFY) {
                client = https;
                const certPath = process.env.DOCKER_CERT_PATH;
                if (!certPath) throw new Error("DOCKER_TLS_VERIFY requires DOCKER_CERT_PATH in the updater sidecar");
                requestOptions = { ...requestOptions,
                    ca: fs.readFileSync(path.join(certPath, "ca.pem")),
                    cert: fs.readFileSync(path.join(certPath, "cert.pem")),
                    key: fs.readFileSync(path.join(certPath, "key.pem")),
                };
            }
        }
        const req = client.request(requestOptions, res => {
            let raw = ""; res.on("data", chunk => { raw += chunk; });
            res.on("end", () => {
                if (res.statusCode >= 200 && res.statusCode < 300) return resolve(raw);
                if (options.allow404 && res.statusCode === 404) return resolve("");
                reject(new Error(`Docker API ${method} ${requestPath}: ${res.statusCode} ${raw.slice(0, 500)}`));
            });
        });
        req.on("error", reject); if (body) req.write(body); req.end();
    });
}
async function snapshotCreate(recovery, currentId, image, deps = {}) {
    const config = { ...(recovery.config || {}), Image: image };
    const body = JSON.stringify({ ...config, HostConfig: recovery.hostConfig, NetworkingConfig: { EndpointsConfig: recovery.endpointsConfig || {} } });
    const api = deps.dockerApi || dockerApi;
    const stopAndRemove = async identifier => {
        if (!identifier) return;
        await api("POST", `/containers/${encodeURIComponent(identifier)}/stop?t=30`, undefined, { allow404: true });
        await api("DELETE", `/containers/${encodeURIComponent(identifier)}?force=1`, undefined, { allow404: true });
    };
    // Remove whichever incarnation exists. During a failed Compose replace the
    // original ID may already be gone while a half-created replacement owns the name.
    await stopAndRemove(currentId);
    if (currentId !== recovery.targetContainerName) await stopAndRemove(recovery.targetContainerName);
    const created = JSON.parse(await api("POST", `/containers/create?name=${encodeURIComponent(recovery.targetContainerName)}`, body));
    await api("POST", `/containers/${encodeURIComponent(created.Id)}/start`);
}
async function run(deps = {}) {
    let claimed, override, plan;
    try {
        ({ plan, claimed } = readAndClaimPlan(deps.planPath));
        waitForStart(plan, deps.startTimeoutMs);
        const inspected = inspect(plan.targetContainerId, deps);
        if (inspected.Id !== plan.targetContainerId || String(inspected.Name || "").replace(/^\//, "") !== plan.targetContainerName || inspected.Config?.Image !== plan.previousImage) throw new Error("Self-update plan does not match the current Dockge-Enhanced container");
        const recoveryPath = path.join(stateDir, "recovery", plan.recoveryFile);
        requireRegularFile(recoveryPath, "Recovery snapshot");
        const recovery = JSON.parse(fs.readFileSync(recoveryPath, "utf8"));
        if (recovery.id !== plan.id || recovery.targetContainerId !== plan.targetContainerId || recovery.targetContainerName !== plan.targetContainerName || recovery.previousImage !== plan.previousImage || recovery.previousImageId !== plan.previousImageId || !/^sha256:[a-f0-9]{64}$/i.test(plan.previousImageId)) throw new Error("Recovery snapshot does not match the signed plan");
        let updateError;
        try {
            if (plan.compose) {
                console.log(`[SelfUpdateUpdater] Mise à jour via Docker Compose — project=${plan.compose.project} service=${plan.compose.service}`);
                override = composeUpdate(plan, plan.targetImage, {
                    ...deps,
                    onStage: stage => writeStatus(
                        "updating",
                        stage === "pull-target" ? "Downloading target Dockge-Enhanced image" : "Replacing Dockge-Enhanced container",
                        false,
                        plan,
                        stage,
                    ),
                });
            } else {
                console.log("[SelfUpdateUpdater] Contexte Compose indisponible — utilisation du fallback Docker API");
                writeStatus("updating", "Downloading target Dockge-Enhanced image", false, plan, "pull-target");
                ensureTargetImage(plan.targetImage, deps);
                writeStatus("updating", "Replacing Dockge-Enhanced container from recovery snapshot", false, plan, "replace-container");
                await snapshotCreate(recovery, inspected.Id, plan.targetImage, deps);
            }
            writeStatus("waiting-health", "Waiting for stable Dockge-Enhanced application readiness", false, plan, "health-check");
            if (waitReady(plan.targetContainerName, deps)) { writeStatus("succeeded", "Dockge-Enhanced updated and remained ready", false, plan, "health-check"); return "succeeded"; }
            updateError = new Error("Dockge-Enhanced did not remain ready");
        } catch (error) { updateError = error; }
        writeStatus("rolling-back", `Update failed; restoring the previous image: ${updateError instanceof Error ? updateError.message : String(updateError)}`, true, plan, "rollback");
        try {
            let composeRollbackError;
            if (plan.compose) {
                try {
                    override = composeUpdate(plan, plan.previousImageId, deps);
                    if (waitReady(plan.targetContainerName, deps)) {
                        writeStatus("rolled-back", `Update failed and the previous container was restored through Compose: ${updateError instanceof Error ? updateError.message : String(updateError)}`, true, plan, "rollback");
                        return "rolled-back";
                    }
                    composeRollbackError = new Error("Compose restored the previous image but it did not become ready");
                } catch (error) {
                    composeRollbackError = error;
                }
                // Compose is the preferred recovery path because it preserves project
                // semantics. If it cannot recreate a usable container, fall back to
                // the signed pre-update Docker snapshot. This path deliberately does
                // not inspect the missing replacement first.
                await snapshotCreate(recovery, null, plan.previousImageId, deps);
                if (waitReady(plan.targetContainerName, deps)) {
                    writeStatus("rolled-back", `Update failed and Compose rollback failed (${composeRollbackError instanceof Error ? composeRollbackError.message : String(composeRollbackError)}); the previous container was restored from the recovery snapshot`, true, plan, "rollback");
                    return "rolled-back";
                }
                throw new Error(`Compose rollback failed (${composeRollbackError instanceof Error ? composeRollbackError.message : String(composeRollbackError)}) and snapshot recovery did not become ready`);
            }
            let currentId = null;
            try { currentId = inspect(plan.targetContainerName, deps).Id; } catch { /* replacement may not exist */ }
            await snapshotCreate(recovery, currentId, plan.previousImageId, deps);
            if (waitReady(plan.targetContainerName, deps)) { writeStatus("rolled-back", `Update failed and the previous container was restored: ${updateError instanceof Error ? updateError.message : String(updateError)}`, true, plan, "rollback"); return "rolled-back"; }
            throw new Error("Previous container did not become ready");
        } catch (rollbackError) {
            const updateMessage = updateError instanceof Error ? updateError.message : String(updateError);
            const rollbackMessage = rollbackError instanceof Error ? rollbackError.message : String(rollbackError);
            writeStatus("rollback-failed", `Update failed (${updateMessage}) and rollback failed: ${rollbackMessage}`, true, plan, "rollback");
            return "rollback-failed";
        }
    } catch (error) { writeStatus("failed", error instanceof Error ? error.message : String(error), false, plan); return "failed"; }
    // Do not unlink an override used by a Compose-created container: its
    // com.docker.compose.project.config_files label still refers to that path.
    // Stale overrides can be pruned separately after checking container labels.
    finally { if (claimed) fs.rmSync(claimed, { force: true }); }
}
module.exports = { applicationReady, atomicWriteJson, composeUpdate, dockerApi, ensureTargetImage, imageRepository, inside, readAndClaimPlan, run, snapshotCreate, validateCompose, waitForStart, waitReady, writeStatus };
if (require.main === module) run().then(result => { if ([ "failed", "rollback-failed" ].includes(result)) process.exitCode = 1; }).catch(error => { console.error(error); process.exitCode = 1; });
