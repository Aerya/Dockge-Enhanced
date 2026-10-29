import * as fs from "node:fs/promises";
import path from "node:path";
import { zerobyte, type ZerobyteManager } from "../integrations/zerobyte-manager";
import type { SelfUpdateSettings } from "./types";

type JsonObject = Record<string, unknown>;
const object = (value: unknown): JsonObject => value && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : {};
type Client = Pick<ZerobyteManager, "job" | "runBackup" | "task" | "recoverySnapshotFile">;

/** A dedicated, unfiltered job avoids silently backing up only part of Enhanced. */
export function validateSelfUpdateJob(job: JsonObject, jobId: string, dataPath: string): string {
    if (job.shortId !== jobId || job.enabled !== false || job.maxRetries !== 0 || job.oneFileSystem === true) {
        throw new Error("Use a dedicated Zerobyte job with scheduling and retries disabled");
    }
    for (const key of [ "includePaths", "includePatterns", "excludePatterns", "excludeIfPresent", "customResticParams" ]) {
        if (job[key] != null && (!Array.isArray(job[key]) || job[key].length !== 0)) {
            throw new Error("The self-update Zerobyte job must back up all Enhanced data without filters or custom Restic parameters");
        }
    }
    const hooks = object(job.backupWebhooks);
    if (Object.values(hooks).some(Boolean)) {
        throw new Error("The self-update Zerobyte job must not run hooks or stop Enhanced");
    }
    const volume = object(job.volume);
    const config = object(volume.config);
    if (!dataPath || dataPath === "/" || config.backend !== "directory" || config.path !== dataPath) {
        throw new Error("The Zerobyte source must be the complete Enhanced data directory at the configured path");
    }
    const repository = object(job.repository);
    const repositoryConfig = object(repository.config);
    if (repositoryConfig.backend === "local" && typeof repositoryConfig.path === "string") {
        const relative = path.posix.relative(dataPath, repositoryConfig.path);
        if (!relative || (!relative.startsWith("../") && relative !== ".." && !path.posix.isAbsolute(relative))) {
            throw new Error("The Zerobyte repository must be outside the Enhanced data source");
        }
    }
    if (typeof job.repositoryId !== "string" || repository.id !== job.repositoryId ||
        typeof repository.shortId !== "string" || !/^[a-zA-Z0-9_-]{1,128}$/.test(repository.shortId)) {
        throw new Error("Invalid Zerobyte repository");
    }
    // The relation stores a UUID; repository HTTP routes require its shortId.
    return repository.shortId;
}

export async function runZerobyteSelfUpdateBackup(
    settings: Pick<SelfUpdateSettings, "zerobyteJobId" | "zerobyteDataPath">,
    recoveryPath: string,
    verifying: () => Promise<void>,
    dependencies: { client?: Client;
        now?: () => number;
        wait?: () => Promise<void>;
        timeoutMs?: number } = {},
): Promise<void> {
    const client = dependencies.client ?? await zerobyte.session();
    const now = dependencies.now ?? Date.now;
    const wait = dependencies.wait ?? (() => new Promise(resolve => setTimeout(resolve, 2_000)));
    const deadline = now() + (dependencies.timeoutMs ?? 30 * 60_000);
    const job = await client.job(settings.zerobyteJobId);
    const repositoryId = validateSelfUpdateJob(job, settings.zerobyteJobId, settings.zerobyteDataPath);
    const expected: unknown = JSON.parse(await fs.readFile(recoveryPath, "utf8"));
    const started = object(await client.runBackup(settings.zerobyteJobId));
    if (typeof started.taskId !== "string" || !/^[a-zA-Z0-9_-]{1,128}$/.test(started.taskId)) {
        throw new Error("Zerobyte did not return a backup task identifier");
    }
    // Never trust lastBackupStatus: it may describe a previous or concurrent run.
    while (now() < deadline) {
        const task = await client.task(started.taskId);
        if (task.id !== started.taskId || task.kind !== "backup" || task.resourceId !== settings.zerobyteJobId) {
            throw new Error("Zerobyte returned an unrelated backup task");
        }
        if (task.status === "succeeded") {
            const result = object(task.result);
            const snapshotId = object(result.result).snapshot_id;
            // v0.43.2 omits outcome from the task DTO (it exists only in history).
            // A succeeded task can still contain a partial Restic backup (exit 3).
            if ((task.outcome != null && task.outcome !== "success") || task.error != null ||
                result.kind !== "backup" || result.exitCode !== 0 || result.warningDetails != null ||
                typeof snapshotId !== "string" || !/^[a-f0-9]{8,64}$/i.test(snapshotId)) {
                throw new Error("Zerobyte backup did not produce a verified successful snapshot");
            }
            await verifying();
            // Detect changed source/filter configuration and prove this run includes
            // the fresh recovery file, not an old snapshot or another instance.
            const current = await client.job(settings.zerobyteJobId);
            if (validateSelfUpdateJob(current, settings.zerobyteJobId, settings.zerobyteDataPath) !== repositoryId) {
                throw new Error("Zerobyte backup repository changed during the operation");
            }
            const snapshotPath = path.posix.join(settings.zerobyteDataPath, "self-update", "recovery", path.basename(recoveryPath));
            const actual = await client.recoverySnapshotFile(repositoryId, snapshotId, snapshotPath);
            if (JSON.stringify(actual) !== JSON.stringify(expected)) {
                throw new Error("Zerobyte recovery file does not match this self-update operation");
            }
            return;
        }
        if (![ "queued", "running" ].includes(String(task.status))) {
            throw new Error("Zerobyte backup failed, was cancelled or returned an unknown state; self-update stopped");
        }
        await wait();
    }
    // Do not kill an external backup or start Docker mutations on an uncertain result.
    throw new Error("Zerobyte backup verification timed out; self-update stopped. Check the task in Zerobyte");
}
