/** Persist a bounded grace period for downloaded update targets across restarts. */
import fs from "node:fs";
import path from "node:path";
import { resolveDataDir } from "../data-dir";

export const PENDING_PULL_GRACE_MS = 24 * 60 * 60_000;
interface PendingPull { key: string;
    image: string;
    imageId: string;
    expiresAt: number }
const filename = (dataDir: string) => path.join(dataDir, "pending-image-pulls.json");
function read(dataDir: string): PendingPull[] {
    try {
        const entries: unknown = JSON.parse(fs.readFileSync(filename(dataDir), "utf8"));
        if (!Array.isArray(entries) || entries.some(entry => !entry || typeof entry.key !== "string"
            || typeof entry.image !== "string" || typeof entry.imageId !== "string" || !Number.isFinite(entry.expiresAt))) {
            throw new Error("Invalid pending image pull protections");
        }
        return entries;
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") {
            return [];
        }
        throw error; // Fail closed: an unreadable protection file must not authorize deletion.
    }
}
function write(entries: PendingPull[], dataDir: string): void {
    fs.mkdirSync(dataDir, { recursive: true });
    const file = filename(dataDir);
    fs.writeFileSync(`${file}.tmp`, JSON.stringify(entries), { mode: 0o600 });
    fs.renameSync(`${file}.tmp`, file);
}
export function protectPendingPull(key: string, image: string, imageId = "", dataDir = resolveDataDir(), now = Date.now()): void {
    const entries = read(dataDir).filter(entry => entry.expiresAt > now && entry.key !== key);
    entries.push({ key,
        image,
        imageId,
        expiresAt: now + PENDING_PULL_GRACE_MS });
    write(entries, dataDir);
}
export function releasePendingPull(key: string, dataDir = resolveDataDir()): void {
    write(read(dataDir).filter(entry => entry.key !== key), dataDir);
}
function referenceKey(reference: string): string {
    return reference.replace(/^(?:docker\.io|index\.docker\.io|registry-1\.docker\.io)\//, "").replace(/^library\//, "");
}
export function isPendingPullProtected(imageId: string, references: string[], dataDir = resolveDataDir(), now = Date.now()): boolean {
    return read(dataDir).some(entry => entry.expiresAt > now
        && (entry.imageId === imageId || references.some(reference => referenceKey(reference) === referenceKey(entry.image))));
}
