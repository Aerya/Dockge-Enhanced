import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { Readable, Transform } from "node:stream";
import { createHash } from "node:crypto";
import { BackupManager, StackBackupPolicy, normalizeStackBackupPolicy } from "../watchers/backup-manager";
import { DockgeServer } from "../dockge-server";
import { Stack } from "../stack";
import { DockgeSocket, fileExists, ValidationError } from "../util-server";
import { Settings } from "../settings";
import { getApplicationProfile } from "./application-profiles";
import {
    createImportedStackStorage,
    analyzeStackTransfer,
    appendTransferJobProgress,
    completeStackTransferTarget,
    deployAndVerifyImportedStack,
    importStackTransfer,
    listTransferJobs,
    rollbackImportedStack,
    reserveStackTransferJob,
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
    directHttpAvailable: boolean;
    repositories: Array<StackTransferRepository & { transport: "restic" | "rsync"; encrypted: boolean; checksumVerified: boolean; retryable: boolean; resumableRepository: boolean }>;
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
    snapshotBytes?: Record<string, number>;
    phase?: "copy" | "initial" | "final";
    progress?: number;
    logs?: Array<{ at: string; phase: string; message: string }>;
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

export interface RestoredStorageReport {
    mounts: Array<{ type: "bind" | "volume"; fileCount: number; bytes: number; digest: string }>;
    fileCount: number;
    bytes: number;
    digest: string;
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

async function createSnapshot(server: DockgeServer, job: SourceDataJob, phase: "copy" | "initial" | "final"): Promise<{ snapshotId: string; bytesTransferred: number }> {
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
    let bytesTransferred = 0;
    const counter = new Transform({ transform(chunk, _encoding, callback) {
        bytesTransferred += chunk.length;
        callback(null, chunk);
    } });
    (tar.stdout as Readable).pipe(counter);
    try {
        const snapshotId = await stackTransferTransport.upload(
            job.repositoryId,
            archivePath(job.id, phase),
            [ "dockge-stack-transfer", `transfer:${job.id}`, `phase:${phase}` ],
            counter,
            true,
        );
        const tarError = await tarDone;
        if (tarError) {
            throw tarError;
        }
        return { snapshotId,
            bytesTransferred };
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
    await stackTransferTransport.verify(repositoryId, snapshotId, pathInSnapshot);
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

export async function inspectRestoredTargetStorage(server: DockgeServer, targetName: string, mappings: StackTransferMount[]): Promise<RestoredStorageReport> {
    const stack = await Stack.getStack(server, targetName);
    const mounts = await resolveStorage(stack, mappings);
    const report: RestoredStorageReport = { mounts: [],
        fileCount: 0,
        bytes: 0,
        digest: "" };
    const combined = createHash("sha256");
    for (const mount of mounts) {
        const output = await runDocker([
            "run", "--rm", "--network", "none",
            ...dockerStorageArgs([ mount ], "targets", true),
            HELPER_IMAGE, "sh", "-c",
            "files=$(find /targets/0 -type f 2>/dev/null | wc -l); kb=$(du -sk /targets/0 2>/dev/null | awk '{print $1}'); digest=$(find /targets/0 -type f -exec sha256sum {} \\; 2>/dev/null | sort | sha256sum | awk '{print $1}'); printf '%s %s %s\\n' \"$files\" \"$kb\" \"$digest\"",
        ], undefined, 120_000);
        const [ filesRaw, kbRaw, digest = "" ] = output.trim().split(/\s+/);
        const item = { type: mount.type,
            fileCount: Number(filesRaw) || 0,
            bytes: (Number(kbRaw) || 0) * 1024,
            digest };
        report.mounts.push(item);
        report.fileCount += item.fileCount;
        report.bytes += item.bytes;
        combined.update(`${mount.type}:${digest}\n`);
    }
    report.digest = combined.digest("hex");
    return report;
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
        directHttpAvailable: true,
        repositories: stackTransferTransport.list().filter(repository => resticAvailable || repository.type === "rsync").map(repository => ({ ...repository,
            transport: repository.type === "rsync" ? "rsync" as const : "restic" as const,
            ...stackTransferTransport.capabilities(repository.id) })),
        policy: normalizeStackBackupPolicy(manager.settings.stackPolicies?.[stackName]),
    };
}

export async function createStackTransferDataSnapshot(server: DockgeServer, request: StackTransferDataSnapshotRequest): Promise<{ snapshotId: string; archivePath: string; bytesTransferred: number }> {
    const policy = normalizeStackBackupPolicy(request.policy);
    const existing = (await readSourceJobs()).find(item => item.id === assertTransferId(request.transferId));
    if (existing?.status === "snapshotted" && existing.phase === request.phase && existing.snapshotIds.length) {
        const snapshotId = existing.snapshotIds.at(-1)!;
        return { snapshotId,
            archivePath: archivePath(existing.id, request.phase),
            bytesTransferred: existing.snapshotBytes?.[snapshotId] || 0 };
    }
    const now = new Date().toISOString();
    const job: SourceDataJob = {
        id: assertTransferId(request.transferId),
        stackName: request.stackName,
        repositoryId: request.repositoryId,
        mappings: selectedMappings(request.mappings),
        policy,
        snapshotIds: [],
        snapshotBytes: {},
        phase: request.phase,
        progress: 5,
        logs: [{ at: now,
            phase: "preparing",
            message: "Persistent source job created" }],
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
        job.progress = 30;
        job.logs?.push({ at: new Date().toISOString(),
            phase: "snapshotting",
            message: "Streaming storage archive outside Socket.IO" });
        await saveSourceJob(job);
        const { snapshotId, bytesTransferred } = await createSnapshot(server, job, request.phase);
        job.snapshotIds.push(snapshotId);
        job.snapshotBytes![snapshotId] = bytesTransferred;
        if (request.phase === "copy" && prepared) {
            await restoreSource(job, server);
        }
        job.updatedAt = new Date().toISOString();
        job.progress = 100;
        job.logs?.push({ at: job.updatedAt,
            phase: "snapshotted",
            message: `${bytesTransferred} bytes transferred and verified` });
        await saveSourceJob(job);
        return { snapshotId,
            archivePath: archivePath(job.id, request.phase),
            bytesTransferred };
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

export async function finalizeStackTransferDataSource(server: DockgeServer, transferId: string): Promise<{ snapshotId: string; archivePath: string; bytesTransferred: number }> {
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
        const { snapshotId, bytesTransferred } = await createSnapshot(server, job, "final");
        job.snapshotIds.push(snapshotId);
        job.snapshotBytes ||= {};
        job.snapshotBytes[snapshotId] = bytesTransferred;
        job.phase = "final";
        job.status = "source-stopped";
        job.updatedAt = new Date().toISOString();
        await saveSourceJob(job);
        return { snapshotId,
            archivePath: archivePath(job.id, "final"),
            bytesTransferred };
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
        dataTransfer: true,
        transferId: request.transferId };
    let jobId = "";
    let rollbackData: NonNullable<import("./stack-transfer").StackTransferJob["rollbackData"]> | undefined;
    let targetHadOriginal = false;
    try {
        const existingJob = (await listTransferJobs()).find(item => item.id === request.transferId);
        rollbackData = existingJob?.rollbackData;
        const targetExists = await fileExists(`${server.stacksDir}/${transfer.targetName}`);
        targetHadOriginal = targetExists && (!existingJob || existingJob.phase === "overwrite-snapshotted");
        if (transfer.overwriteExisting && targetExists && !existingJob) {
            const inventory = await analyzeStackTransfer(server, transfer.targetName);
            const rollbackMappings = inventory.mounts.map(mapping => ({ ...mapping,
                transferData: !mapping.external && (mapping.type === "bind" || mapping.type === "volume") }));
            if (rollbackMappings.some(mapping => mapping.transferData)) {
                const rollbackTransferId = `rollback-${request.transferId}`;
                const snapshot = await createStackTransferDataSnapshot(server, {
                    transferId: rollbackTransferId,
                    stackName: transfer.targetName,
                    repositoryId: request.repositoryId,
                    mappings: rollbackMappings,
                    policy: { mode: "stop" },
                    phase: "copy",
                });
                rollbackData = { transferId: rollbackTransferId,
                    repositoryId: request.repositoryId,
                    snapshotId: snapshot.snapshotId,
                    archivePath: snapshot.archivePath,
                    mappings: rollbackMappings };
                await reserveStackTransferJob(transfer, rollbackData);
            }
        }
        const imported = await importStackTransfer(server, socket, transfer);
        jobId = imported.job.id;
        await appendTransferJobProgress(jobId, "creating-target-storage", 50, "Creating target storage", { status: "running",
            rollbackData });
        await createImportedStackStorage(server, transfer.targetName);
        await appendTransferJobProgress(jobId, "restoring-initial-data", 65, "Restoring the verified initial snapshot");
        await restoreSnapshotToTarget(server, transfer.targetName, transfer.mappings, request.repositoryId, request.snapshotId, archivePath(request.transferId, request.transfer.operation === "copy" ? "copy" : "initial"));
        if (transfer.operation === "copy" && desiredDeploy) {
            await appendTransferJobProgress(jobId, "deploying-restored-target", 85);
            await deployAndVerifyImportedStack(server, socket, transfer.targetName);
        }
        await appendTransferJobProgress(jobId, transfer.operation === "copy" ? "completed" : "waiting-final-delta", 100, "Target data restored and verified", {
            status: transfer.operation === "copy" ? "succeeded" : "target-ready",
            resumable: transfer.operation !== "copy",
        });
        if (transfer.operation === "copy") {
            await cleanupTargetRollback(server, jobId, true);
        }
        return { jobId };
    } catch (error) {
        if (jobId) {
            await cleanupTargetRollback(server, jobId, false).catch(() => {});
        } else {
            if (!targetHadOriginal) {
                await rollbackImportedStack(server, request.transfer.targetName);
            }
            if (rollbackData) {
                await completeStackTransferDataSource(server, rollbackData.transferId, true, false).catch(() => {});
            }
        }
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
        await cleanupTargetRollback(server, jobId, true);
    } catch (error) {
        await cleanupTargetRollback(server, jobId, false).catch(() => rollbackImportedStack(server, request.transfer.targetName));
        await updateTransferJob(jobId, { status: "rolled-back",
            phase: "failed",
            error: error instanceof Error ? error.message : String(error) });
        throw error;
    }
}

export async function rollbackStackTransferDataTarget(server: DockgeServer, targetName: string, jobId: string): Promise<void> {
    await cleanupTargetRollback(server, jobId, false);
    await updateTransferJob(jobId, { status: "rolled-back",
        phase: "rolled-back" });
}

async function cleanupTargetRollback(server: DockgeServer, jobId: string, success: boolean): Promise<void> {
    const job = (await listTransferJobs()).find(item => item.id === jobId);
    if (!job) {
        throw new ValidationError("Target transfer job not found");
    }
    const rollbackData = job.rollbackData;
    await completeStackTransferTarget(server, jobId, success);
    if (!success && rollbackData) {
        await createImportedStackStorage(server, job.targetName);
        await restoreSnapshotToTarget(server, job.targetName, rollbackData.mappings, rollbackData.repositoryId, rollbackData.snapshotId, rollbackData.archivePath);
    }
    if (rollbackData) {
        await completeStackTransferDataSource(server, rollbackData.transferId, true, false);
        await updateTransferJob(jobId, { rollbackData: undefined });
    }
}
