import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { EXITED, RUNNING } from "../common/util-common";

const execute = promisify(execFile);
const COMPOSE_PROJECT_LABEL = "com.docker.compose.project";
const NAME_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/;

interface StandaloneInspect {
    Id: string;
    Name: string;
    State?: { Running?: boolean };
    Config?: { Labels?: Record<string, string> };
}

/** Parses `docker inspect` output for one container, keeping only the fields used here (never Env). */
function parseInspect(raw: string): StandaloneInspect[] {
    const parsed = JSON.parse(raw) as unknown;
    return (Array.isArray(parsed) ? parsed : [ parsed ]) as StandaloneInspect[];
}

/** Containers started outside any Compose project. Compose containers stay under their stack grant. */
export async function listStandaloneContainers(): Promise<{ id: string;
    name: string }[]> {
    const ids = (await execute("docker", [ "ps", "-aq", "--no-trunc" ], { timeout: 30_000 })).stdout.split("\n").map(id => id.trim()).filter(Boolean);
    if (ids.length === 0) {
        return [];
    }
    const containers = parseInspect((await execute("docker", [ "inspect", ...ids ], { timeout: 30_000,
        maxBuffer: 20 * 1024 * 1024 })).stdout);
    return containers
        .filter(container => !container.Config?.Labels?.[COMPOSE_PROJECT_LABEL])
        .map(container => ({ id: container.Id,
            name: container.Name.replace(/^\//, "") }))
        .filter(container => NAME_PATTERN.test(container.name));
}

/** Resolves a granted standalone container; refuses anything that belongs to a Compose project. */
async function resolveStandalone(name: string): Promise<StandaloneInspect> {
    if (!NAME_PATTERN.test(name)) {
        throw new Error("access.denied");
    }
    const [ container ] = parseInspect((await execute("docker", [ "inspect", name ], { timeout: 15_000,
        maxBuffer: 5 * 1024 * 1024 })).stdout);
    if (!container || container.Config?.Labels?.[COMPOSE_PROJECT_LABEL]) {
        throw new Error("access.denied");
    }
    return container;
}

export async function viewStandalone(name: string): Promise<{ name: string;
    status: number;
    displayName: string }> {
    const container = await resolveStandalone(name);
    return { name,
        status: container.State?.Running ? RUNNING : EXITED,
        displayName: name };
}

export async function logsStandalone(name: string): Promise<{ logs: string }> {
    await resolveStandalone(name);
    const result = await execute("docker", [ "logs", "--tail", "200", name ], { timeout: 15_000,
        maxBuffer: 1024 * 1024 });
    return { logs: `${result.stdout}${result.stderr}` };
}

/** Lifecycle actions only: standalone containers have no Compose definition to recreate or update. */
export async function actionStandalone(name: string, action: "start" | "stop" | "restart", currentContainerId: string | undefined): Promise<void> {
    const container = await resolveStandalone(name);
    // A delegated account must never stop or restart this management plane.
    if (!currentContainerId || container.Id.startsWith(currentContainerId) || currentContainerId.startsWith(container.Id)) {
        throw new Error("access.denied");
    }
    await execute("docker", [ action, name ], { timeout: 10 * 60_000 });
}
