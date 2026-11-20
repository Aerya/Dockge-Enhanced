import { promisify } from "node:util";
import { readFile, readlink, access } from "node:fs/promises";
import { execFile } from "./buffered-process";
import type { TopologySnapshot } from "../common/docker-topology";
const exec = promisify(execFile);
export type ObservationRun = (file: string, args: string[]) => Promise<string>;
const run: ObservationRun = async (file, args) => (await exec(file, args, { timeout: 5000,
    maxBuffer: 1024 * 1024 })).stdout;
export interface NetworkObservation {
    capturedAt: string;
    host: { state: "available" | "unavailable";
        interfaces?: unknown[];
        routes?: unknown[];
        tunnels?: unknown[];
        firewall?: string };
    traffic: Array<{ id: string;
        state: "available" | "warming" | "unavailable";
        rx?: number;
        tx?: number;
        history: Array<{ at: number;
            rx: number;
            tx: number }> }>;
}
export function networkBytes(value: string): number | undefined {
    const match = /^([\d.]+)\s*(B|kB|MB|GB|TB|KiB|MiB|GiB|TiB)$/.exec(value.trim());
    if (!match) {
        return undefined;
    }
    const index = [ "B", "kB", "MB", "GB", "TB" ].indexOf(match[2]);
    const power = index >= 0 ? index : [ "B", "KiB", "MiB", "GiB", "TiB" ].indexOf(match[2]);
    const bytes = Number(match[1]) * (index >= 0 ? 1000 : 1024) ** power;
    return Number.isFinite(bytes) ? bytes : undefined;
}
/** Prove a native Linux host namespace and a local Docker endpoint. Never nsenter or elevate. */
async function nativeHost(): Promise<boolean> {
    try {
        if (await access("/.dockerenv").then(() => true, () => false) || process.env.container) {
            return false;
        }
        if ((await readFile("/proc/1/comm", "utf8")).trim() !== "systemd" || await readlink("/proc/self/ns/net") !== await readlink("/proc/1/ns/net")) {
            return false;
        }
        const endpoint = process.env.DOCKER_HOST || (await run("docker", [ "context", "inspect", "--format", "{{.Endpoints.docker.Host}}" ])).trim();
        return endpoint === "unix:///var/run/docker.sock";
    } catch {
        return false;
    }
}
/** Demand-driven, bounded in-memory samples per agent. No timer and no filesystem history. */
export class TopologyObservation {
    private previous = new Map<string, { at: number;
        rx: number;
        tx: number;
        history: Array<{ at: number;
            rx: number;
            tx: number }> }>();

    private cached?: NetworkObservation;
    private pending?: Promise<NetworkObservation>;
    constructor(private execute: ObservationRun = run, private isHost = nativeHost, private now = Date.now) {}
    get(snapshot: TopologySnapshot): Promise<NetworkObservation> {
        if (this.cached && this.now() - Date.parse(this.cached.capturedAt) < 10000) {
            return Promise.resolve(this.cached);
        }
        this.pending ??= this.collect(snapshot).then(result => {
            this.cached = result;
            return result;
        }).finally(() => {
            this.pending = undefined;
        });
        return this.pending;
    }

    private async collect(snapshot: TopologySnapshot): Promise<NetworkObservation> {
        const at = this.now();
        const result: NetworkObservation = { capturedAt: new Date(at).toISOString(),
            host: { state: "unavailable" },
            traffic: [] };
        if (await this.isHost()) {
            const read = async (args: string[]) => {
                try {
                    const value = JSON.parse(await this.execute("ip", args));
                    return Array.isArray(value) ? value : undefined;
                } catch {
                    return undefined;
                }
            };
            const interfaces = await read([ "-j", "address", "show" ]);
            const routes = await read([ "-j", "route", "show", "table", "all" ]);
            const tunnels = await read([ "-j", "-d", "link", "show", "type", "wireguard" ]);
            let firewall: string | undefined;
            try {
                firewall = await this.execute("nft", [ "list", "ruleset" ]);
            } catch { /* Missing tools/permissions are unknown, never an empty ruleset. */ }
            result.host = { state: interfaces ? "available" : "unavailable",
                interfaces,
                routes,
                tunnels,
                firewall };
        }
        const active = snapshot.containers.filter(c => c.state === "running" && c.mode !== "host" && !c.mode.startsWith("container:"));
        const counters = new Map<string, { rx: number;
            tx: number }>();
        if (active.length) {
            try {
                const output = await this.execute("docker", [ "stats", "--no-stream", "--no-trunc", "--format", "{{json .}}", ...active.map(c => c.id) ]);
                for (const line of output.trim().split("\n").filter(Boolean)) {
                    const row = JSON.parse(line);
                    const [ incoming, outgoing ] = String(row.NetIO).split("/");
                    const rx = networkBytes(incoming || "");
                    const tx = networkBytes(outgoing || "");
                    if (rx !== undefined && tx !== undefined) {
                        counters.set(row.ID, { rx,
                            tx });
                    }
                }
            } catch { /* Failed collection must not become a zero rate. */ }
        }
        for (const c of snapshot.containers) {
            const current = counters.get(c.id);
            const old = this.previous.get(c.id);
            const sample: NetworkObservation["traffic"][number] = { id: c.id,
                state: current ? "warming" : "unavailable",
                history: [] };
            if (current) {
                const history = old && at - old.at <= 60000 ? old.history.slice(-29) : [];
                if (old && at > old.at && at - old.at <= 60000 && current.rx >= old.rx && current.tx >= old.tx) {
                    sample.state = "available";
                    sample.rx = (current.rx - old.rx) * 1000 / (at - old.at);
                    sample.tx = (current.tx - old.tx) * 1000 / (at - old.at);
                    history.push({ at,
                        rx: sample.rx,
                        tx: sample.tx });
                }
                sample.history = history;
                this.previous.set(c.id, { at,
                    ...current,
                    history });
            } else {
                this.previous.delete(c.id);
            }
            result.traffic.push(sample);
        }
        for (const id of this.previous.keys()) {
            if (!snapshot.containers.some(c => c.id === id)) {
                this.previous.delete(id);
            }
        }
        return result;
    }
}
