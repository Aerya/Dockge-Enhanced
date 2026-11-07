import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

export type DeploymentPhase = "save" | "prerequisites" | "compose" | "metadata";
export interface DeploymentProgress {
    id: string;
    stack: string;
    state: "running" | "completed" | "failed" | "interrupted";
    phase: DeploymentPhase;
    startedAt: string;
    updatedAt: string;
    saved: boolean;
    steps: Array<{ phase: DeploymentPhase;
        startedAt: string;
        finishedAt?: string }>;
    output?: string;
}
const stores = new Map<string, DeploymentStore>();
export function deploymentStore(dataDir: string) {
    const key = path.resolve(dataDir);
    if (!stores.has(key)) {
        stores.set(key, new DeploymentStore(key));
    }
    return stores.get(key)!;
}

export class DeploymentStore {
    private records = new Map<string, DeploymentProgress>();
    private active = new Set<string>();
    private loading?: Promise<void>;
    private writing = Promise.resolve();
    private file: string;
    constructor(private dataDir: string) {
        this.file = path.join(dataDir, "deployment-progress.json");
    }

    private async load() {
        this.loading ??= (async () => {
            try {
                const raw = await readFile(this.file, "utf8");
                if (raw.length > 1024 * 1024) {
                    throw new Error("Invalid deployment history");
                }
                const rows = JSON.parse(raw);
                if (!Array.isArray(rows)) {
                    throw new Error("Invalid deployment history");
                }
                for (const row of rows.slice(-100)) {
                    if (row && typeof row.stack === "string" && /^[a-z0-9_-]{1,200}$/.test(row.stack) && Array.isArray(row.steps)) {
                        // A stopped backend cannot know whether its old Compose process finished.
                        this.records.set(row.stack, { ...row,
                            output: undefined,
                            state: row.state === "running" ? "interrupted" : row.state });
                    }
                }
            } catch (error) {
                if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
                    throw error;
                }
            }
        })();
        await this.loading;
    }

    private persist() {
        const rows = [ ...this.records.values() ].map(({ output: _output, ...record }) => record);
        const write = async () => {
            await mkdir(this.dataDir, { recursive: true });
            const temp = this.file + ".tmp";
            await writeFile(temp, JSON.stringify(rows), { mode: 0o600 });
            await rename(temp, this.file);
        };
        this.writing = this.writing.then(write, write);
        return this.writing;
    }

    async get(stack: string) {
        await this.load();
        const row = this.records.get(stack);
        return row ? structuredClone(row) : null;
    }

    async run<T>(stack: string, action: (report: (phase: DeploymentPhase) => Promise<void>, output: (chunk: string) => void) => Promise<T>, saved = false): Promise<T> {
        if (!/^[a-z0-9_-]{1,200}$/.test(stack) || this.active.has(stack)) {
            throw new Error("deployment.busy");
        }
        // Reserve before any await: two tabs cannot start the same installation.
        this.active.add(stack);
        try {
            await this.load();
            const now = new Date().toISOString();
            const row: DeploymentProgress = { id: randomUUID(),
                stack,
                state: "running",
                phase: saved ? "prerequisites" : "save",
                startedAt: now,
                updatedAt: now,
                saved,
                steps: [],
                output: "" };
            this.records.delete(stack);
            this.records.set(stack, row);
            while (this.records.size > 100) {
                const removable = [ ...this.records.keys() ].find(name => !this.active.has(name));
                if (!removable) {
                    throw new Error("deployment.busy");
                }
                this.records.delete(removable);
            }
            const report = async (phase: DeploymentPhase) => {
                const time = new Date().toISOString();
                if (row.steps.length) {
                    row.steps[row.steps.length - 1].finishedAt = time;
                }
                row.phase = phase;
                row.updatedAt = time;
                row.saved ||= phase !== "save";
                row.steps.push({ phase,
                    startedAt: time });
                await this.persist();
            };
            await report(row.phase);
            try {
                const result = await action(report, chunk => {
                    row.output = ((row.output || "") + chunk).slice(-65536);
                });
                row.state = "completed";
                row.steps[row.steps.length - 1].finishedAt = new Date().toISOString();
                return result;
            } catch (error) {
                row.state = "failed";
                throw error;
            } finally {
                row.updatedAt = new Date().toISOString();
                await this.persist();
            }
        } finally {
            this.active.delete(stack);
        }
    }
}
