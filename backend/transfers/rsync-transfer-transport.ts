import { createHash, randomUUID } from "node:crypto";
import { createReadStream, createWriteStream, promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { Readable, Writable } from "node:stream";
import { pipeline } from "node:stream/promises";

const execFileAsync = promisify(execFile);
const REPOSITORY_PREFIX = "rsync:";
const SNAPSHOT_PREFIX = "rsync-snapshot:";

export interface RsyncTransferProfile {
    id: string;
    label: string;
    host: string;
    port?: number;
    user: string;
    path: string;
    keyPath: string;
    bandwidthKbps?: number;
}

interface RsyncSnapshot {
    id: string;
    file: string;
    sha256: string;
    size: number;
}

function profiles(): RsyncTransferProfile[] {
    let values: unknown = [];
    try {
        values = JSON.parse(process.env.DOCKGE_TRANSFER_RSYNC_PROFILES || "[]");
    } catch {
        return [];
    }
    if (!Array.isArray(values)) {
        return [];
    }
    return values.flatMap(raw => {
        if (!raw || typeof raw !== "object") {
            return [];
        }
        const value = raw as Record<string, unknown>;
        if (![ "label", "host", "user", "path", "keyPath" ].every(key => typeof value[key] === "string" && value[key])) {
            return [];
        }
        if (!/^[a-zA-Z0-9._-]+$/.test(String(value.host)) || !/^[a-zA-Z0-9._-]+$/.test(String(value.user)) || !/^\/[a-zA-Z0-9_./-]+$/.test(String(value.path)) || !/^\/[a-zA-Z0-9_./-]+$/.test(String(value.keyPath))) {
            return [];
        }
        const identity = `${value.user}@${value.host}:${Number(value.port) || 22}:${value.path}`;
        return [{ id: createHash("sha256").update(identity).digest("hex").slice(0, 24),
            label: String(value.label),
            host: String(value.host),
            port: Math.min(65535, Math.max(1, Number(value.port) || 22)),
            user: String(value.user),
            path: String(value.path).replace(/\/$/, ""),
            keyPath: String(value.keyPath),
            bandwidthKbps: Number(value.bandwidthKbps) > 0 ? Math.floor(Number(value.bandwidthKbps)) : undefined }];
    });
}

function profile(repositoryId: string): RsyncTransferProfile {
    if (!repositoryId.startsWith(REPOSITORY_PREFIX)) {
        throw new Error("Invalid rsync repository");
    }
    const result = profiles().find(item => item.id === repositoryId.slice(REPOSITORY_PREFIX.length));
    if (!result) {
        throw new Error("Rsync transfer profile is not configured on this instance");
    }
    return result;
}

function snapshot(value: string): RsyncSnapshot {
    if (!value.startsWith(SNAPSHOT_PREFIX)) {
        throw new Error("Invalid rsync snapshot");
    }
    const result = JSON.parse(Buffer.from(value.slice(SNAPSHOT_PREFIX.length), "base64url").toString("utf8")) as RsyncSnapshot;
    if (!/^[a-f0-9-]{36}$/.test(result.id) || !/^dockge-[a-f0-9-]{36}\.archive$/.test(result.file) || !/^[a-f0-9]{64}$/.test(result.sha256) || !Number.isFinite(result.size)) {
        throw new Error("Invalid rsync snapshot");
    }
    return result;
}

function sshCommand(config: RsyncTransferProfile): string {
    return `ssh -i ${config.keyPath} -p ${config.port || 22} -o BatchMode=yes -o StrictHostKeyChecking=yes`;
}

function remote(config: RsyncTransferProfile, file = ""): string {
    return `${config.user}@${config.host}:${config.path}${file ? `/${file}` : ""}`;
}

function args(config: RsyncTransferProfile, dryRun = false): string[] {
    return [ "--archive", "--partial", "--append-verify", "--protect-args", "--itemize-changes",
        ...(dryRun ? [ "--dry-run" ] : []),
        ...(config.bandwidthKbps ? [ `--bwlimit=${config.bandwidthKbps}` ] : []),
        "-e", sshCommand(config) ];
}

async function hashFile(file: string): Promise<string> {
    const hash = createHash("sha256");
    for await (const chunk of createReadStream(file)) {
        hash.update(chunk as Buffer);
    }
    return hash.digest("hex");
}

export function isRsyncRepository(value: string): boolean {
    return value.startsWith(REPOSITORY_PREFIX);
}

export function listRsyncRepositories(): Array<{ id: string; label: string; type: "rsync" }> {
    return profiles().map(item => ({ id: `${REPOSITORY_PREFIX}${item.id}`,
        label: item.label,
        type: "rsync" }));
}

export async function prepareRsyncRepository(repositoryId: string): Promise<void> {
    const config = profile(repositoryId);
    await execFileAsync("ssh", [ "-i", config.keyPath, "-p", String(config.port || 22), "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=yes", `${config.user}@${config.host}`, "mkdir", "-p", "--", config.path ], { timeout: 30_000 });
}

export async function uploadRsyncArchive(repositoryId: string, input: Readable): Promise<string> {
    const config = profile(repositoryId);
    const id = randomUUID();
    const filename = `dockge-${id}.archive`;
    const local = path.join(os.tmpdir(), filename);
    try {
        await pipeline(input, createWriteStream(local, { mode: 0o600 }));
        const stat = await fs.stat(local);
        const descriptor: RsyncSnapshot = { id,
            file: filename,
            sha256: await hashFile(local),
            size: stat.size };
        await execFileAsync("rsync", [ ...args(config, true), local, remote(config, filename) ], { timeout: 120_000 });
        await execFileAsync("rsync", [ ...args(config), local, remote(config, filename) ], { timeout: 24 * 60 * 60_000 });
        return `${SNAPSHOT_PREFIX}${Buffer.from(JSON.stringify(descriptor)).toString("base64url")}`;
    } finally {
        await fs.unlink(local).catch(() => {});
    }
}

function localPartial(descriptor: RsyncSnapshot): string {
    return path.join(os.tmpdir(), `dockge-rsync-download-${descriptor.id}.part`);
}

export async function resumeRsyncArchive(repositoryId: string, snapshotId: string): Promise<{ offset: number; size: number }> {
    profile(repositoryId);
    const descriptor = snapshot(snapshotId);
    const offset = (await fs.stat(localPartial(descriptor)).catch(() => ({ size: 0 }))).size;
    return { offset: Math.min(offset, descriptor.size),
        size: descriptor.size };
}

export async function verifyRsyncArchive(repositoryId: string, snapshotId: string): Promise<void> {
    const config = profile(repositoryId);
    const descriptor = snapshot(snapshotId);
    const result = await execFileAsync("rsync", [ "--list-only", "-e", sshCommand(config), remote(config, descriptor.file) ], { timeout: 30_000 });
    const size = Number(result.stdout.trim().split(/\s+/)[1]);
    if (size !== descriptor.size) {
        throw new Error("Rsync archive size verification failed");
    }
}

export async function restoreRsyncArchive(repositoryId: string, snapshotId: string, output: Writable): Promise<void> {
    const config = profile(repositoryId);
    const descriptor = snapshot(snapshotId);
    const local = localPartial(descriptor);
    await execFileAsync("rsync", [ ...args(config), remote(config, descriptor.file), local ], { timeout: 24 * 60 * 60_000 });
    if ((await fs.stat(local)).size !== descriptor.size || await hashFile(local) !== descriptor.sha256) {
        throw new Error("Rsync checksum verification failed");
    }
    await new Promise<void>((resolve, reject) => {
        const input = createReadStream(local);
        input.once("error", reject);
        output.once("error", reject);
        input.once("end", resolve);
        input.pipe(output, { end: false });
    });
    await fs.unlink(local).catch(() => {});
}

export async function cleanupRsyncArchives(repositoryId: string, snapshotIds: string[]): Promise<void> {
    const config = profile(repositoryId);
    for (const value of snapshotIds) {
        const descriptor = snapshot(value);
        await fs.unlink(localPartial(descriptor)).catch(() => {});
        await execFileAsync("ssh", [ "-i", config.keyPath, "-p", String(config.port || 22), "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=yes", `${config.user}@${config.host}`, "rm", "-f", "--", `${config.path}/${descriptor.file}` ], { timeout: 30_000 });
    }
}
