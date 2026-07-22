import path from "node:path";
import { promises as fs } from "node:fs";
import { Writable } from "node:stream";
import { DockgeServer } from "../dockge-server";
import { Stack } from "../stack";
import { DockgeSocket, fileExists, ValidationError } from "../util-server";
import {
    createImportedStackStorage,
    deployAndVerifyImportedStack,
    refreshImportedStackConfiguration,
    rollbackImportedStack,
    runDocker,
    StackTransferRequest,
} from "./stack-transfer";
import {
    restoreSnapshotToTarget,
    stageStackTransferDataTarget,
    StackTransferDataTargetRequest,
} from "./stack-data-transfer";
import { restoreStackTransferArchive } from "./stack-transfer-restic";

const MARKER_NAME = ".dockge-replica.json";

interface ReplicaMarker {
    version: 1;
    replicaId: string;
    sourceEndpoint: string;
    sourceStackName: string;
    repositoryId: string;
    snapshotId: string;
    archivePath: string;
    transfer: StackTransferRequest;
    synchronizedAt: string;
    activatedAt?: string;
}

export interface StackReplicaSyncRequest extends StackTransferDataTargetRequest {
    replicaId: string;
    archivePath: string;
}

function markerPath(server: DockgeServer, targetName: string): string {
    return path.join(server.stacksDir, targetName, MARKER_NAME);
}

async function readMarker(server: DockgeServer, targetName: string): Promise<ReplicaMarker | null> {
    try {
        const marker = JSON.parse(await fs.readFile(markerPath(server, targetName), "utf8")) as ReplicaMarker;
        return marker?.version === 1 && typeof marker.replicaId === "string" ? marker : null;
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

function newMarker(request: StackReplicaSyncRequest): ReplicaMarker {
    return {
        version: 1,
        replicaId: request.replicaId,
        sourceEndpoint: request.transfer.sourceEndpoint,
        sourceStackName: request.transfer.sourceStackName,
        repositoryId: request.repositoryId,
        snapshotId: request.snapshotId,
        archivePath: request.archivePath,
        transfer: request.transfer,
        synchronizedAt: new Date().toISOString(),
    };
}

export async function syncStackReplicaTarget(server: DockgeServer, socket: DockgeSocket, request: StackReplicaSyncRequest): Promise<{ jobId: string; synchronizedAt: string }> {
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

    if (!exists) {
        const staged = await stageStackTransferDataTarget(server, socket, request);
        const marker = newMarker(request);
        try {
            await writeMarker(server, request.transfer.targetName, marker);
            return { jobId: staged.jobId,
                synchronizedAt: marker.synchronizedAt };
        } catch (error) {
            await rollbackImportedStack(server, request.transfer.targetName);
            throw error;
        }
    }

    await assertStopped(server, request.transfer.targetName);
    try {
        await refreshImportedStackConfiguration(server, request.transfer.targetName, request.transfer);
        await createImportedStackStorage(server, request.transfer.targetName);
        await restoreSnapshotToTarget(server, request.transfer.targetName, request.transfer.mappings, request.repositoryId, request.snapshotId, request.archivePath);
        const marker = newMarker(request);
        await writeMarker(server, request.transfer.targetName, marker);
        return { jobId: request.replicaId,
            synchronizedAt: marker.synchronizedAt };
    } catch (error) {
        if (previous) {
            try {
                await refreshImportedStackConfiguration(server, request.transfer.targetName, previous.transfer);
                await createImportedStackStorage(server, request.transfer.targetName);
                await restoreSnapshotToTarget(server, request.transfer.targetName, previous.transfer.mappings, previous.repositoryId, previous.snapshotId, previous.archivePath);
                await writeMarker(server, request.transfer.targetName, previous);
            } catch (rollbackError) {
                throw new Error(`${error instanceof Error ? error.message : String(error)}; replica rollback failed: ${rollbackError instanceof Error ? rollbackError.message : String(rollbackError)}`);
            }
        }
        throw error;
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
        await deployAndVerifyImportedStack(server, socket, targetName);
    } catch (error) {
        const stack = await Stack.getStack(server, targetName);
        await runDocker(stack.getComposeOptions("down", "--remove-orphans"), stack.fullPath, 120_000).catch(() => {});
        await createImportedStackStorage(server, targetName).catch(() => {});
        throw error;
    }
    marker.activatedAt = new Date().toISOString();
    await writeMarker(server, targetName, marker);
    return { activatedAt: marker.activatedAt };
}

export async function testStackReplicaSnapshot(server: DockgeServer, targetName: string, replicaId: string): Promise<{ bytesRead: number; testedAt: string }> {
    const marker = await readMarker(server, targetName);
    if (!marker || marker.replicaId !== replicaId || marker.activatedAt) {
        throw new ValidationError("A synchronized, inactive replica is required for a recovery test");
    }
    await assertStopped(server, targetName);
    let bytesRead = 0;
    const sink = new Writable({
        write(chunk, _encoding, callback) {
            bytesRead += Buffer.byteLength(chunk);
            callback();
        },
    });
    await restoreStackTransferArchive(marker.repositoryId, marker.snapshotId, marker.archivePath, sink);
    if (bytesRead === 0) {
        throw new Error("Replica recovery test restored an empty archive");
    }
    return { bytesRead,
        testedAt: new Date().toISOString() };
}
