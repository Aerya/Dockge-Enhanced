import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from "node:crypto";
import { createReadStream, createWriteStream, promises as fs } from "node:fs";
import path from "node:path";
import { Writable } from "node:stream";
import { finished } from "node:stream/promises";

const REPOSITORY_PREFIX = "managed-replica:";
const SNAPSHOT_PREFIX = "managed-snapshot:";
let storageRoot = path.resolve(process.env.DOCKGE_DATA_DIR || "./data", "transfers", "managed-replication");

interface ManagedSnapshot {
    id: string;
    sha256: string;
    size: number;
    key: string;
    iv: string;
    authTag: string;
}

function safeReplicaId(value: string): string {
    if (!/^[a-zA-Z0-9_-]{8,128}$/.test(value)) {
        throw new Error("Invalid managed replica id");
    }
    return value;
}

function safeSnapshot(value: string): ManagedSnapshot {
    if (!value.startsWith(SNAPSHOT_PREFIX)) {
        throw new Error("Invalid managed replication snapshot");
    }
    const result = JSON.parse(Buffer.from(value.slice(SNAPSHOT_PREFIX.length), "base64url").toString("utf8")) as ManagedSnapshot;
    if (!/^[a-f0-9-]{36}$/.test(result.id) || !/^[a-f0-9]{64}$/.test(result.sha256) || !Number.isFinite(result.size) || result.size < 0 || !/^[A-Za-z0-9_-]{43}$/.test(result.key) || !/^[A-Za-z0-9_-]{16}$/.test(result.iv) || !/^[A-Za-z0-9_-]{22}$/.test(result.authTag)) {
        throw new Error("Invalid managed replication snapshot");
    }
    return result;
}

function replicaId(repositoryId: string): string {
    if (!repositoryId.startsWith(REPOSITORY_PREFIX)) {
        throw new Error("Invalid managed replication repository");
    }
    return safeReplicaId(repositoryId.slice(REPOSITORY_PREFIX.length));
}

function snapshotPath(repositoryId: string, snapshotId: string): string {
    return path.join(storageRoot, replicaId(repositoryId), `${safeSnapshot(snapshotId).id}.archive`);
}

async function hashFile(file: string): Promise<string> {
    const hash = createHash("sha256");
    for await (const chunk of createReadStream(file)) {
        hash.update(chunk as Buffer);
    }
    return hash.digest("hex");
}

export function configureManagedReplicationTransport(dataDir: string): void {
    storageRoot = path.resolve(dataDir, "transfers", "managed-replication");
}

export function isManagedReplicationRepository(repositoryId: string): boolean {
    return repositoryId.startsWith(REPOSITORY_PREFIX);
}

export async function cacheManagedReplicationSnapshot(replicaIdValue: string, writeArchive: (output: Writable) => Promise<void>): Promise<{ repositoryId: string; snapshotId: string }> {
    const id = safeReplicaId(replicaIdValue);
    const repositoryId = `${REPOSITORY_PREFIX}${id}`;
    const snapshot = randomUUID();
    const directory = path.join(storageRoot, id);
    const file = path.join(directory, `${snapshot}.archive`);
    const temporary = `${file}.tmp`;
    const key = randomBytes(32);
    const iv = randomBytes(12);
    await fs.mkdir(directory, { recursive: true,
        mode: 0o700 });
    const fileOutput = createWriteStream(temporary, { mode: 0o600 });
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    cipher.pipe(fileOutput);
    try {
        await writeArchive(cipher);
        cipher.end();
        await finished(fileOutput);
        const stat = await fs.stat(temporary);
        const descriptor: ManagedSnapshot = { id: snapshot,
            sha256: await hashFile(temporary),
            size: stat.size,
            key: key.toString("base64url"),
            iv: iv.toString("base64url"),
            authTag: cipher.getAuthTag().toString("base64url") };
        await fs.rename(temporary, file);
        return { repositoryId,
            snapshotId: `${SNAPSHOT_PREFIX}${Buffer.from(JSON.stringify(descriptor)).toString("base64url")}` };
    } catch (error) {
        cipher.destroy();
        fileOutput.destroy();
        await fs.unlink(temporary).catch(() => {});
        throw error;
    }
}

export async function verifyManagedReplicationSnapshot(repositoryId: string, snapshotId: string): Promise<void> {
    const descriptor = safeSnapshot(snapshotId);
    const file = snapshotPath(repositoryId, snapshotId);
    const stat = await fs.stat(file);
    if (stat.size !== descriptor.size || await hashFile(file) !== descriptor.sha256) {
        throw new Error("Managed replication snapshot verification failed");
    }
}

export async function restoreManagedReplicationSnapshot(repositoryId: string, snapshotId: string, output: Writable): Promise<void> {
    await verifyManagedReplicationSnapshot(repositoryId, snapshotId);
    const descriptor = safeSnapshot(snapshotId);
    await new Promise<void>((resolve, reject) => {
        const input = createReadStream(snapshotPath(repositoryId, snapshotId));
        const decipher = createDecipheriv("aes-256-gcm", Buffer.from(descriptor.key, "base64url"), Buffer.from(descriptor.iv, "base64url"));
        decipher.setAuthTag(Buffer.from(descriptor.authTag, "base64url"));
        input.once("error", reject);
        decipher.once("error", reject);
        output.once("error", reject);
        decipher.once("end", resolve);
        input.pipe(decipher).pipe(output, { end: false });
    });
}

export async function managedReplicationSnapshotSize(repositoryId: string, snapshotId: string): Promise<number> {
    replicaId(repositoryId);
    return safeSnapshot(snapshotId).size;
}

export async function cleanupManagedReplicationSnapshots(repositoryId: string, snapshotIds: string[]): Promise<void> {
    const directory = path.join(storageRoot, replicaId(repositoryId));
    for (const snapshotId of snapshotIds) {
        await fs.unlink(snapshotPath(repositoryId, snapshotId)).catch(() => {});
    }
    await fs.rmdir(directory).catch(() => {});
}
