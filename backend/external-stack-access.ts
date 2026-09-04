import { execFile } from "node:child_process";
import crypto from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { ExternalStackManager, isSafeExternalDataPath } from "./external-stacks";
import { isPathInside, isSafeComposeName } from "./self-update/policy";
import { atomicWriteFile, atomicWriteJson } from "./self-update/state-file";
import { ValidationError } from "./util-server";
import { SelfUpdateManager } from "./self-update/manager";
import { getSelfUpdateBlocker } from "./self-update/operation-guard";

const execFileAsync = promisify(execFile);
const ACTIVE_STATES = new Set([ "preparing", "updating", "waiting-health", "rolling-back" ]);

interface DockerMount {
    Type?: string;
    Source?: string;
    Name?: string;
    Destination?: string;
}

interface DockerInspect {
    Id?: string;
    Image?: string;
    Name?: string;
    Config?: { Image?: string; Labels?: Record<string, string> };
    Mounts?: DockerMount[];
}

export interface ExternalStackAccessOperation {
    id: string;
    project: string;
    requestedPath: string;
    state: "idle" | "preparing" | "updating" | "waiting-health" | "rolling-back" | "succeeded" | "failed" | "rolled-back" | "rollback-failed";
    message: string;
    startedAt: string | null;
    finishedAt: string | null;
    rollbackAttempted: boolean;
}

interface ExternalStackAccessPlan {
    version: 1;
    action: "external-stack-access";
    id: string;
    issuedAt: string;
    expiresAt: string;
    targetContainerId: string;
    targetContainerName: string;
    previousImage: string;
    previousImageId: string;
    externalProject: string;
    requestedPath: string;
    requestedPaths: Array<{ path: string; addBind: boolean }>;
    compose: {
        workingDir: string;
        configFiles: string[];
        envFiles: string[];
        project: string;
        service: string;
    };
}

function idle(): ExternalStackAccessOperation {
    return { id: "",
        project: "",
        requestedPath: "",
        state: "idle",
        message: "",
        startedAt: null,
        finishedAt: null,
        rollbackAttempted: false };
}

function signPlan(plan: ExternalStackAccessPlan, secret: Buffer): string {
    return crypto.createHmac("sha256", secret).update(JSON.stringify(plan)).digest("hex");
}

async function docker(args: string[], timeout = 120_000): Promise<string> {
    const { stdout } = await execFileAsync("docker", args, { timeout,
        maxBuffer: 2 * 1024 * 1024 });
    return stdout;
}

function identityBindCovers(mounts: DockerMount[] | undefined, candidate: string): boolean {
    const resolved = path.resolve(candidate);
    return (mounts ?? []).some((mount) => {
        if (mount.Type !== "bind" || !mount.Source || !mount.Destination) return false;
        const source = path.resolve(mount.Source);
        const destination = path.resolve(mount.Destination);
        if (source !== destination) return false;
        const relative = path.relative(destination, resolved);
        return relative === "" || (relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
    });
}

function collapseAccessPaths(values: string[]): string[] {
    const sorted = [ ...new Set(values.map((value) => path.resolve(value))) ].sort((a, b) => a.length - b.length || a.localeCompare(b));
    const result: string[] = [];
    for (const candidate of sorted) {
        if (result.some((root) => candidate === root || candidate.startsWith(`${root}${path.sep}`))) continue;
        result.push(candidate);
    }
    return result;
}

export class ExternalStackAccessManager {
    private readonly stateDir: string;
    private readonly statusPath: string;
    private readonly secretPath: string;

    constructor(private readonly dataDir: string, private readonly externalStacks: ExternalStackManager) {
        this.dataDir = path.resolve(dataDir);
        this.stateDir = path.join(this.dataDir, "external-stack-access");
        this.statusPath = path.join(this.stateDir, "status.json");
        this.secretPath = path.join(this.stateDir, "plan.key");
    }

    async getOperation(): Promise<ExternalStackAccessOperation> {
        try {
            const operation = { ...idle(),
                ...JSON.parse(await fs.readFile(this.statusPath, "utf8")) } as ExternalStackAccessOperation;
            const started = operation.startedAt ? Date.parse(operation.startedAt) : NaN;
            if (ACTIVE_STATES.has(operation.state) && Number.isFinite(started) && Date.now() - started > 20 * 60_000) {
                const failed: ExternalStackAccessOperation = {
                    ...operation,
                    state: "failed",
                    message: "Protected Compose operation timed out before completion",
                    finishedAt: new Date().toISOString(),
                };
                await atomicWriteJson(this.statusPath, failed);
                return failed;
            }
            return operation;
        } catch {
            return idle();
        }
    }

    private async getOrCreateSecret(): Promise<Buffer> {
        try {
            const secret = await fs.readFile(this.secretPath);
            if (secret.length === 32) {
                return secret;
            }
        } catch {
            // Create a new key below.
        }
        const secret = crypto.randomBytes(32);
        await atomicWriteFile(this.secretPath, secret, 0o600);
        return secret;
    }

    async request(project: string): Promise<ExternalStackAccessOperation> {
        if (!project || project.length > 128) {
            throw new ValidationError("Invalid external Compose project");
        }
        const current = await this.getOperation();
        if (ACTIVE_STATES.has(current.state)) {
            throw new ValidationError("An external-stack access operation is already running");
        }
        if (SelfUpdateManager.getInstance().isUpdateExecutionInProgress()) {
            throw new ValidationError("Dockge-Enhanced self-update is currently running");
        }
        const blocker = await getSelfUpdateBlocker();
        if (blocker) {
            throw new ValidationError(`Protected Compose update is temporarily unavailable: ${blocker.message}`);
        }

        const discovered = (await this.externalStacks.discover()).find((stack) => stack.project === project);
        if (!discovered) {
            throw new ValidationError("External Compose project was not found on this host");
        }
        if (!discovered.workingDir || !path.isAbsolute(discovered.workingDir)) {
            throw new ValidationError("Docker did not report a usable Compose working directory");
        }
        if (!discovered.composeFile || !path.isAbsolute(discovered.composeFile)) {
            throw new ValidationError("Docker did not report a usable Compose file");
        }
        const requestedPath = path.resolve(discovered.workingDir);
        if (!isSafeExternalDataPath(requestedPath)) {
            throw new ValidationError("This external Compose working directory cannot be added automatically");
        }
        const dataPaths = collapseAccessPaths((discovered.dataPaths ?? []).filter((candidate) => isSafeExternalDataPath(candidate))).slice(0, 32);
        const configRoots = collapseAccessPaths((discovered.configFiles ?? []).map((candidate) => path.dirname(candidate)).filter((candidate) => isSafeExternalDataPath(candidate))).slice(0, 16);
        const envRoots = collapseAccessPaths((discovered.envFiles ?? []).map((candidate) => path.dirname(candidate)).filter((candidate) => isSafeExternalDataPath(candidate))).slice(0, 8);
        const requestedAccessPaths = collapseAccessPaths([ requestedPath, ...configRoots, ...envRoots, ...dataPaths ]).slice(0, 64);

        const containerId = process.env.HOSTNAME?.trim();
        if (!containerId) {
            throw new Error("Current Docker container identifier is unavailable");
        }
        const inspected = JSON.parse(await docker([ "container", "inspect", containerId, "--format", "{{json .}}" ])) as DockerInspect;
        const labels = inspected.Config?.Labels ?? {};
        const targetContainerName = (inspected.Name ?? "").replace(/^\//, "");
        const workingDir = labels["com.docker.compose.project.working_dir"] ?? "";
        const configFiles = [ ...new Set((labels["com.docker.compose.project.config_files"] ?? "")
            .split(",")
            .map((file) => file.trim())
            .filter((file) => file.length > 0 && path.isAbsolute(file))
            .map((file) => path.resolve(file))) ].slice(0, 16);
        const envFiles = [ ...new Set((labels["com.docker.compose.project.environment_file"] ?? "")
            .split(",")
            .map((file) => file.trim())
            .filter((file) => file.length > 0 && path.isAbsolute(file))
            .map((file) => path.resolve(file))) ].slice(0, 8);
        const composeProject = labels["com.docker.compose.project"] ?? "";
        const composeService = labels["com.docker.compose.service"] ?? "";
        if (!inspected.Id || !inspected.Image || !inspected.Config?.Image || !targetContainerName) {
            throw new Error("Current Dockge-Enhanced container metadata is incomplete");
        }
        const externalConfigRoots = collapseAccessPaths(configFiles
            .filter((file) => !isPathInside(workingDir, file))
            .map((file) => path.dirname(file)));
        if (!path.isAbsolute(workingDir) || !isSafeComposeName(composeProject) || !isSafeComposeName(composeService) || configFiles.length === 0 || externalConfigRoots.some((root) => !isSafeExternalDataPath(root))) {
            throw new ValidationError("The active Dockge-Enhanced Compose configuration cannot be modified safely");
        }

        const requestedPaths = requestedAccessPaths.map((candidate) => ({
            path: candidate,
            addBind: !identityBindCovers(inspected.Mounts, candidate),
        }));
        const composeNeedsAuthorization = discovered.pathStatus !== "accessible";
        const additionalAuthorizationNeeded = Boolean(discovered.configFilesNeedingAccess?.length || discovered.envFilesNeedingAccess?.length);
        const dataNeedsBind = requestedPaths.some((entry) => entry.path !== requestedPath && entry.addBind);
        if (!composeNeedsAuthorization && !additionalAuthorizationNeeded && !dataNeedsBind) {
            throw new ValidationError("External Compose project and linked data paths are already accessible");
        }

        const stateMount = (inspected.Mounts ?? []).find((mount) => mount.Destination === this.dataDir);
        if (!stateMount?.Source) {
            throw new ValidationError(`The ${this.dataDir} volume is required for protected configuration changes`);
        }
        const stateSource = stateMount.Type === "volume" ? (stateMount.Name ?? stateMount.Source) : stateMount.Source;
        const dockerSocket = process.env.DOCKGE_DOCKER_SOCKET ?? "/var/run/docker.sock";
        const socketGroup = (await fs.stat(dockerSocket)).gid;
        const id = crypto.randomBytes(16).toString("hex");
        const issuedAt = new Date();
        const plan: ExternalStackAccessPlan = {
            version: 1,
            action: "external-stack-access",
            id,
            issuedAt: issuedAt.toISOString(),
            expiresAt: new Date(issuedAt.getTime() + 15 * 60_000).toISOString(),
            targetContainerId: inspected.Id,
            targetContainerName,
            previousImage: inspected.Config.Image,
            previousImageId: inspected.Image,
            externalProject: project,
            requestedPath,
            requestedPaths,
            compose: { workingDir,
                configFiles,
                envFiles,
                project: composeProject,
                service: composeService },
        };
        const secret = await this.getOrCreateSecret();
        await fs.mkdir(this.stateDir, { recursive: true,
            mode: 0o700 });
        await atomicWriteJson(path.join(this.stateDir, `${id}.json`), { plan,
            signature: signPlan(plan, secret) });
        const operation: ExternalStackAccessOperation = {
            id,
            project,
            requestedPath,
            state: "preparing",
            message: "Preparing the protected Dockge-Enhanced Compose update",
            startedAt: issuedAt.toISOString(),
            finishedAt: null,
            rollbackAttempted: false,
        };
        await atomicWriteJson(this.statusPath, operation);

        // Reuse the exact Dockge-Enhanced image that is already running.
        // This avoids a second helper image/tag and guarantees that the helper
        // version always matches the application that generated the signed plan.
        const helperImage = inspected.Image;
        const args = [
            "run", "-d", "--rm",
            "--name", `dockge-enhanced-compose-helper-${id}`,
            "--label", "io.dockge-enhanced.external-stack-access=true",
            "--user", "0:0",
            "--cap-drop", "ALL",
            "--cap-add", "DAC_OVERRIDE",
            "--cap-add", "CHOWN",
            "--security-opt", "no-new-privileges",
            "--read-only",
            "--network", "none",
            "--no-healthcheck",
            "--group-add", String(socketGroup),
            "-v", `${dockerSocket}:/var/run/docker.sock`,
            "-v", `${stateSource}:/state`,
            "-v", `${workingDir}:${workingDir}:rw`,
            ...externalConfigRoots.flatMap((root) => [ "-v", `${root}:${root}:rw` ]),
            ...envFiles.filter((file) => !isPathInside(workingDir, file) && !externalConfigRoots.some((root) => isPathInside(root, file))).flatMap((file) => [ "-v", `${file}:${file}:ro` ]),
            "-e", `EXTERNAL_STACK_ACCESS_PLAN=/state/external-stack-access/${id}.json`,
            "-e", "EXTERNAL_STACK_ACCESS_STATE_DIR=/state/external-stack-access",
            "-e", `EXTERNAL_STACK_ACCESS_TARGET_ID=${inspected.Id}`,
            "-e", `EXTERNAL_STACK_ACCESS_TARGET_NAME=${targetContainerName}`,
            "-e", `EXTERNAL_STACK_ACCESS_COMPOSE_DIR=${workingDir}`,
            "-e", "EXTERNAL_STACK_ACCESS_START_DELAY_MS=2000",
            helperImage,
            "node", "/app/extra/external-stack-access-sidecar/index.cjs",
        ];
        try {
            await docker(args);
        } catch (error) {
            const failed: ExternalStackAccessOperation = {
                ...operation,
                state: "failed",
                message: `Unable to start the protected Compose helper: ${error instanceof Error ? error.message : String(error)}`,
                finishedAt: new Date().toISOString(),
            };
            await atomicWriteJson(this.statusPath, failed);
            throw error;
        }
        return operation;
    }
}
