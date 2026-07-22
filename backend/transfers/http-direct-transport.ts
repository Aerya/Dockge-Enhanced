import { createHash, randomBytes, randomUUID } from "node:crypto";
import { createReadStream, createWriteStream, promises as fs } from "node:fs";
import path from "node:path";
import { Readable, Transform, Writable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { Request, Response } from "express";

const REPOSITORY_PREFIX = "direct-http:";
const SNAPSHOT_PREFIX = "http-snapshot:";
const SESSION_TTL_MS = 60 * 60_000;
let transferRoot = path.resolve(process.env.DOCKGE_DATA_DIR || "./data", "transfers", "http-direct");

interface DirectRepository {
    baseUrl: string;
    bandwidthKbps?: number;
}

interface DirectSnapshot {
    id: string;
    token: string;
    sha256: string;
    size: number;
    expiresAt: string;
    bandwidthKbps?: number;
}

interface StoredSession extends Omit<DirectSnapshot, "token"> {
    tokenHash: string;
}

function encode(value: unknown): string {
    return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function decode<T>(value: string): T {
    return JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as T;
}

function safeId(value: string): string {
    if (!/^[a-f0-9-]{36}$/.test(value)) {
        throw new Error("Invalid direct transfer id");
    }
    return value;
}

function repository(value: string): DirectRepository {
    if (!value.startsWith(REPOSITORY_PREFIX)) {
        throw new Error("Invalid direct HTTP repository");
    }
    const result = decode<DirectRepository>(value.slice(REPOSITORY_PREFIX.length));
    const url = new URL(result.baseUrl);
    if (![ "http:", "https:" ].includes(url.protocol) || url.username || url.password) {
        throw new Error("Invalid direct HTTP URL");
    }
    return { baseUrl: url.toString().replace(/\/$/, ""),
        bandwidthKbps: result.bandwidthKbps && result.bandwidthKbps > 0 ? Math.floor(result.bandwidthKbps) : undefined };
}

function snapshot(value: string): DirectSnapshot {
    if (!value.startsWith(SNAPSHOT_PREFIX)) {
        throw new Error("Invalid direct HTTP snapshot");
    }
    const result = decode<DirectSnapshot>(value.slice(SNAPSHOT_PREFIX.length));
    safeId(result.id);
    if (!/^[a-f0-9]{64}$/.test(result.sha256) || !result.token || result.size < 0 || !Number.isFinite(result.size)) {
        throw new Error("Invalid direct HTTP snapshot");
    }
    return result;
}

function archivePath(id: string): string {
    return path.join(transferRoot, `${safeId(id)}.archive`);
}

function sessionPath(id: string): string {
    return path.join(transferRoot, `${safeId(id)}.json`);
}

function partialPath(id: string): string {
    return path.join(transferRoot, "downloads", `${safeId(id)}.part`);
}

async function hashFile(file: string): Promise<string> {
    const hash = createHash("sha256");
    for await (const chunk of createReadStream(file)) {
        hash.update(chunk as Buffer);
    }
    return hash.digest("hex");
}

async function cleanupExpired(): Promise<void> {
    await fs.mkdir(transferRoot, { recursive: true,
        mode: 0o700 });
    for (const name of await fs.readdir(transferRoot)) {
        if (!name.endsWith(".json")) {
            continue;
        }
        try {
            const stored = JSON.parse(await fs.readFile(path.join(transferRoot, name), "utf8")) as StoredSession;
            if (new Date(stored.expiresAt).getTime() <= Date.now()) {
                await fs.unlink(path.join(transferRoot, name)).catch(() => {});
                await fs.unlink(archivePath(stored.id)).catch(() => {});
            }
        } catch { /* ignore unrelated or incomplete entries */ }
    }
    const downloads = path.join(transferRoot, "downloads");
    for (const name of await fs.readdir(downloads).catch(() => [])) {
        const file = path.join(downloads, name);
        const stat = await fs.stat(file).catch(() => null);
        if (stat && stat.mtimeMs < Date.now() - SESSION_TTL_MS) {
            await fs.unlink(file).catch(() => {});
        }
    }
}

export function configureHttpDirectTransport(dataDir: string): void {
    transferRoot = path.resolve(dataDir, "transfers", "http-direct");
}

export function directHttpRepositoryId(baseUrl: string, bandwidthKbps?: number): string {
    return `${REPOSITORY_PREFIX}${encode({ baseUrl,
        bandwidthKbps })}`;
}

export function isDirectHttpRepository(value: string): boolean {
    return value.startsWith(REPOSITORY_PREFIX);
}

export function directHttpUsesTls(value: string): boolean {
    return repository(value).baseUrl.startsWith("https://");
}

export async function uploadDirectHttpArchive(repositoryId: string, input: Readable): Promise<string> {
    repository(repositoryId);
    await cleanupExpired();
    const id = randomUUID();
    const token = randomBytes(32).toString("base64url");
    const file = archivePath(id);
    try {
        await pipeline(input, createWriteStream(file, { mode: 0o600 }));
    } catch (error) {
        await fs.unlink(file).catch(() => {});
        throw error;
    }
    const stat = await fs.stat(file);
    const config = repository(repositoryId);
    const descriptor: DirectSnapshot = { id,
        token,
        sha256: await hashFile(file),
        size: stat.size,
        expiresAt: new Date(Date.now() + SESSION_TTL_MS).toISOString(),
        bandwidthKbps: config.bandwidthKbps };
    const stored: StoredSession = { id,
        tokenHash: createHash("sha256").update(token).digest("hex"),
        sha256: descriptor.sha256,
        size: descriptor.size,
        expiresAt: descriptor.expiresAt,
        bandwidthKbps: descriptor.bandwidthKbps };
    await fs.writeFile(sessionPath(id), JSON.stringify(stored), { mode: 0o600 });
    return `${SNAPSHOT_PREFIX}${encode(descriptor)}`;
}

async function requestHeaders(descriptor: DirectSnapshot, offset = 0): Promise<Record<string, string>> {
    return { Authorization: `Bearer ${descriptor.token}`,
        ...(offset > 0 ? { Range: `bytes=${offset}-` } : {}) };
}

async function download(repositoryId: string, snapshotId: string): Promise<string> {
    const config = repository(repositoryId);
    const descriptor = snapshot(snapshotId);
    if (new Date(descriptor.expiresAt).getTime() <= Date.now()) {
        throw new Error("Direct HTTP transfer token expired");
    }
    const destination = partialPath(descriptor.id);
    await fs.mkdir(path.dirname(destination), { recursive: true,
        mode: 0o700 });
    for (let attempt = 0; attempt < 3; attempt++) {
        const offset = (await fs.stat(destination).catch(() => ({ size: 0 }))).size;
        if (offset > descriptor.size) {
            await fs.truncate(destination, 0);
        }
        const current = (await fs.stat(destination).catch(() => ({ size: 0 }))).size;
        if (current < descriptor.size) {
            const response = await fetch(`${config.baseUrl}/api/transfer/http/${descriptor.id}`, { headers: await requestHeaders(descriptor, current) });
            if (!response.ok || !response.body || (current > 0 && response.status !== 206)) {
                throw new Error(`Direct HTTP transfer failed (${response.status})`);
            }
            await pipeline(Readable.fromWeb(response.body as never), createWriteStream(destination, { flags: current > 0 ? "a" : "w",
                mode: 0o600 }));
        }
        const stat = await fs.stat(destination);
        if (stat.size === descriptor.size && await hashFile(destination) === descriptor.sha256) {
            return destination;
        }
        if (stat.size === descriptor.size) {
            await fs.truncate(destination, 0);
        }
    }
    throw new Error("Direct HTTP checksum verification failed after retries");
}

export async function verifyDirectHttpArchive(repositoryId: string, snapshotId: string): Promise<void> {
    const config = repository(repositoryId);
    const descriptor = snapshot(snapshotId);
    const response = await fetch(`${config.baseUrl}/api/transfer/http/${descriptor.id}`, { method: "HEAD",
        headers: await requestHeaders(descriptor) });
    if (!response.ok || Number(response.headers.get("content-length")) !== descriptor.size || response.headers.get("x-content-sha256") !== descriptor.sha256) {
        throw new Error("Direct HTTP archive verification failed");
    }
}

export async function resumeDirectHttpArchive(repositoryId: string, snapshotId: string): Promise<{ offset: number; size: number }> {
    const descriptor = snapshot(snapshotId);
    const offset = (await fs.stat(partialPath(descriptor.id)).catch(() => ({ size: 0 }))).size;
    repository(repositoryId);
    return { offset: Math.min(offset, descriptor.size),
        size: descriptor.size };
}

export async function restoreDirectHttpArchive(repositoryId: string, snapshotId: string, output: Writable): Promise<void> {
    await verifyDirectHttpArchive(repositoryId, snapshotId);
    const file = await download(repositoryId, snapshotId);
    await new Promise<void>((resolve, reject) => {
        const input = createReadStream(file);
        input.once("error", reject);
        output.once("error", reject);
        input.once("end", resolve);
        input.pipe(output, { end: false });
    });
    await fs.unlink(file).catch(() => {});
}

export async function cleanupDirectHttpArchives(snapshotIds: string[]): Promise<void> {
    for (const value of snapshotIds) {
        const descriptor = snapshot(value);
        await fs.unlink(archivePath(descriptor.id)).catch(() => {});
        await fs.unlink(sessionPath(descriptor.id)).catch(() => {});
        await fs.unlink(partialPath(descriptor.id)).catch(() => {});
    }
}

function throttle(kbps?: number): Transform | undefined {
    if (!kbps) {
        return undefined;
    }
    const bytesPerSecond = kbps * 1024;
    let sent = 0;
    const started = Date.now();
    return new Transform({ transform(chunk, _encoding, callback) {
        sent += Buffer.byteLength(chunk);
        const wait = Math.max(0, sent / bytesPerSecond * 1000 - (Date.now() - started));
        setTimeout(() => callback(null, chunk), wait);
    } });
}

export async function serveDirectHttpArchive(request: Request, response: Response): Promise<void> {
    try {
        await cleanupExpired();
        const id = safeId(request.params.id);
        const stored = JSON.parse(await fs.readFile(sessionPath(id), "utf8")) as StoredSession;
        const token = request.headers.authorization?.replace(/^Bearer\s+/i, "") || "";
        if (createHash("sha256").update(token).digest("hex") !== stored.tokenHash || new Date(stored.expiresAt).getTime() <= Date.now()) {
            response.sendStatus(401);
            return;
        }
        const stat = await fs.stat(archivePath(id));
        const match = /^bytes=(\d+)-$/.exec(request.headers.range || "");
        const start = match ? Number(match[1]) : 0;
        if (!Number.isSafeInteger(start) || start < 0 || start >= stat.size) {
            if (start === 0 && stat.size === 0) {
                response.sendStatus(204);
                return;
            }
            response.status(416).setHeader("Content-Range", `bytes */${stat.size}`).end();
            return;
        }
        response.status(start > 0 ? 206 : 200);
        response.setHeader("Accept-Ranges", "bytes");
        response.setHeader("Content-Length", stat.size - start);
        response.setHeader("Content-Type", "application/octet-stream");
        response.setHeader("X-Content-SHA256", stored.sha256);
        if (start > 0) {
            response.setHeader("Content-Range", `bytes ${start}-${stat.size - 1}/${stat.size}`);
        }
        if (request.method === "HEAD") {
            response.end();
            return;
        }
        const limiter = throttle(stored.bandwidthKbps);
        const input = createReadStream(archivePath(id), { start });
        if (limiter) {
            input.pipe(limiter).pipe(response);
        } else {
            input.pipe(response);
        }
    } catch {
        response.sendStatus(404);
    }
}
