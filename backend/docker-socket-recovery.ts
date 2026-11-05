import { execFile } from "./buffered-process";
import { promisify } from "node:util";

const run = promisify(execFile);
export type DockerProbeResult = "ready" | "unavailable" | "configuration-error";
export interface DockerRecoveryConfig { retries: number;
    intervalMs: number }

export function dockerRecoveryConfig(env: NodeJS.ProcessEnv): DockerRecoveryConfig {
    const integer = (value: string | undefined, fallback: number, min: number, max: number) => {
        if (value === undefined) {
            return fallback;
        }
        const number = Number(value);
        return /^\d+$/.test(value) && Number.isSafeInteger(number) && number >= min && number <= max ? number : fallback;
    };
    return {
        retries: integer(env.DOCKGE_DOCKER_RECOVERY_RETRIES, 0, 0, 100),
        intervalMs: integer(env.DOCKGE_DOCKER_RECOVERY_INTERVAL_SECONDS, 30, 5, 3600) * 1000,
    };
}

export function classifyDockerProbeError(error: unknown): DockerProbeResult {
    const value = error as { stderr?: unknown;
        code?: unknown;
        killed?: boolean } | null;
    const stderr = String(value?.stderr ?? "").toLowerCase();
    // Permission, TLS, API version and missing CLI errors cannot be fixed by restarting.
    if (/permission denied|access denied|unauthorized|forbidden|certificate|api version/.test(stderr)) {
        return "configuration-error";
    }
    if (value?.killed || /cannot connect to the docker daemon|connection refused|connection reset|i\/o timeout|context deadline exceeded/.test(stderr)) {
        return "unavailable";
    }
    return "configuration-error";
}

export async function probeDockerConnection(): Promise<DockerProbeResult> {
    try {
        await run("docker", [ "info", "--format", "{{.ServerVersion}}" ], { timeout: 5000,
            maxBuffer: 65536 });
        return "ready";
    } catch (error) {
        return classifyDockerProbeError(error);
    }
}

/** Opt-in watchdog. A healthy probe is required in every process before any exit. */
export class DockerSocketRecovery {
    private timer?: ReturnType<typeof setTimeout>;
    private stopped = false;
    private started = false;
    private checking = false;
    private armed = false;
    private failures = 0;
    private lastMessage = "";

    constructor(
        private config: DockerRecoveryConfig,
        private probe: () => Promise<DockerProbeResult>,
        private blocked: () => Promise<boolean>,
        private busyNow: () => boolean,
        private restart: () => void,
        private report: (message: string) => void,
    ) {}

    start(): void {
        if (!this.config.retries || this.started || this.stopped) {
            return;
        }
        this.started = true;
        const schedule = async () => {
            await this.check();
            if (!this.stopped) {
                this.timer = setTimeout(schedule, this.config.intervalMs);
            }
        };
        void schedule();
    }

    stop(): void {
        this.stopped = true;
        clearTimeout(this.timer);
    }

    private announce(message: string): void {
        if (message !== this.lastMessage) {
            this.lastMessage = message;
            this.report(message);
        }
    }

    async check(): Promise<void> {
        if (!this.config.retries || this.checking || this.stopped) {
            return;
        }
        this.checking = true;
        try {
            const result = await this.probe();
            if (this.stopped) {
                return;
            }
            if (result === "ready") {
                if (this.failures) {
                    this.announce("Docker connection recovered; restart cancelled");
                }
                this.failures = 0;
                this.armed = true;
                return;
            }
            if (result === "configuration-error") {
                this.failures = 0;
                this.announce("Docker access/configuration error; automatic restart refused");
                return;
            }
            if (!this.armed) {
                this.announce("Waiting for the first successful Docker connection; automatic restart not armed");
                return;
            }
            this.failures++;
            if (this.failures === 1) {
                this.announce("Docker connection lost; recovery checks in progress");
            }
            if (this.failures < this.config.retries) {
                return;
            }
            if (await this.blocked() || this.busyNow()) {
                this.announce("Docker recovery restart deferred: an operation is active");
                return;
            }
            if (this.stopped) {
                return;
            }
            this.announce("Docker remains unreachable; requesting graceful Enhanced restart through its container restart policy");
            this.stop();
            this.restart();
        } catch {
            // Fail closed if operation state cannot be checked. No raw CLI output/secrets.
            this.announce("Docker recovery check failed; automatic restart deferred");
        } finally {
            this.checking = false;
        }
    }
}
