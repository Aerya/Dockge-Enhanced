/** Optional Zerobyte HTTP API integration: deliberately isolated from native Restic. */
import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { resolveDataDir } from "../data-dir";

export interface ZerobyteConfig {
    enabled: boolean;
    url: string;
    apiKey: string;
    externalRisksAcknowledged?: boolean;
    externalRestoreRoot?: string;
}

export interface ZerobyteSafeConfig {
    enabled: boolean;
    url: string;
    hasApiKey: boolean;
    restoreEnabled: boolean;
    externalRisksAcknowledged: boolean;
    externalRestoreRoot: string;
}

type JsonObject = Record<string, unknown>;
type ZerobyteJob = {
    shortId: string;
    name: string;
    enabled: boolean;
    lastBackupStatus: string | null;
    lastBackupAt: number | null;
    nextBackupAt: number | null;
    volumeId: number | null;
    repositoryId: string;
};

type RepositorySummary = {
    shortId: string;
    name: string;
    snapshotCount: number | null;
    storedBytes: number | null;
};

const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const ID_PATTERN = /^[a-zA-Z0-9_-]{1,128}$/;
const DEFAULT_CONFIG: ZerobyteConfig = { enabled: false,
    url: "",
    apiKey: "" };

export function normalizeZerobyteUrl(value: unknown): string {
    if (typeof value !== "string" || value.length > 512) {
        throw new Error("Invalid Zerobyte URL");
    }
    const parsed = new URL(value);
    if (![ "http:", "https:" ].includes(parsed.protocol) || !parsed.hostname ||
        parsed.username || parsed.password || parsed.search || parsed.hash ||
        (parsed.pathname !== "/" && parsed.pathname !== "")) {
        throw new Error("Zerobyte requires a plain HTTP(S) origin without credentials, path, query or fragment");
    }
    return parsed.origin;
}

function id(value: unknown): string {
    if (typeof value !== "string" || !ID_PATTERN.test(value)) {
        throw new Error("Invalid resource identifier");
    }
    return value;
}

function object(value: unknown): JsonObject {
    return value !== null && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : {};
}

function str(value: unknown, max = 256): string {
    return typeof value === "string" ? value.slice(0, max) : "";
}

function num(value: unknown): number | null {
    return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function dataArray(value: unknown): JsonObject[] {
    return Array.isArray(value) ? value.slice(0, 500).map(object) : [];
}

export function validateRestoreRoot(value: unknown): string {
    if (value === "") {
        return "";
    }
    if (typeof value !== "string" || value.length > 512 || !path.posix.isAbsolute(value) ||
        value.split("/").some(p => p === ".." || p === ".") || /[\x00-\x1f]/.test(value)) {
        throw new Error("Invalid dedicated restore root");
    }
    const root = path.posix.normalize(value).replace(/\/$/, "");
    if ([ "/", "", "/var", "/var/lib", "/srv", "/mnt", "/tmp", "/home" ].includes(root) ||
        [ "/sources", "/destinations", "/var/lib/zerobyte", "/app", "/opt/stacks", "/root", "/usr", "/boot", "/etc", "/proc", "/sys", "/dev", "/run" ].some(p => root === p || root.startsWith(p + "/"))) {
        throw new Error("Restore root must be a dedicated test directory, outside application data and backup mounts");
    }
    return root;
}

export class ZerobyteManager {
    private readonly filePath: string;
    private operationBusy = false;

    constructor(dataDir = resolveDataDir()) {
        this.filePath = path.join(dataDir, "zerobyte-settings.json");
    }

    private async read(): Promise<ZerobyteConfig> {
        try {
            const raw = object(JSON.parse(await fs.readFile(this.filePath, "utf8")));
            return {
                enabled: raw.enabled === true,
                url: typeof raw.url === "string" ? raw.url : "",
                apiKey: typeof raw.apiKey === "string" ? raw.apiKey : "",
                externalRisksAcknowledged: raw.externalRisksAcknowledged === true,
                externalRestoreRoot: typeof raw.externalRestoreRoot === "string" ? raw.externalRestoreRoot : "",
            };
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === "ENOENT") {
                return { ...DEFAULT_CONFIG };
            }
            throw error;
        }
    }

    async getSafeConfig(): Promise<ZerobyteSafeConfig> {
        const settings = await this.read();
        return { enabled: settings.enabled,
            url: settings.url,
            hasApiKey: Boolean(settings.apiKey),
            restoreEnabled: Boolean(settings.externalRisksAcknowledged && settings.externalRestoreRoot),
            externalRisksAcknowledged: settings.externalRisksAcknowledged === true,
            externalRestoreRoot: settings.externalRestoreRoot || "" };
    }

    async saveConfig(input: unknown): Promise<ZerobyteSafeConfig> {
        const body = object(input);
        const current = await this.read();
        const enabled = body.enabled === true;
        const url = !enabled || body.url === undefined ? current.url : body.url ? normalizeZerobyteUrl(body.url) : "";
        if (enabled && !url && Boolean(body.apiKey)) {
            throw new Error("Zerobyte URL is required");
        }
        // Secret is retained only for an unchanged endpoint, unless explicitly reentered.
        let apiKey = url === current.url ? current.apiKey : "";
        if (enabled && body.apiKey !== undefined) {
            if (typeof body.apiKey !== "string" || body.apiKey.length > 512) {
                throw new Error("Invalid API key");
            }
            if (body.apiKey) {
                apiKey = body.apiKey;
            }
        }
        if (enabled && body.clearApiKey === true) {
            apiKey = "";
        }
        if (enabled && Boolean(url) && !apiKey) {
            throw new Error("Zerobyte API key is required");
        }
        const sameIdentity = url === current.url && apiKey === current.apiKey;
        const externalRisksAcknowledged = enabled && body.acknowledgeExternalRisks !== undefined
            ? body.acknowledgeExternalRisks === true : sameIdentity && current.externalRisksAcknowledged === true;
        let externalRestoreRoot = sameIdentity ? current.externalRestoreRoot || "" : "";
        if (enabled && body.externalRestoreRoot !== undefined) {
            externalRestoreRoot = validateRestoreRoot(body.externalRestoreRoot);
        }
        if (externalRestoreRoot && !externalRisksAcknowledged) {
            throw new Error("Explicit acknowledgement of external configuration and restore risks required");
        }
        await fs.mkdir(path.dirname(this.filePath), { recursive: true });
        const temp = `${this.filePath}.${randomUUID()}.tmp`;
        try {
            await fs.writeFile(temp, JSON.stringify({ enabled,
                url,
                apiKey,
                externalRisksAcknowledged,
                externalRestoreRoot }), { mode: 0o600,
                flag: "wx" });
            await fs.rename(temp, this.filePath);
            await fs.chmod(this.filePath, 0o600);
        } finally {
            await fs.rm(temp, { force: true }).catch(() => {});
        }
        return this.getSafeConfig();
    }

    private async request<T = unknown>(method: "GET" | "POST" | "PATCH", route: string, body?: unknown): Promise<T> {
        const config = await this.read();
        if (!config.enabled || !config.url || !config.apiKey) {
            throw new Error("Zerobyte is not configured");
        }
        // Routes are internal constants; IDs are validated and URI-encoded at the call sites.
        if (!route.startsWith("/api/v1/") || route.includes("..") || route.includes("//")) {
            throw new Error("Invalid Zerobyte API route");
        }
        let response: globalThis.Response;
        try {
            response = await fetch(config.url + route, {
                method,
                headers: { "x-api-key": config.apiKey,
                    "Accept": "application/json",
                    ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
                ...(body === undefined ? {} : { body: JSON.stringify(body) }),
                redirect: "error",
                signal: AbortSignal.timeout(12000),
            });
        } catch {
            throw new Error("Zerobyte is unreachable or the connection timed out");
        }
        const length = Number(response.headers.get("content-length") || 0);
        if (length > MAX_RESPONSE_BYTES) {
            throw new Error("Zerobyte response is too large");
        }
        const reader = response.body?.getReader();
        let received = 0;
        const chunks: Uint8Array[] = [];
        if (reader) {
            try {
                while (true) {
                    const chunk = await reader.read();
                    if (chunk.done) {
                        break;
                    }
                    received += chunk.value.byteLength;
                    if (received > MAX_RESPONSE_BYTES) {
                        await reader.cancel();
                        throw new Error("Zerobyte response is too large");
                    }
                    chunks.push(chunk.value);
                }
            } catch {
                throw new Error("Zerobyte response exceeded size or time limits");
            }
        }
        const raw = Buffer.concat(chunks).toString("utf8");
        if (!response.ok) {
            // Do not relay arbitrary upstream error payloads (which may contain secrets).
            throw new Error(`Zerobyte API returned HTTP ${response.status}`);
        }
        try {
            return JSON.parse(raw) as T;
        } catch {
            throw new Error("Zerobyte returned invalid JSON");
        }
    }

    async testConnection() {
        await this.request("GET", "/api/v1/system/info");
        const info = object(await this.request("GET", "/api/v1/system/updates"));
        return { connected: true,
            version: str(info.currentVersion) || "unknown" };
    }

    async overview(includeStats = true) {
        const [ jobsRaw, repositoriesRaw, volumesRaw, tasksRaw ] = await Promise.all([
            this.request("GET", "/api/v1/backups"),
            this.request("GET", "/api/v1/repositories"),
            this.request("GET", "/api/v1/volumes"),
            this.request("GET", "/api/v1/tasks"),
        ]);
        // Mount updates rely on a complete job inventory: never treat a new/invalid
        // upstream schema, truncated list or missing enabled flag as an empty safe state.
        for (const collection of [ jobsRaw, repositoriesRaw, volumesRaw, tasksRaw ]) {
            if (!Array.isArray(collection) || collection.length > 500) {
                throw new Error("Unsupported Zerobyte inventory format or resource limit exceeded");
            }
        }
        if ((jobsRaw as unknown[]).some(raw => {
            const job = object(raw);
            return typeof job.enabled !== "boolean" || !ID_PATTERN.test(str(job.shortId));
        })) {
            throw new Error("Unsupported Zerobyte job schema; cannot verify disabled jobs");
        }
        const jobs: ZerobyteJob[] = dataArray(jobsRaw).map(job => ({
            shortId: str(job.shortId),
            name: str(job.name),
            enabled: job.enabled === true,
            lastBackupStatus: str(job.lastBackupStatus) || null,
            lastBackupAt: num(job.lastBackupAt),
            nextBackupAt: num(job.nextBackupAt),
            volumeId: num(job.volumeId),
            repositoryId: str(job.repositoryId),
        })).filter(job => ID_PATTERN.test(job.shortId));
        const repoList = dataArray(repositoriesRaw).map(repo => ({ shortId: str(repo.shortId),
            name: str(repo.name) })).filter(repo => ID_PATTERN.test(repo.shortId));
        const repositories: RepositorySummary[] = await Promise.all(repoList.slice(0, includeStats ? 12 : 0).map(async repo => {
            try {
                const stats = object(await this.request("GET", `/api/v1/repositories/${id(repo.shortId)}/stats`));
                // Stats schema varies across versions; never pass raw data to the UI.
                const storedBytes = num(stats.totalSize) ?? num(stats.totalBytes) ?? num(stats.size) ??
                    num(object(stats.stats).total_size) ?? num(stats.total_size);
                return { ...repo,
                    snapshotCount: num(stats.snapshotsCount) ?? num(stats.snapshotCount) ?? num(stats.snapshots_count) ?? null,
                    storedBytes };
            } catch {
                return { ...repo,
                    snapshotCount: null,
                    storedBytes: null };
            }
        }));
        const volumes = dataArray(volumesRaw).map(v => ({ id: str(v.shortId) || String(v.id ?? ""),
            numericId: num(v.id),
            name: str(v.name),
            status: str(v.status) }));
        const tasks = dataArray(tasksRaw).map(task => ({ id: str(task.id),
            status: str(task.status),
            kind: str(task.kind) }));
        return { jobs,
            repositories,
            volumes,
            tasks,
            restoreEnabled: (await this.getSafeConfig()).restoreEnabled };
    }

    private async exclusive<T>(operation: () => Promise<T>): Promise<T> {
        if (this.operationBusy) {
            throw new Error("A Zerobyte operation is already in progress");
        }
        this.operationBusy = true;
        try {
            return await operation();
        } finally {
            this.operationBusy = false;
        }
    }

    async runBackup(jobId: unknown) {
        return this.exclusive(() => this.request("POST", `/api/v1/backups/${id(jobId)}/run`));
    }

    async applyRetention(jobId: unknown, confirmation: unknown) {
        if (confirmation !== "CLEANUP") {
            throw new Error("Explicit cleanup confirmation required");
        }
        return this.exclusive(() => this.request("POST", `/api/v1/backups/${id(jobId)}/forget`));
    }

    async createJob(value: unknown) {
        const input = object(value);
        const name = str(input.name, 80).trim();
        const cronExpression = str(input.cronExpression, 80).trim();
        const volumeId = input.volumeId;
        const repositoryId = id(input.repositoryId);
        if (!name || name.length > 80 || !/^[0-9*,/-]+(?:\s+[0-9*,/-]+){4}$/.test(cronExpression) ||
            !(typeof volumeId === "number" && Number.isSafeInteger(volumeId) && volumeId > 0)) {
            throw new Error("Invalid job name, cron expression or volume ID");
        }
        // New schedules start disabled to prevent surprising production workloads.
        return this.exclusive(() => this.request("POST", "/api/v1/backups", {
            name,
            cronExpression,
            volumeId,
            repositoryId,
            enabled: false,
        }));
    }

    async resources() {
        const [ volumes, repositories, jobs ] = await Promise.all([
            this.request("GET", "/api/v1/volumes"), this.request("GET", "/api/v1/repositories"), this.request("GET", "/api/v1/backups"),
        ]);
        if (![ volumes, repositories, jobs ].every(v => Array.isArray(v) && v.length <= 500)) {
            throw new Error("Unsupported Zerobyte resource inventory");
        }
        return { volumes: volumes as JsonObject[],
            repositories: repositories as JsonObject[],
            jobs: jobs as JsonObject[] };
    }

    async diagnostics() {
        const config = await this.getSafeConfig();
        const checks: { key: string;
            state: "pass" | "fail" | "operator" }[] = [];
        const check = (key: string, good: boolean) => checks.push({ key,
            state: good ? "pass" : "fail" });
        check("configured", config.enabled && config.hasApiKey);
        check("acknowledged", config.externalRisksAcknowledged);
        check("restoreRoot", Boolean(config.externalRestoreRoot));
        try {
            const resources = await this.resources();
            check("apiInventory", true);
            const roots = [ ...resources.volumes, ...resources.repositories ].map(r => object(r.config))
                .filter(c => c.backend === "directory" || c.backend === "local").map(c => str(c.path, 1024));
            const root = config.externalRestoreRoot;
            check("restoreSeparation", Boolean(root) && !roots.some(p => p && (root === p || root.startsWith(p.replace(/\/$/, "") + "/") || p.startsWith(root + "/"))));
            check("dedicatedRepositories", resources.jobs.every(j => resources.jobs.filter(other => other.repositoryId === j.repositoryId).length === 1));
        } catch {
            check("apiInventory", false);
        }
        for (const key of [ "physicalMounts", "remoteIdentity", "restorePermissions", "retentionReview" ]) {
            checks.push({ key,
                state: "operator" });
        }
        return { checks,
            readOnly: true };
    }

    async updateWorkflowJob(jobId: string, hooks: unknown) {
        const job = await this.job(jobId);
        if (job.enabled !== false || typeof job.repositoryId !== "string" || typeof job.cronExpression !== "string" ||
            typeof job.retryDelay !== "number" || job.retryDelay < 1 || job.retryDelay > 1440) {
            throw new Error("Unsupported disabled job configuration for migration");
        }
        return object(await this.request("PATCH", `/api/v1/backups/${id(jobId)}`, {
            repositoryId: job.repositoryId,
            cronExpression: job.cronExpression,
            retryDelay: job.retryDelay,
            backupWebhooks: hooks,
            maxRetries: 0,
        }));
    }

    async createVolume(name: string, sourcePath: string) {
        return object(await this.request("POST", "/api/v1/volumes", { name,
            config: { backend: "directory",
                path: sourcePath } }));
    }

    async createRepository(name: string, destinationPath: string) {
        return object(object(await this.request("POST", "/api/v1/repositories", { name,
            config: { backend: "local",
                path: destinationPath } })).repository);
    }

    async createWorkflowJob(body: JsonObject) {
        return object(await this.request("POST", "/api/v1/backups", { ...body,
            enabled: false }));
    }

    async task(taskId: string) {
        return object(await this.request("GET", `/api/v1/tasks/${id(taskId)}`));
    }

    async cancelTask(taskId: string) {
        await this.request("POST", `/api/v1/tasks/${id(taskId)}/cancel`);
    }

    async job(jobId: string) {
        return object(await this.request("GET", `/api/v1/backups/${id(jobId)}`));
    }

    async snapshots(repoId: unknown) {
        const raw = await this.request("GET", `/api/v1/repositories/${id(repoId)}/snapshots`);
        return dataArray(raw).slice(0, 100).map(snap => ({
            id: str(snap.short_id),
            hostname: str(snap.hostname),
            time: typeof snap.time === "string" ? Date.parse(snap.time) : num(snap.time),
            paths: Array.isArray(snap.paths) ? snap.paths.slice(0, 20).map(p => str(p)) : [],
        })).filter(snap => ID_PATTERN.test(snap.id));
    }

    async stagedRestore(repoId: unknown, snapshotId: unknown, confirmation: unknown, verifiedManagedRoot?: string) {
        if (confirmation !== "RESTORE") {
            throw new Error("Explicit restore confirmation required");
        }
        const config = await this.read();
        const root = verifiedManagedRoot || (config.externalRisksAcknowledged ? config.externalRestoreRoot : "");
        if (!root) {
            throw new Error("A dedicated restore root must be verified for this Zerobyte connection");
        }
        validateRestoreRoot(root);
        if (!verifiedManagedRoot) {
            const resources = await this.resources();
            const paths = [ ...resources.volumes, ...resources.repositories ].map(resource => object(resource.config))
                .filter(config => config.backend === "directory" || config.backend === "local")
                .map(config => str(config.path, 1024)).filter(p => path.posix.isAbsolute(p));
            if (paths.some(p => root === p || root.startsWith(p.replace(/\/$/, "") + "/") || p.startsWith(root.replace(/\/$/, "") + "/"))) {
                throw new Error("External restore root overlaps a known source or repository");
            }
        }
        const targetPath = path.posix.join(root, `dockge-${randomUUID()}`);
        // Separate staging directory, never restore over a live stack or request deletion.
        return this.exclusive(async () => ({ targetPath,
            result: await this.request("POST", `/api/v1/repositories/${id(repoId)}/restore`, {
                snapshotId: id(snapshotId),
                targetPath,
                delete: false,
                overwrite: "never",
            }) }));
    }
}

export const zerobyte = new ZerobyteManager();
