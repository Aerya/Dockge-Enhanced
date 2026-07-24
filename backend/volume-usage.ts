import { execFile } from "child_process";
import { randomUUID } from "crypto";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

export interface VolumeUsageResult {
    size: number | null;
    error?: string;
}

interface CommandOptions {
    timeout: number;
}

export type CommandRunner = (
    file: string,
    args: string[],
    options: CommandOptions
) => Promise<{ stdout: string | Buffer }>;

interface MeasureOptions {
    commandRunner?: CommandRunner;
    helperName?: string;
    timeoutMs?: number;
}

const CACHE_TTL_MS = 5 * 60_000;
const ERROR_CACHE_TTL_MS = 15_000;
const DEFAULT_TIMEOUT_MS = 120_000;
const cache = new Map<string, { expiresAt: number; result: Promise<VolumeUsageResult> }>();

let activeMeasurements = 0;
const measurementQueue: Array<() => void> = [];

function runWithMeasurementSlot<T>(task: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        const run = () => {
            activeMeasurements++;
            task().then(resolve, reject).finally(() => {
                activeMeasurements--;
                measurementQueue.shift()?.();
            });
        };

        if (activeMeasurements < 1) {
            run();
        } else {
            measurementQueue.push(run);
        }
    });
}

const defaultCommandRunner: CommandRunner = async (file, args, options) => {
    const result = await execFileAsync(file, args, options);
    return { stdout: result.stdout };
};

/**
 * Measure one Docker volume or bind mount without allowing the helper to
 * monopolize the host or survive a timeout.
 */
export async function measureVolumeSource(source: string, options: MeasureOptions = {}): Promise<VolumeUsageResult> {
    const commandRunner = options.commandRunner ?? defaultCommandRunner;
    const helperName = options.helperName ?? `dockge-volume-usage-${process.pid}-${randomUUID()}`;
    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

    try {
        const { stdout } = await commandRunner("docker", [
            "run",
            "--rm",
            "--name",
            helperName,
            "--network",
            "none",
            "--read-only",
            "--cpus",
            "0.50",
            "--memory",
            "128m",
            "--pids-limit",
            "32",
            "-v",
            `${source}:/mnt:ro`,
            process.env.DOCKGE_VOLUME_HELPER_IMAGE || "busybox:stable",
            "du",
            "-sbx",
            "/mnt",
        ], { timeout: timeoutMs });
        const first = String(stdout).trim().split(/\s+/)[0];
        const size = Number.parseInt(first, 10);
        return {
            size: Number.isFinite(size) ? size : null
        };
    } catch (e) {
        return {
            size: null,
            error: e instanceof Error ? e.message : String(e)
        };
    } finally {
        // `docker run --rm` normally removes the helper. A timed-out client can
        // leave it running, so force cleanup by its deterministic name.
        await commandRunner("docker", [ "rm", "-f", helperName ], { timeout: 10_000 }).catch(() => undefined);
    }
}

export function getVolumeSourceSize(source: string): Promise<VolumeUsageResult> {
    const now = Date.now();
    const cached = cache.get(source);
    if (cached && cached.expiresAt > now) {
        return cached.result;
    }

    const result = runWithMeasurementSlot(() => measureVolumeSource(source));
    const entry = {
        expiresAt: now + CACHE_TTL_MS,
        result
    };
    cache.set(source, entry);
    void result.then(value => {
        if (value.error) {
            entry.expiresAt = Date.now() + ERROR_CACHE_TTL_MS;
        }
    });
    return result;
}

export function clearVolumeUsageCache(): void {
    cache.clear();
}
