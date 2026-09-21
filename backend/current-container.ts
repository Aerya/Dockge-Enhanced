import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface CurrentContainerInspect {
    Id?: string;
    Image?: string;
    Name?: string;
    Config?: Record<string, unknown> & {
        Hostname?: string;
        Image?: string;
        Labels?: Record<string, string>;
    };
    HostConfig?: Record<string, unknown>;
    NetworkSettings?: { Networks?: Record<string, unknown> };
    Mounts?: Array<{ Type?: string;
        Source?: string;
        Name?: string;
        Destination?: string }>;
}

type DockerRunner = (args: string[]) => Promise<string>;

async function defaultDockerRunner(args: string[]): Promise<string> {
    const { stdout } = await execFileAsync("docker", args, { timeout: 30_000,
        maxBuffer: 20 * 1024 * 1024 });
    return stdout;
}

function parseInspect(raw: string): CurrentContainerInspect[] {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed as CurrentContainerInspect[] : [ parsed as CurrentContainerInspect ];
}

export function selectCurrentContainer(
    containers: CurrentContainerInspect[],
    hostname: string,
): CurrentContainerInspect | null {
    const normalizedHostname = hostname.trim();
    if (!normalizedHostname) {
        return null;
    }

    const idMatches = containers.filter((container) => container.Id?.startsWith(normalizedHostname));
    if (idMatches.length === 1) {
        return idMatches[0];
    }

    const hostnameMatches = containers.filter((container) => container.Config?.Hostname === normalizedHostname);
    return hostnameMatches.length === 1 ? hostnameMatches[0] : null;
}

/**
 * Resolves the container running this process even when Compose overrides `hostname:`.
 * An explicit override wins; otherwise Docker's default short-ID hostname is tried
 * before a unique Config.Hostname match across running containers.
 */
export async function resolveCurrentContainer(
    runner: DockerRunner = defaultDockerRunner,
    env: NodeJS.ProcessEnv = process.env,
): Promise<CurrentContainerInspect> {
    const override = env.DOCKGE_CONTAINER_ID?.trim();
    const hostname = env.HOSTNAME?.trim();

    if (override) {
        try {
            const inspected = parseInspect(await runner([ "container", "inspect", override ]));
            if (inspected[0]?.Id) {
                return inspected[0];
            }
        } catch {
            throw new Error(`DOCKGE_CONTAINER_ID does not identify a Docker container: ${override}`);
        }
    }

    if (hostname) {
        try {
            const inspected = parseInspect(await runner([ "container", "inspect", hostname ]));
            if (inspected[0]?.Id?.startsWith(hostname)) {
                return inspected[0];
            }
        } catch {
            // A custom hostname is not a Docker identifier; continue with discovery.
        }
    }

    if (!hostname) {
        throw new Error("Current Docker container identifier is unavailable");
    }
    const ids = (await runner([ "container", "ls", "--all", "--quiet" ]))
        .split("\n")
        .map((value) => value.trim())
        .filter(Boolean);
    if (ids.length === 0) {
        throw new Error("No Docker container is available for current-container discovery");
    }
    const matched = selectCurrentContainer(parseInspect(await runner([ "container", "inspect", ...ids ])), hostname);
    if (!matched?.Id) {
        throw new Error("Current Docker container could not be resolved uniquely; set DOCKGE_CONTAINER_ID");
    }
    return matched;
}
