import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { postUpdateCleanupDue, type PostUpdatePolicy } from "../common/post-update-policy";

export interface PostUpdateCleanupEntry {
    id: string;
    stack: string;
    service: string;
    imageId: string;
    references: string[];
    completedAt: number;
    dueAt: number;
    outcome: "pending" | "removed" | "absent" | "protected" | "error";
    reason?: string;
    checkedAt?: number;
}

export interface CleanupResult {
    outcome: "removed" | "absent" | "protected";
    reason?: string;
}

export function retainedPostUpdateImageIds(dataDir: string, now = Date.now()): string[] {
    try {
        const entries: unknown = JSON.parse(fs.readFileSync(path.join(dataDir, "post-update-cleanup.json"), "utf8"));
        if (!Array.isArray(entries) || !entries.every(validEntry)) {
            throw new Error("Invalid post-update cleanup registry");
        }
        return entries.filter(entry => entry.dueAt > now).map(entry => entry.imageId);
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") {
            return [];
        }
        throw error;
    }
}

/** Durable, targeted queue. Never derives candidates from a global Docker prune. */
export class PostUpdateCleanupQueue {
    private readonly file: string;
    private entries: PostUpdateCleanupEntry[];
    private running = false;

    constructor(dataDir: string, private remove: (entry: PostUpdateCleanupEntry) => Promise<CleanupResult>) {
        this.file = path.join(dataDir, "post-update-cleanup.json");
        try {
            const data: unknown = JSON.parse(fs.readFileSync(this.file, "utf8"));
            if (!Array.isArray(data) || !data.every(validEntry)) {
                throw new Error("Invalid post-update cleanup registry");
            }
            this.entries = data;
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
                throw error; // Never overwrite an unreadable registry with an empty one.
            }
            this.entries = [];
        }
    }

    snapshot(): PostUpdateCleanupEntry[] {
        return structuredClone(this.entries);
    }

    enqueue(input: Pick<PostUpdateCleanupEntry, "stack" | "service" | "imageId" | "references">,
        policy: PostUpdatePolicy, completedAt: number): void {
        const dueAt = postUpdateCleanupDue(policy, completedAt);
        if (dueAt === null) {
            return;
        }
        const entry: PostUpdateCleanupEntry = { ...input,
            references: [ ...input.references ],
            id: randomUUID(),
            completedAt,
            dueAt,
            outcome: "pending" };
        if (!validEntry(entry)) {
            throw new Error("Invalid post-update cleanup candidate");
        }
        this.entries.push(entry);
        try {
            this.persist();
        } catch (error) {
            this.entries = this.entries.filter(candidate => candidate.id !== entry.id);
            throw error;
        }
    }

    /** Caller holds the shared cleanup reservation and checks activity blockers. */
    async run(now = Date.now()): Promise<void> {
        if (this.running) {
            return;
        }
        this.running = true;
        try {
            for (const entry of this.entries) {
                if ([ "removed", "absent" ].includes(entry.outcome) || entry.dueAt > now) {
                    continue;
                }
                // A later update of another service can protect this physical image longer.
                if (this.entries.some(other => other.imageId === entry.imageId && other.dueAt > now)) {
                    entry.outcome = "protected";
                    entry.reason = "A later update still retains this image";
                } else {
                    try {
                        const candidate = structuredClone(entry);
                        candidate.references = [ ...new Set(this.entries.filter(other => other.imageId === entry.imageId).flatMap(other => other.references)) ];
                        const result = await this.remove(candidate);
                        entry.outcome = result.outcome;
                        entry.reason = result.reason;
                    } catch (error) {
                        entry.outcome = "error";
                        // Do not persist raw Docker errors, command lines or credentials.
                        entry.reason = error instanceof Error ? error.name : "CleanupError";
                    }
                }
                entry.checkedAt = now;
                this.persist();
            }
        } finally {
            this.running = false;
        }
    }

    private persist(): void {
        const finished = this.entries.filter(entry => [ "removed", "absent" ].includes(entry.outcome));
        const retained = new Set(finished.slice(-500).map(entry => entry.id));
        this.entries = this.entries.filter(entry => ![ "removed", "absent" ].includes(entry.outcome) || retained.has(entry.id));
        fs.mkdirSync(path.dirname(this.file), { recursive: true });
        const temporary = `${this.file}.${randomUUID()}.tmp`;
        try {
            fs.writeFileSync(temporary, JSON.stringify(this.entries, null, 2), { mode: 0o600 });
            fs.renameSync(temporary, this.file);
        } finally {
            fs.rmSync(temporary, { force: true });
        }
    }
}

function validEntry(value: unknown): value is PostUpdateCleanupEntry {
    if (!value || typeof value !== "object") {
        return false;
    }
    const entry = value as Partial<PostUpdateCleanupEntry>;
    return typeof entry.id === "string" && typeof entry.stack === "string" && typeof entry.service === "string"
        && typeof entry.imageId === "string" && /^sha256:[a-f0-9]{64}$/i.test(entry.imageId)
        && Array.isArray(entry.references) && entry.references.every(reference => typeof reference === "string")
        && typeof entry.completedAt === "number" && Number.isFinite(entry.completedAt)
        && typeof entry.dueAt === "number" && Number.isFinite(entry.dueAt) && entry.dueAt >= entry.completedAt
        && [ "pending", "removed", "absent", "protected", "error" ].includes(entry.outcome ?? "");
}
