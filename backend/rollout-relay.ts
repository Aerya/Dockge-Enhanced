import { mkdtemp, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { relayConfig, RELAY_CONFIG, RELAY_SIGNATURE } from "../common/rollout-relay";
import type { DockerRun } from "./service-rollout";

/** Commands address only an inspected relay belonging to this Compose project. */
export class RolloutRelay {
    constructor(private docker: DockerRun, readonly id: string, readonly port: number) {}

    async workers(): Promise<string[]> {
        return (await this.workerState()).map(worker => worker.pid);
    }

    private async workerState(): Promise<{ pid: string;
        draining: boolean }[]> {
        const output = await this.docker([ "exec", this.id, "ps", "-o", "pid,args" ], 15_000);
        return output.split("\n").filter(line => /nginx: worker process/.test(line))
            .map(line => ({ pid: line.trim().split(/\s+/)[0],
                draining: line.includes("shutting down") }))
            .filter(worker => /^\d+$/.test(worker.pid));
    }

    async assertReady(): Promise<void> {
        const config = await this.docker([ "exec", this.id, "cat", RELAY_CONFIG ], 15_000);
        if (!config.startsWith(RELAY_SIGNATURE + "\n")) {
            throw new Error("Rollout: refusing to overwrite an unmanaged relay configuration");
        }
        await this.docker([ "exec", this.id, "nginx", "-t", "-c", RELAY_CONFIG ], 15_000);
        if (!(await this.workers()).length) {
            throw new Error("Rollout relay has no live workers");
        }
    }

    async checkTargets(hosts: string[]): Promise<void> {
        relayConfig(hosts, this.port);
        for (const host of hosts) {
            await this.docker([ "exec", this.id, "nc", "-z", "-w", "5", host, String(this.port) ], 10_000);
        }
    }

    /** Validate before atomic replace; then prove a new worker has started. */
    async route(hosts: string[], wait: (ms: number) => Promise<void>): Promise<void> {
        await this.checkTargets(hosts);
        const directory = await mkdtemp(path.join(os.tmpdir(), "dockge-relay-"));
        const file = path.join(directory, "nginx.conf");
        try {
            // Endpoints only, no credentials; readable by the unprivileged worker
            // and by the capability-restricted master after docker cp.
            await writeFile(file, relayConfig(hosts, this.port), { mode: 0o644 });
            const previous = await this.workers();
            await this.docker([ "cp", file, this.id + ":" + RELAY_CONFIG + ".next" ], 15_000);
            await this.docker([ "exec", this.id, "nginx", "-t", "-c", RELAY_CONFIG + ".next" ], 15_000);
            await this.docker([ "exec", this.id, "mv", RELAY_CONFIG + ".next", RELAY_CONFIG ], 15_000);
            await this.docker([ "exec", this.id, "nginx", "-s", "reload", "-c", RELAY_CONFIG ], 15_000);
            for (let attempt = 0; attempt < 30; attempt++) {
                const workers = await this.workerState();
                if (workers.some(worker => !previous.includes(worker.pid) && !worker.draining) &&
                    !workers.some(worker => previous.includes(worker.pid) && !worker.draining)) {
                    return;
                }
                await wait(200);
            }
            throw new Error("Rollout relay did not acknowledge reconfiguration");
        } finally {
            await rm(directory, { recursive: true,
                force: true });
        }
    }

    /** All worker generations which could reach the old replicas must finish. */
    async drain(previous: string[], wait: (ms: number) => Promise<void>, attempts: number): Promise<void> {
        for (let attempt = 0; attempt < attempts; attempt++) {
            if (!(await this.workers()).some(pid => previous.includes(pid))) {
                return;
            }
            await wait(2_000);
        }
        throw new Error("Rollout relay: active connections remain; old replicas must be retained");
    }
}
