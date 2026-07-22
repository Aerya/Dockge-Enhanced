import path from "node:path";
import { promises as fs } from "node:fs";
import yaml from "yaml";
import { createHash } from "node:crypto";
import { DockgeServer } from "../dockge-server";
import { Stack } from "../stack";
import { DockgeSocket, fileExists, ValidationError } from "../util-server";
import {
    createImportedStackStorage,
    deployAndVerifyImportedStack,
    importStackTransfer,
    refreshImportedStackConfiguration,
    rollbackImportedStack,
    runDocker,
    StackTransferRequest,
} from "./stack-transfer";
import {
    restoreSnapshotToTarget,
    inspectRestoredTargetStorage,
    stageStackTransferDataTarget,
    StackTransferDataTargetRequest,
} from "./stack-data-transfer";
import { isDirectHttpRepository } from "./http-direct-transport";
import { cacheManagedReplicationSnapshot, cleanupManagedReplicationSnapshots } from "./managed-replication-transport";
import { stackTransferTransport } from "./stack-transfer-transport";

const MARKER_NAME = ".dockge-replica.json";

interface ReplicaMarker {
    version: 1 | 2;
    replicaId: string;
    sourceEndpoint: string;
    sourceStackName: string;
    repositoryId: string;
    snapshotId: string;
    archivePath: string;
    transfer: StackTransferRequest;
    synchronizedAt: string;
    storageMode?: "restored" | "repository";
    restored?: boolean;
    configFingerprint?: string;
    storageFingerprint?: { bytes: number; fileCount: number; digest?: string };
    activatedAt?: string;
}

export interface StackReplicaSyncRequest extends StackTransferDataTargetRequest {
    replicaId: string;
    archivePath: string;
    storageMode?: "restored" | "repository";
}

function markerPath(server: DockgeServer, targetName: string): string {
    return path.join(server.stacksDir, targetName, MARKER_NAME);
}

async function readMarker(server: DockgeServer, targetName: string): Promise<ReplicaMarker | null> {
    try {
        const marker = JSON.parse(await fs.readFile(markerPath(server, targetName), "utf8")) as ReplicaMarker;
        return (marker?.version === 1 || marker?.version === 2) && typeof marker.replicaId === "string" ? marker : null;
    } catch {
        return null;
    }
}

async function writeMarker(server: DockgeServer, targetName: string, marker: ReplicaMarker): Promise<void> {
    const destination = markerPath(server, targetName);
    const temp = `${destination}.tmp`;
    await fs.writeFile(temp, JSON.stringify(marker, null, 2), { encoding: "utf8",
        mode: 0o600 });
    await fs.rename(temp, destination);
}

async function assertStopped(server: DockgeServer, targetName: string): Promise<void> {
    const stack = await Stack.getStack(server, targetName);
    const running = (await runDocker(stack.getComposeOptions("ps", "--status", "running", "--services"), stack.fullPath))
        .split("\n").map(value => value.trim()).filter(Boolean);
    if (running.length > 0) {
        throw new ValidationError(`Cold replica is running (${running.join(", ")}); stop it before synchronization`);
    }
}

async function configFingerprint(server: DockgeServer, targetName: string): Promise<string> {
    const hash = createHash("sha256");
    for (const name of [ "compose.yaml", ".env", "compose.override.yaml" ]) {
        hash.update(name);
        hash.update(await fs.readFile(path.join(server.stacksDir, targetName, name)).catch(() => Buffer.alloc(0)));
    }
    return hash.digest("hex");
}

async function newMarker(server: DockgeServer, request: StackReplicaSyncRequest, restored: boolean): Promise<ReplicaMarker> {
    const storage = restored ? await inspectRestoredTargetStorage(server, request.transfer.targetName, request.transfer.mappings) : undefined;
    return {
        version: 2,
        replicaId: request.replicaId,
        sourceEndpoint: request.transfer.sourceEndpoint,
        sourceStackName: request.transfer.sourceStackName,
        repositoryId: request.repositoryId,
        snapshotId: request.snapshotId,
        archivePath: request.archivePath,
        transfer: request.transfer,
        synchronizedAt: new Date().toISOString(),
        storageMode: request.storageMode === "repository" ? "repository" : "restored",
        restored,
        configFingerprint: await configFingerprint(server, request.transfer.targetName),
        storageFingerprint: storage ? { bytes: storage.bytes,
            fileCount: storage.fileCount,
            digest: storage.digest } : undefined,
    };
}

export async function inspectStackReplicaDrift(server: DockgeServer, targetName: string, replicaId: string): Promise<{ drifted: boolean; reason?: string }> {
    const marker = await readMarker(server, targetName);
    if (!marker || marker.replicaId !== replicaId) {
        return { drifted: true,
            reason: "Replica metadata is missing or does not match" };
    }
    try {
        await assertStopped(server, targetName);
    } catch (error) {
        return { drifted: true,
            reason: error instanceof Error ? error.message : String(error) };
    }
    if (marker.configFingerprint && await configFingerprint(server, targetName) !== marker.configFingerprint) {
        return { drifted: true,
            reason: "Replica Compose configuration was modified on the target" };
    }
    if (marker.restored !== false && marker.storageFingerprint) {
        const storage = await inspectRestoredTargetStorage(server, targetName, marker.transfer.mappings);
        if (storage.bytes !== marker.storageFingerprint.bytes || storage.fileCount !== marker.storageFingerprint.fileCount || (marker.storageFingerprint.digest && storage.digest !== marker.storageFingerprint.digest)) {
            return { drifted: true,
                reason: "Replica storage was modified on the target" };
        }
    }
    return { drifted: false };
}

export async function syncStackReplicaTarget(server: DockgeServer, socket: DockgeSocket, request: StackReplicaSyncRequest): Promise<{ jobId: string; synchronizedAt: string; repositoryId: string; snapshotId: string; archivePath: string }> {
    if (!/^[a-zA-Z0-9_-]{8,128}$/.test(request.replicaId)) {
        throw new ValidationError("Invalid replica id");
    }
    const targetDir = path.join(server.stacksDir, request.transfer.targetName);
    const exists = await fileExists(targetDir);
    const previous = exists ? await readMarker(server, request.transfer.targetName) : null;
    if (exists && (!previous || previous.replicaId !== request.replicaId)) {
        throw new ValidationError("Target stack exists and is not managed by this replica");
    }
    if (previous?.activatedAt) {
        throw new ValidationError("Activated replica cannot be overwritten");
    }
    if (previous) {
        const drift = await inspectStackReplicaDrift(server, request.transfer.targetName, request.replicaId);
        if (drift.drifted) {
            throw new ValidationError(`REPLICA_DRIFT: ${drift.reason}`);
        }
    }

    let synchronizedRequest = request;
    let cached: { repositoryId: string; snapshotId: string } | undefined;
    if (isDirectHttpRepository(request.repositoryId)) {
        cached = await cacheManagedReplicationSnapshot(request.replicaId, output => stackTransferTransport.restore(request.repositoryId, request.snapshotId, request.archivePath, output));
        synchronizedRequest = { ...request,
            ...cached };
    }

    const repositoryOnly = synchronizedRequest.storageMode === "repository";

    try {
        if (!exists) {
            const staged = repositoryOnly
                ? await importStackTransfer(server, socket, { ...synchronizedRequest.transfer,
                    deploy: false,
                    dataTransfer: false,
                    transferId: synchronizedRequest.transferId })
                : await stageStackTransferDataTarget(server, socket, synchronizedRequest);
            const marker = await newMarker(server, synchronizedRequest, !repositoryOnly);
            await writeMarker(server, request.transfer.targetName, marker);
            return { jobId: "jobId" in staged ? staged.jobId : staged.job.id,
                synchronizedAt: marker.synchronizedAt,
                repositoryId: marker.repositoryId,
                snapshotId: marker.snapshotId,
                archivePath: marker.archivePath };
        }

        await assertStopped(server, synchronizedRequest.transfer.targetName);
        await refreshImportedStackConfiguration(server, synchronizedRequest.transfer.targetName, synchronizedRequest.transfer);
        if (!repositoryOnly) {
            await createImportedStackStorage(server, synchronizedRequest.transfer.targetName);
            await restoreSnapshotToTarget(server, synchronizedRequest.transfer.targetName, synchronizedRequest.transfer.mappings, synchronizedRequest.repositoryId, synchronizedRequest.snapshotId, synchronizedRequest.archivePath);
        }
        const marker = await newMarker(server, synchronizedRequest, !repositoryOnly);
        await writeMarker(server, synchronizedRequest.transfer.targetName, marker);
        return { jobId: synchronizedRequest.replicaId,
            synchronizedAt: marker.synchronizedAt,
            repositoryId: marker.repositoryId,
            snapshotId: marker.snapshotId,
            archivePath: marker.archivePath };
    } catch (error) {
        let failure = error;
        if (previous) {
            try {
                await refreshImportedStackConfiguration(server, request.transfer.targetName, previous.transfer);
                if (previous.restored !== false) {
                    await createImportedStackStorage(server, request.transfer.targetName);
                    await restoreSnapshotToTarget(server, request.transfer.targetName, previous.transfer.mappings, previous.repositoryId, previous.snapshotId, previous.archivePath);
                }
                await writeMarker(server, request.transfer.targetName, previous);
            } catch (rollbackError) {
                failure = new Error(`${error instanceof Error ? error.message : String(error)}; replica rollback failed: ${rollbackError instanceof Error ? rollbackError.message : String(rollbackError)}`);
            }
        } else {
            await rollbackImportedStack(server, request.transfer.targetName).catch(() => {});
        }
        if (cached) {
            await cleanupManagedReplicationSnapshots(cached.repositoryId, [ cached.snapshotId ]).catch(() => {});
        }
        throw failure;
    }
}

export async function activateStackReplicaTarget(server: DockgeServer, socket: DockgeSocket, targetName: string, replicaId: string): Promise<{ activatedAt: string }> {
    const marker = await readMarker(server, targetName);
    if (!marker || marker.replicaId !== replicaId) {
        throw new ValidationError("Replica metadata does not match the requested target");
    }
    if (marker.activatedAt) {
        return { activatedAt: marker.activatedAt };
    }
    await assertStopped(server, targetName);
    try {
        if (marker.restored === false) {
            await createImportedStackStorage(server, targetName);
            await restoreSnapshotToTarget(server, targetName, marker.transfer.mappings, marker.repositoryId, marker.snapshotId, marker.archivePath);
            marker.restored = true;
            const storage = await inspectRestoredTargetStorage(server, targetName, marker.transfer.mappings);
            marker.storageFingerprint = { bytes: storage.bytes,
                fileCount: storage.fileCount,
                digest: storage.digest };
        }
        await deployAndVerifyImportedStack(server, socket, targetName);
    } catch (error) {
        const stack = await Stack.getStack(server, targetName);
        await runDocker(stack.getComposeOptions("down", "--remove-orphans"), stack.fullPath, 120_000).catch(() => {});
        await createImportedStackStorage(server, targetName).catch(() => {});
        throw error;
    }
    marker.activatedAt = new Date().toISOString();
    marker.configFingerprint = await configFingerprint(server, targetName);
    await writeMarker(server, targetName, marker);
    return { activatedAt: marker.activatedAt };
}

export interface StackReplicaRecoveryReport {
    testedAt: string;
    durationMs: number;
    bytesRead: number;
    fileCount: number;
    mountsChecked: number;
    containersStarted: boolean;
    warnings: string[];
}

function sanitizeRecoveryCompose(content: string, warnings: string[]): string {
    if (!content.trim()) {
        return "";
    }
    const config = yaml.parse(content) as Record<string, unknown>;
    const services = config.services && typeof config.services === "object" ? config.services as Record<string, unknown> : {};
    for (const service of Object.values(services) as Array<Record<string, unknown>>) {
        if (service.ports) {
            delete service.ports;
            if (!warnings.includes("Published ports were disabled")) {
                warnings.push("Published ports were disabled");
            }
        }
        delete service.container_name;
        for (const dependency of [ "configs", "secrets" ]) {
            if (service[dependency]) {
                delete service[dependency];
                if (!warnings.includes(`External ${dependency} were disabled`)) {
                    warnings.push(`External ${dependency} were disabled`);
                }
            }
        }
    }
    for (const name of [ "networks", "volumes" ]) {
        const definitions = config[name] && typeof config[name] === "object" ? config[name] as Record<string, unknown> : {};
        for (const definition of Object.values(definitions) as Array<Record<string, unknown>>) {
            if (definition && typeof definition === "object") {
                delete definition.external;
                delete definition.name;
            }
        }
    }
    delete config.configs;
    delete config.secrets;
    return yaml.stringify(config);
}

async function recoveryProjectVolumes(project: string): Promise<string[]> {
    return (await runDocker([ "volume", "ls", "-q", "--filter", `label=com.docker.compose.project=${project}` ]))
        .split(/\s+/).filter(Boolean);
}

export async function testStackReplicaSnapshot(server: DockgeServer, socket: DockgeSocket, targetName: string, replicaId: string, startContainers = false): Promise<StackReplicaRecoveryReport> {
    const marker = await readMarker(server, targetName);
    if (!marker || marker.replicaId !== replicaId || marker.activatedAt) {
        throw new ValidationError("A synchronized, inactive replica is required for a recovery test");
    }
    await assertStopped(server, targetName);
    const started = Date.now();
    const suffix = `${replicaId.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 32)}-${started.toString(36)}`;
    const recoveryName = `dockge-recovery-${suffix}`.toLowerCase();
    const warnings: string[] = [];
    const mappings = marker.transfer.mappings.map((mapping, index) => mapping.type === "bind" || mapping.type === "volume"
        ? { ...mapping,
            targetSource: mapping.type === "bind" ? `./.dockge-recovery-data/${index}` : `recovery_${index}`,
            external: false }
        : mapping);
    const transfer: StackTransferRequest = { ...marker.transfer,
        operation: "copy",
        targetName: recoveryName,
        composeYAML: sanitizeRecoveryCompose(marker.transfer.composeYAML, warnings),
        composeOverrideYAML: sanitizeRecoveryCompose(marker.transfer.composeOverrideYAML, warnings),
        mappings,
        deploy: false };
    let volumes: string[] = [];
    try {
        await importStackTransfer(server, socket, transfer);
        await createImportedStackStorage(server, recoveryName);
        volumes = await recoveryProjectVolumes(recoveryName);
        await restoreSnapshotToTarget(server, recoveryName, mappings, marker.repositoryId, marker.snapshotId, marker.archivePath);
        const storage = await inspectRestoredTargetStorage(server, recoveryName, mappings);
        if (storage.bytes === 0) {
            throw new Error("Replica recovery test restored empty storage");
        }
        if (startContainers) {
            await deployAndVerifyImportedStack(server, socket, recoveryName);
        }
        return { testedAt: new Date().toISOString(),
            durationMs: Date.now() - started,
            bytesRead: storage.bytes,
            fileCount: storage.fileCount,
            mountsChecked: storage.mounts.length,
            containersStarted: startContainers,
            warnings };
    } finally {
        const recoveryDir = path.join(server.stacksDir, recoveryName);
        if (await fileExists(recoveryDir)) {
            await runDocker([
                "run", "--rm", "--network", "none",
                "--mount", `type=bind,src=${recoveryDir},dst=/recovery`,
                process.env.DOCKGE_VOLUME_HELPER_IMAGE || "busybox:stable",
                "rm", "-rf", "/recovery/.dockge-recovery-data",
            ]).catch(() => {});
        }
        await rollbackImportedStack(server, recoveryName).catch(() => {});
        if (volumes.length > 0) {
            await runDocker([ "volume", "rm", ...volumes ]).catch(() => {});
        }
    }
}
