import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import { Readable, Writable } from "node:stream";
import { BackupDestination, BackupManager, DestinationType } from "../watchers/backup-manager";

export interface StackTransferRepository {
    id: string;
    label: string;
    type: DestinationType;
}

function sanitizePort(value: unknown, fallback = 22): number {
    const port = Number(value);
    if (!Number.isFinite(port)) {
        return fallback;
    }
    return Math.min(65535, Math.max(1, Math.floor(port)));
}

function repositoryUrl(destination: BackupDestination): string {
    switch (destination.type) {
        case "local":
            return destination.local!.path;
        case "sftp":
            return `sftp:${destination.sftp!.user}@${destination.sftp!.host}:${destination.sftp!.path}`;
        case "s3": {
            const config = destination.s3!;
            const endpoint = config.endpoint?.replace(/\/$/, "") || "s3.amazonaws.com";
            return `s3:${endpoint}/${config.bucket}/${config.path}`;
        }
        case "rest": {
            const config = destination.rest!;
            const url = new URL(config.url);
            if (config.user && config.password) {
                url.username = config.user;
                url.password = config.password;
            }
            return `rest:${url.toString()}`;
        }
    }
}

function repositoryLocation(destination: BackupDestination): string {
    switch (destination.type) {
        case "local":
            return `local:${destination.local?.path ?? ""}`;
        case "sftp":
            return `sftp:${destination.sftp?.user ?? ""}@${destination.sftp?.host ?? ""}:${sanitizePort(destination.sftp?.port)}:${destination.sftp?.path ?? ""}`;
        case "s3":
            return `s3:${destination.s3?.endpoint ?? ""}:${destination.s3?.bucket ?? ""}:${destination.s3?.path ?? ""}`;
        case "rest": {
            const url = new URL(destination.rest?.url ?? "http://invalid.local");
            url.username = "";
            url.password = "";
            return `rest:${url.toString()}`;
        }
    }
}

function repositoryId(destination: BackupDestination): string {
    return createHash("sha256")
        .update(`${repositoryLocation(destination)}\0${destination.resticPassword}`)
        .digest("hex")
        .slice(0, 24);
}

function repositoryEnv(destination: BackupDestination): NodeJS.ProcessEnv {
    const env: NodeJS.ProcessEnv = {
        PATH: "/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin",
        ...process.env,
        RESTIC_PASSWORD: destination.resticPassword,
        RESTIC_REPOSITORY: repositoryUrl(destination),
    };
    if (destination.type === "s3" && destination.s3) {
        env.AWS_ACCESS_KEY_ID = destination.s3.accessKeyId;
        env.AWS_SECRET_ACCESS_KEY = destination.s3.secretAccessKey;
        if (destination.s3.region) {
            env.AWS_DEFAULT_REGION = destination.s3.region;
        }
    }
    return env;
}

async function sftpArguments(destination: BackupDestination): Promise<{ args: string[]; passwordFile?: string }> {
    if (destination.type !== "sftp" || !destination.sftp) {
        return { args: [] };
    }
    const config = destination.sftp;
    const port = sanitizePort(config.port);
    if (config.authMode === "password" && config.password) {
        const passwordFile = `/tmp/dockge_transfer_sshpass_${Date.now()}_${Math.random().toString(36).slice(2)}`;
        await fs.writeFile(passwordFile, config.password, { mode: 0o600 });
        const command = [
            "/usr/bin/sshpass", "-f", passwordFile,
            "/usr/bin/ssh", "-l", config.user, "-p", String(port),
            "-o", "StrictHostKeyChecking=no",
            "-o", "PreferredAuthentications=password",
            "-o", "BatchMode=no", config.host, "-s", "sftp",
        ].join(" ");
        return { args: [ "-o", `sftp.command=${command}` ],
            passwordFile };
    }
    if (config.authMode === "key") {
        const args = [
            ...(config.keyPath ? [ "-i", config.keyPath ] : []),
            "-p", String(port), "-o", "StrictHostKeyChecking=no",
        ].join(" ");
        return { args: [ "-o", `sftp.args=${args}` ] };
    }
    return { args: [] };
}

async function runRestic(
    destination: BackupDestination,
    args: string[],
    options: { input?: Readable; output?: Writable; json?: boolean } = {},
): Promise<string> {
    const sftp = await sftpArguments(destination);
    try {
        const child = spawn("restic", [
            "--repo", repositoryUrl(destination),
            ...(options.json === false ? [] : [ "--json" ]),
            ...sftp.args,
            ...args,
        ], {
            env: repositoryEnv(destination),
            stdio: [ "pipe", "pipe", "pipe" ],
        });
        let stdout = "";
        let stderr = "";
        child.stdout.on("data", chunk => {
            if (!options.output) {
                stdout += String(chunk);
            }
        });
        child.stderr.on("data", chunk => {
            stderr += String(chunk);
        });
        if (options.output) {
            child.stdout.pipe(options.output, { end: false });
        }
        if (options.input) {
            options.input.pipe(child.stdin);
        } else {
            child.stdin.end();
        }
        const code = await new Promise<number>((resolve, reject) => {
            child.once("error", reject);
            child.once("close", value => resolve(value ?? 1));
            options.input?.once("error", reject);
            options.output?.once("error", reject);
        });
        if (code !== 0) {
            throw new Error(stderr.trim() || `restic exited with code ${code}`);
        }
        return stdout.trim();
    } finally {
        if (sftp.passwordFile) {
            await fs.unlink(sftp.passwordFile).catch(() => {});
        }
    }
}

function destinationFor(id: string): BackupDestination {
    if (!/^[a-f0-9]{24}$/.test(id)) {
        throw new Error("Invalid shared Restic repository id");
    }
    const destination = BackupManager.getInstance().settings.destinations
        .find(item => item.enabled && item.resticPassword && repositoryId(item) === id);
    if (!destination) {
        throw new Error("Shared Restic repository is not configured on this instance");
    }
    if (BackupManager.getInstance().getRunningDests().some(item => item.label === destination.label)) {
        throw new Error(`Restic backup "${destination.label}" is currently running; retry the stack transfer when it finishes`);
    }
    return destination;
}

function safeSnapshotId(id: string): string {
    if (!/^[a-zA-Z0-9_-]{1,128}$/.test(id)) {
        throw new Error("Invalid Restic snapshot id");
    }
    return id;
}

export function getStackTransferRepositories(): StackTransferRepository[] {
    return BackupManager.getInstance().settings.destinations
        .filter(destination => destination.enabled && Boolean(destination.resticPassword))
        .map(destination => ({
            id: repositoryId(destination),
            label: destination.label,
            type: destination.type,
        }));
}

export async function ensureStackTransferRepository(id: string): Promise<void> {
    const destination = destinationFor(id);
    try {
        await runRestic(destination, [ "snapshots", "--quiet" ]);
    } catch {
        await runRestic(destination, [ "init" ]);
    }
}

export async function backupStackTransferArchive(id: string, archivePath: string, tags: string[], input: Readable, repositoryReady = false): Promise<string> {
    if (!archivePath.startsWith("/dockge-stack-transfer/") || !tags.every(tag => /^[a-zA-Z0-9_.:-]{1,128}$/.test(tag))) {
        throw new Error("Invalid transfer snapshot parameters");
    }
    if (!repositoryReady) {
        await ensureStackTransferRepository(id);
    }
    const stdout = await runRestic(destinationFor(id), [
        "backup", "--stdin", "--stdin-filename", archivePath,
        ...tags.flatMap(tag => [ "--tag", tag ]),
    ], { input });
    for (const line of stdout.split("\n").reverse()) {
        try {
            const item = JSON.parse(line) as Record<string, unknown>;
            if (item.message_type === "summary" && typeof item.snapshot_id === "string") {
                return safeSnapshotId(item.snapshot_id);
            }
        } catch { /* try previous line */ }
    }
    throw new Error("Restic did not return a snapshot id");
}

export async function restoreStackTransferArchive(id: string, snapshotId: string, archivePath: string, output: Writable): Promise<void> {
    if (!archivePath.startsWith("/dockge-stack-transfer/")) {
        throw new Error("Invalid transfer archive path");
    }
    await runRestic(destinationFor(id), [ "dump", safeSnapshotId(snapshotId), archivePath ], { output,
        json: false });
}

export async function forgetStackTransferSnapshots(id: string, snapshotIds: string[]): Promise<void> {
    if (snapshotIds.length === 0) {
        return;
    }
    await runRestic(destinationFor(id), [ "forget", ...snapshotIds.map(safeSnapshotId) ]);
}
