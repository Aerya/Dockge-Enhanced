import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { Readable } from "node:stream";
import { BackupManager, StackBackupPolicy, normalizeStackBackupPolicy } from "../watchers/backup-manager";
import { DockgeServer } from "../dockge-server";
import { Stack } from "../stack";
import { DockgeSocket, ValidationError } from "../util-server";
import { Settings } from "../settings";
import { getApplicationProfile } from "./application-profiles";
import {
    createImportedStackStorage,
    deployAndVerifyImportedStack,
    importStackTransfer,
    rollbackImportedStack,
    runDocker,
    StackTransferMount,
    StackTransferRequest,
    updateTransferJob,
} from "./stack-transfer";
import { StackTransferRepository } from "./stack-transfer-restic";
import { stackTransferTransport } from "./stack-transfer-transport";

const execFileAsync = promisify(execFile);
const SOURCE_JOBS_SETTING = "stackTransferDataSourceJobs";
const HELPER_IMAGE = process.env.DOCKGE_VOLUME_HELPER_IMAGE || "busybox:stable";

export interface StackTransferDataCapabilities {
    resticAvailable: boolean;
    repositories: Array<StackTransferRepository & { transport: "restic"; encrypted: boolean; checksumVerified: boolean; retryable: boolean; resumableRepository: boolean }>;
    policy: StackBackupPolicy;
}

export interface StackTransferDataSnapshotRequest {
    transferId: string;
    stackName: string;
    repositoryId: string;
    mappings: StackTransferMount[];
    policy: StackBackupPolicy;
    phase: "copy" | "initial";
}

export interface StackTransferDataTargetRequest {
    transferId: string;
    repositoryId: string;
    snapshotId: string;
    transfer: StackTransferRequest;
}

interface SourceDataJob {
    id: string;
    stackName: string;
    repositoryId: string;
    mappings: StackTransferMount[];
    policy: StackBackupPolicy;
    snapshotIds: string[];
    runningServices: string[];
    hookPrepared: boolean;
    status: "snapshotted" | "source-stopped" | "completed" | "rolled-back" | "failed";
    error?: string;
    createdAt: string;
    updatedAt: string;
}

interface RuntimeMount {
    type: "bind" | "volume";
    source: string;
}

function assertTransferId(value: string): string {
    if (!/^[a-zA-Z0-9_-]{8,128}$/.test(value)) {
        throw new ValidationError("Invalid data transfer id");
    }
    return value;
}

function selectedMappings(mappings: StackTransferMount[]): StackTransferMount[] {
    const selected = mappings.filter(mapping => mapping.transferData && (mapping.type === "bind" || mapping.type === "volume"));
    if (selected.length === 0) {
        throw new ValidationError("Select at least one bind mount or volume to transfer");
    }
    return selected;
}

async function readSourceJobs(): Promise<SourceDataJob[]> {
    const value = await Settings.get(SOURCE_JOBS_SETTING);
    return Array.isArray(value) ? value as SourceDataJob[] : [];
}

async function saveSourceJob(job: SourceDataJob): Promise<void> {
    const jobs = (await readSourceJobs()).filter(item => item.id !== job.id);
    jobs.unshift(job);
    await Settings.set(SOURCE_JOBS_SETTING, jobs.slice(0, 50), "stack-data-transfer");
}

async function getSourceJob(id: string): Promise<SourceDataJob> {
    const job = (await readSourceJobs()).find(item => item.id === assertTransferId(id));
    if (!job) {
        throw new ValidationError("Source data transfer job not found");
    }
    return job;
}

async function runtimeMounts(stack: Stack): Promise<Map<string, RuntimeMount>> {
    const ids = (await runDocker(stack.getComposeOptions("ps", "-aq"), stack.fullPath)).split(/\s+/).filter(Boolean);
    if (ids.length === 0) {
        return new Map();
    }
    const containers = JSON.parse(await runDocker([ "inspect", ...ids ])) as Array<Record<string, unknown>>;
    const result = new Map<string, RuntimeMount>();
    for (const container of containers) {
        const config = container.Config as Record<string, unknown> | undefined;
        const labels = config?.Labels as Record<string, unknown> | undefined;
        const service = String(labels?.["com.docker.compose.service"] || "");
        for (const rawMount of (container.Mounts as Array<Record<string, unknown>> | undefined) || []) {
            const type = rawMount.Type;
            const target = String(rawMount.Destination || "");
            if (!service || !target || (type !== "bind" && type !== "volume")) {
                continue;
            }
            const source = type === "volume" ? String(rawMount.Name || "") : String(rawMount.Source || "");
            if (source) {
                result.set(`${service}:${target}`, { type,
                    source });
            }
        }
    }
    return result;
}

async function resolveStorage(stack: Stack, mappings: StackTransferMount[]): Promise<RuntimeMount[]> {
    const runtime = await runtimeMounts(stack);
    return selectedMappings(mappings).map(mapping => {
        const mount = runtime.get(`${mapping.service}:${mapping.target}`);
        if (!mount) {
            throw new ValidationError(`${mapping.service}:${mapping.target}: Docker storage is unavailable; create the stack containers first`);
        }
        return mount;
    });
}

function dockerStorageArgs(mounts: RuntimeMount[], root: "sources" | "targets", readOnly: boolean): string[] {
    return mounts.flatMap((mount, index) => [
        "--mount",
        `type=${mount.type},src=${mount.source},dst=/${root}/${index}${readOnly ? ",readonly" : ""}`,
    ]);
}

async function waitProcess(child: ReturnType<typeof spawn>, label: string): Promise<void> {
    let stderr = "";
    child.stderr?.on("data", chunk => {
        stderr += String(chunk);
    });
    const code = await new Promise<number>((resolve, reject) => {
        child.once("error", reject);
        child.once("close", value => resolve(value ?? 1));
    });
    if (code !== 0) {
        throw new Error(stderr.trim() || `${label} exited with code ${code}`);
    }
}

function archivePath(transferId: string, phase: "copy" | "initial" | "final"): string {
    return `/dockge-stack-transfer/${assertTransferId(transferId)}/${phase}.tar`;
}

async function createSnapshot(server: DockgeServer, job: SourceDataJob, phase: "copy" | "initial" | "final"): Promise<string> {
    const stack = await Stack.getStack(server, job.stackName);
    const mounts = await resolveStorage(stack, job.mappings);
    await runDocker([ "image", "inspect", HELPER_IMAGE ]);
    await stackTransferTransport.prepare(job.repositoryId);
    const tar = spawn("docker", [
        "run", "--rm", "--network", "none",
        ...dockerStorageArgs(mounts, "sources", true),
        HELPER_IMAGE, "tar", "-C", "/sources", "-cf", "-", ".",
    ], { stdio: [ "ignore", "pipe", "pipe" ] });
    const tarDone = waitProcess(tar, "volume archive").then(() => null, error => error as Error);
    try {
        const snapshotId = await stackTransferTransport.upload(
            job.repositoryId,
            archivePath(job.id, phase),
            [ "dockge-stack-transfer", `transfer:${job.id}`, `phase:${phase}` ],
            tar.stdout as Readable,
            true,
        );
        const tarError = await tarDone;
        if (tarError) {
            throw tarError;
        }
        return snapshotId;
    } catch (error) {
        const archiveError = await tarDone;
        tar.kill("SIGTERM");
        if (archiveError) {
            throw new Error(`${error instanceof Error ? error.message : String(error)} ; ${archiveError instanceof Error ? archiveError.message : String(archiveError)}`);
        }
        throw error;
    }
}

async function ensureTargetBindPaths(mounts: RuntimeMount[]): Promise<void> {
    for (const mount of mounts) {
        if (mount.type !== "bind") {
            continue;
        }
        if (!mount.source.startsWith("/") || mount.source === "/") {
            throw new ValidationError("Invalid target bind path");
        }
        await runDocker([
            "run", "--rm", "--network", "none",
            "--mount", "type=bind,src=/,dst=/host",
            HELPER_IMAGE, "sh", "-c", "mkdir -p -- \"/host$1\"", "dockge-transfer", mount.source,
        ], undefined, 120_000);
    }
}

async function runningServices(stack: Stack): Promise<string[]> {
    return (await runDocker(stack.getComposeOptions("ps", "--status", "running", "--services"), stack.fullPath))
        .split("\n").map(value => value.trim()).filter(Boolean);
}

async function runHook(stack: Stack, policy: StackBackupPolicy, phase: "pre" | "post"): Promise<void> {
    const profile = getApplicationProfile(policy.applicationProfile);
    const command = phase === "pre" ? (policy.preHook || profile?.preHook) : (policy.postHook || profile?.postHook);
    if (!command) {
        return;
    }
    if (!policy.hookService) {
        throw new ValidationError("A service is required for application hooks");
    }
    await execFileAsync("docker", stack.getComposeOptions("exec", "-T", policy.hookService, "sh", "-c", command), {
        cwd: stack.fullPath,
        timeout: 5 * 60_000,
        maxBuffer: 2 * 1024 * 1024,
    });
}

async function stopSource(stack: Stack, services: string[]): Promise<void> {
    if (services.length > 0) {
        await runDocker(stack.getComposeOptions("stop", ...services), stack.fullPath, 30 * 60_000);
    }
}

async function restoreSource(job: SourceDataJob, server: DockgeServer): Promise<void> {
    const stack = await Stack.getStack(server, job.stackName);
    if (job.runningServices.length > 0) {
        await runDocker(stack.getComposeOptions("start", ...job.runningServices), stack.fullPath, 30 * 60_000);
    }
    if (job.hookPrepared) {
        await runHook(stack, job.policy, "post");
    }
    job.hookPrepared = false;
    job.runningServices = [];
}

export async function restoreSnapshotToTarget(server: DockgeServer, targetName: string, mappings: StackTransferMount[], repositoryId: string, snapshotId: string, pathInSnapshot: string): Promise<void> {
    const stack = await Stack.getStack(server, targetName);
    const mounts = await resolveStorage(stack, mappings);
    if (mounts.some(mount => mount.type === "bind" && mount.source === "/")) {
        throw new ValidationError("Refusing to restore data into the host root filesystem");
    }
    await ensureTargetBindPaths(mounts);
    const helperName = `dockge-replica-restore-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const extract = spawn("docker", [
        "run", "--rm", "-i", "--name", helperName, "--network", "none",
        ...dockerStorageArgs(mounts, "targets", false),
        HELPER_IMAGE, "sh", "-c",
        "for d in /targets/*; do rm -rf \"$d\"/* \"$d\"/.[!.]* \"$d\"/..?* 2>/dev/null || true; done; tar -C /targets -xf -",
    ], { stdio: [ "pipe", "ignore", "pipe" ] });
    const extractDone = waitProcess(extract, "volume restore").then(() => null, error => error as Error);
    try {
        await stackTransferTransport.restore(repositoryId, snapshotId, pathInSnapshot, extract.stdin!);
        extract.stdin?.end();
        const extractError = await extractDone;
        if (extractError) {
            throw extractError;
        }
    } catch (error) {
        extract.kill("SIGTERM");
        await runDocker([ "rm", "-f", helperName ], undefined, 30_000).catch(() => {});
        await extractDone;
        throw error;
    }
}

export async function getStackTransferDataCapabilities(stackName: string): Promise<StackTransferDataCapabilities> {
    let resticAvailable = true;
    try {
        await execFileAsync("restic", [ "version" ], { timeout: 10_000 });
    } catch {
        resticAvailable = false;
    }
    const manager = BackupManager.getInstance();
    return {
        resticAvailable,
        repositories: resticAvailable ? stackTransferTransport.list().map(repository => ({ ...repository,
            transport: stackTransferTransport.kind,
            ...stackTransferTransport.capabilities(repository.id) })) : [],
        policy: normalizeStackBackupPolicy(manager.settings.stackPolicies?.[stackName]),
    };
}

export async function createStackTransferDataSnapshot(server: DockgeServer, request: StackTransferDataSnapshotRequest): Promise<{ snapshotId: string; archivePath: string }> {
    const policy = normalizeStackBackupPolicy(request.policy);
    const now = new Date().toISOString();
    const job: SourceDataJob = {
        id: assertTransferId(request.transferId),
        stackName: request.stackName,
        repositoryId: request.repositoryId,
        mappings: selectedMappings(request.mappings),
        policy,
        snapshotIds: [],
        runningServices: [],
        hookPrepared: false,
        status: "snapshotted",
        createdAt: now,
        updatedAt: now,
    };
    const stack = await Stack.getStack(server, request.stackName);
    let prepared = false;
    try {
        if (request.phase === "copy") {
            job.runningServices = await runningServices(stack);
            if (policy.mode === "hooks") {
                await runHook(stack, policy, "pre");
                job.hookPrepared = true;
                prepared = true;
            } else if (policy.mode === "stop") {
                await stopSource(stack, job.runningServices);
                prepared = true;
            }
        }
        const snapshotId = await createSnapshot(server, job, request.phase);
        job.snapshotIds.push(snapshotId);
        if (request.phase === "copy" && prepared) {
            await restoreSource(job, server);
        }
        job.updatedAt = new Date().toISOString();
        await saveSourceJob(job);
        return { snapshotId,
            archivePath: archivePath(job.id, request.phase) };
    } catch (error) {
        if (request.phase === "copy" && prepared) {
            await restoreSource(job, server).catch(() => {});
        }
        job.status = "failed";
        job.error = error instanceof Error ? error.message : String(error);
        job.updatedAt = new Date().toISOString();
        await saveSourceJob(job);
        throw error;
    }
}

export async function finalizeStackTransferDataSource(server: DockgeServer, transferId: string): Promise<{ snapshotId: string; archivePath: string }> {
    const job = await getSourceJob(transferId);
    if (job.status !== "snapshotted") {
        throw new ValidationError("Source data transfer is not ready for finalization");
    }
    const stack = await Stack.getStack(server, job.stackName);
    try {
        job.runningServices = await runningServices(stack);
        if (job.policy.mode === "hooks") {
            await runHook(stack, job.policy, "pre");
            job.hookPrepared = true;
        }
        await stopSource(stack, job.runningServices);
        const snapshotId = await createSnapshot(server, job, "final");
        job.snapshotIds.push(snapshotId);
        job.status = "source-stopped";
        job.updatedAt = new Date().toISOString();
        await saveSourceJob(job);
        return { snapshotId,
            archivePath: archivePath(job.id, "final") };
    } catch (error) {
        await restoreSource(job, server).catch(() => {});
        job.status = "failed";
        job.error = error instanceof Error ? error.message : String(error);
        job.updatedAt = new Date().toISOString();
        await saveSourceJob(job);
        throw error;
    }
}

export async function completeStackTransferDataSource(server: DockgeServer, transferId: string, success: boolean, retainSnapshots = false): Promise<{ cleanupWarning?: string }> {
    const job = await getSourceJob(transferId);
    if (!success && job.status === "source-stopped") {
        await restoreSource(job, server);
        job.status = "rolled-back";
    } else if (success) {
        job.status = "completed";
    }
    job.updatedAt = new Date().toISOString();
    await saveSourceJob(job);
    if (retainSnapshots) {
        return {};
    }
    try {
        await stackTransferTransport.cleanup(job.repositoryId, job.snapshotIds);
        return {};
    } catch (error) {
        return { cleanupWarning: error instanceof Error ? error.message : String(error) };
    }
}

export async function stageStackTransferDataTarget(server: DockgeServer, socket: DockgeSocket, request: StackTransferDataTargetRequest): Promise<{ jobId: string }> {
    const desiredDeploy = request.transfer.deploy;
    const transfer = { ...request.transfer,
        deploy: false,
        dataTransfer: true };
    let jobId = "";
    try {
        const imported = await importStackTransfer(server, socket, transfer);
        jobId = imported.job.id;
        await updateTransferJob(jobId, { status: "running",
            phase: "creating-target-storage" });
        await createImportedStackStorage(server, transfer.targetName);
        await updateTransferJob(jobId, { phase: "restoring-initial-data" });
        await restoreSnapshotToTarget(server, transfer.targetName, transfer.mappings, request.repositoryId, request.snapshotId, archivePath(request.transferId, request.transfer.operation === "copy" ? "copy" : "initial"));
        if (transfer.operation === "copy" && desiredDeploy) {
            await updateTransferJob(jobId, { phase: "deploying-restored-target" });
            await deployAndVerifyImportedStack(server, socket, transfer.targetName);
        }
        await updateTransferJob(jobId, {
            status: transfer.operation === "copy" ? "succeeded" : "target-ready",
            phase: transfer.operation === "copy" ? "completed" : "waiting-final-delta",
        });
        return { jobId };
    } catch (error) {
        await rollbackImportedStack(server, request.transfer.targetName);
        if (jobId) {
            await updateTransferJob(jobId, { status: "rolled-back",
                phase: "failed",
                error: error instanceof Error ? error.message : String(error) });
        }
        throw error;
    }
}

export async function finalizeStackTransferDataTarget(server: DockgeServer, socket: DockgeSocket, request: StackTransferDataTargetRequest, jobId: string): Promise<void> {
    try {
        await updateTransferJob(jobId, { status: "running",
            phase: "restoring-final-delta" });
        await restoreSnapshotToTarget(server, request.transfer.targetName, request.transfer.mappings, request.repositoryId, request.snapshotId, archivePath(request.transferId, "final"));
        await updateTransferJob(jobId, { phase: "deploying-restored-target" });
        await deployAndVerifyImportedStack(server, socket, request.transfer.targetName);
        await updateTransferJob(jobId, { status: "succeeded",
            phase: "completed" });
    } catch (error) {
        await rollbackImportedStack(server, request.transfer.targetName);
        await updateTransferJob(jobId, { status: "rolled-back",
            phase: "failed",
            error: error instanceof Error ? error.message : String(error) });
        throw error;
    }
}

export async function rollbackStackTransferDataTarget(server: DockgeServer, targetName: string, jobId: string): Promise<void> {
    await rollbackImportedStack(server, targetName);
    await updateTransferJob(jobId, { status: "rolled-back",
        phase: "rolled-back" });
}
