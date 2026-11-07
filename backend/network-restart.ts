import { createHash } from "node:crypto";
import { promisify } from "node:util";
import { setTimeout as delay } from "node:timers/promises";
import { execFile } from "./buffered-process";

export interface NetworkRestartContainer {
    id: string;
    name: string;
    project: string;
    service: string;
    state: string;
    mode: string;
    health?: string;
    stack?: string;
}
export interface NetworkRestartPlan {
    token: string;
    containers: NetworkRestartContainer[];
}
const format = "{\"id\":{{json .Id}},\"name\":{{json .Name}},\"project\":{{json (index .Config.Labels \"com.docker.compose.project\")}},\"service\":{{json (index .Config.Labels \"com.docker.compose.service\")}},\"state\":{{json .State.Status}},\"mode\":{{json .HostConfig.NetworkMode}},\"health\":{{with (index .State \"Health\")}}{{json .Status}}{{else}}\"\"{{end}}}";
const exec = promisify(execFile);
export const networkRestartDocker = async (args: string[]) => (await exec("docker", args, { timeout: 45000,
    maxBuffer: 1024 * 1024 })).stdout;

export async function readNetworkRestartContainers(run = networkRestartDocker): Promise<NetworkRestartContainer[]> {
    const ids = (await run([ "ps", "-aq", "--no-trunc" ])).trim().split(/\s+/).filter(Boolean);
    const rows: NetworkRestartContainer[] = [];
    for (let i = 0; i < ids.length; i += 16) {
        rows.push(...(await run([ "container", "inspect", "--format", format, ...ids.slice(i, i + 16) ])).trim().split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line)));
    }
    return rows.map(row => ({ ...row,
        name: row.name.replace(/^\//, "") }));
}

/** Network ownership is Docker-local. Never infer a dependency from ports or LAN addresses. */
export function planNetworkRestart(rows: NetworkRestartContainer[], rootStack: string): NetworkRestartPlan {
    const byId = new Map(rows.map(row => [ row.id, row ]));
    const providers = new Map<string, string>();
    const unresolved = new Set<string>();
    for (const row of rows) {
        if (!row.mode.startsWith("container:")) {
            continue;
        }
        const reference = row.mode.slice(10);
        const matches = rows.filter(candidate => candidate.name === reference || candidate.id === reference || candidate.id.startsWith(reference));
        if (matches.length !== 1) {
            unresolved.add(row.id);
            continue;
        }
        providers.set(row.id, matches[0].id);
    }
    const selected = new Set(rows.filter(row => row.stack === rootStack && row.state === "running").map(row => row.id));
    if (!selected.size) {
        throw new Error("networkRestart.empty");
    }
    for (let size = -1; size !== selected.size;) {
        size = selected.size;
        for (const [ consumer, provider ] of providers) {
            if (selected.has(provider) && byId.get(consumer)?.state !== "exited" && byId.get(consumer)?.state !== "created" && byId.get(consumer)?.state !== "dead") {
                selected.add(consumer);
            }
        }
    }
    if (selected.size > 50) {
        throw new Error("networkRestart.tooMany");
    }
    const ordered: NetworkRestartContainer[] = [];
    const visiting = new Set<string>();
    const visited = new Set<string>();
    const visit = (id: string) => {
        if (visited.has(id)) {
            return;
        }
        if (visiting.has(id)) {
            throw new Error("networkRestart.cycle");
        }
        visiting.add(id);
        const provider = providers.get(id);
        if (provider && selected.has(provider)) {
            visit(provider);
        }
        const row = byId.get(id)!;
        if (unresolved.has(id)) {
            throw new Error("networkRestart.ambiguous");
        }
        if (!row.stack || !row.service || row.state !== "running") {
            throw new Error("networkRestart.unmanaged");
        }
        ordered.push(row);
        visited.add(id);
        visiting.delete(id);
    };
    [ ...selected ].sort().forEach(visit);
    const token = createHash("sha256").update(JSON.stringify(ordered.map(({ health: _health, ...identity }) => identity))).digest("hex");
    return { token,
        containers: ordered };
}

/** Restart existing IDs only: Compose files and images are never recreated or rewritten. */
export async function executeNetworkRestart(
    plan: NetworkRestartPlan,
    run = networkRestartDocker,
    wait: (ms: number) => Promise<unknown> = delay,
    now = Date.now,
): Promise<string[]> {
    const started = now();
    const completed: string[] = [];
    for (const row of plan.containers) {
        if (now() - started >= 300000) {
            throw new Error("networkRestart.timeout");
        }
        const current = JSON.parse((await run([ "container", "inspect", "--format", format, row.id ])).trim()) as NetworkRestartContainer;
        if (current.id !== row.id || current.mode !== row.mode || current.state !== "running") {
            throw new Error("networkRestart.changed");
        }
        await run([ "container", "restart", "--timeout", "10", row.id ]);
        const deadline = Math.min(started + 300000, now() + 120000);
        while (true) {
            const state = JSON.parse((await run([ "container", "inspect", "--format", format, row.id ])).trim()) as NetworkRestartContainer;
            if (state.state === "running" && (!state.health || state.health === "healthy")) {
                break;
            }
            if (state.state !== "running" || state.health === "unhealthy") {
                throw new Error("networkRestart.unhealthy");
            }
            if (now() >= deadline) {
                throw new Error("networkRestart.timeout");
            }
            await wait(500);
        }
        completed.push(row.id);
    }
    return completed;
}
