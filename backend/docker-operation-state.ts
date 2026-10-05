import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

let activeBuilds = 0;

export class CleanupExecutionLock {
    private locked = false;

    tryAcquire(): boolean {
        if (this.locked) {
            return false;
        }
        this.locked = true;
        return true;
    }

    release(): void {
        this.locked = false;
    }

    isLocked(): boolean {
        return this.locked;
    }
}

const cleanupExecutionLock = new CleanupExecutionLock();

export function isDockerBuildActive(): boolean {
    return activeBuilds > 0;
}

export async function dockerDaemonAvailable(
    probe: () => Promise<unknown> = () => execFileAsync("docker", [ "info", "--format", "{{.ServerVersion}}" ], { timeout: 10_000 }),
): Promise<boolean> {
    try {
        await probe();
        return true;
    } catch {
        return false;
    }
}

export async function trackDockerBuild<T>(operation: () => Promise<T>): Promise<T> {
    if (cleanupExecutionLock.isLocked()) {
        throw new Error("Un nettoyage Docker est en cours");
    }
    activeBuilds += 1;
    try {
        return await operation();
    } finally {
        activeBuilds = Math.max(0, activeBuilds - 1);
    }
}

export function tryStartDockerCleanup(): boolean {
    return cleanupExecutionLock.tryAcquire();
}

export function finishDockerCleanup(): void {
    cleanupExecutionLock.release();
}

export async function withDockerCleanupLock<T>(operation: () => Promise<T>): Promise<T> {
    if (!tryStartDockerCleanup()) {
        throw new Error("Un nettoyage Docker est déjà en cours");
    }
    try {
        return await operation();
    } finally {
        finishDockerCleanup();
    }
}
