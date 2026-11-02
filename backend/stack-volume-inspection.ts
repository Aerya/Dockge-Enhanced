import childProcessAsync from "promisify-child-process";
import { log } from "./log";

export const VOLUME_INSPECT_BATCH_SIZE = 16;
export const VOLUME_COMMAND_MAX_BUFFER = 4 * 1024 * 1024;
export const VOLUME_INSPECT_FORMAT = "{\"Id\":{{json .Id}},\"Name\":{{json .Name}},\"Service\":{{json (index .Config.Labels \"com.docker.compose.service\")}},\"State\":{{json .State.Status}},\"Mounts\":{{json .Mounts}}}";

interface VolumeMount {
    Type?: string;
    Name?: string;
    Source?: string;
    Destination?: string;
}

export interface VolumeContainer {
    Id: string;
    Name: string;
    Service: string | null;
    State: string;
    Mounts: VolumeMount[];
}

type VolumeRunner = (args: string[], cwd: string, operation: string) => Promise<string>;

function safeVolumeCommandError(operation: string, error: unknown): Error {
    // Child-process errors carry stdout/stderr, which may contain secrets.
    // Keep only a bounded diagnostic, including in the public error cause.
    const code = error && typeof error === "object" && "code" in error && typeof error.code === "number" ? error.code : null;
    const reason = error instanceof Error && /maxBuffer/i.test(error.message)
        ? "command output exceeds 4 MiB"
        : `Docker command failed or timed out${code === null ? "" : ` (exit ${code})`}`;
    const message = `Unable to read stack volumes (${operation}): ${reason}`;
    log.warn("stackVolumes", message);
    return new Error(message, { cause: { operation,
        reason } });
}

export const runVolumeCommand: VolumeRunner = async (args, cwd, operation) => {
    try {
        const result = await childProcessAsync.spawn("docker", args, {
            cwd,
            encoding: "utf-8",
            maxBuffer: VOLUME_COMMAND_MAX_BUFFER,
            timeout: 30_000,
        });
        return result.stdout?.toString() ?? "";
    } catch (error) {
        throw safeVolumeCommandError(operation, error);
    }
};

function parseContainer(line: string): VolumeContainer {
    const value: unknown = JSON.parse(line);
    if (!value || typeof value !== "object") {
        throw new Error("Invalid container");
    }
    const container = value as Record<string, unknown>;
    if (typeof container.Id !== "string" || typeof container.Name !== "string"
        || (typeof container.Service !== "string" && container.Service !== null)
        || typeof container.State !== "string" || !Array.isArray(container.Mounts)) {
        throw new Error("Invalid container fields");
    }
    for (const mount of container.Mounts) {
        if (!mount || typeof mount !== "object") {
            throw new Error("Invalid mount");
        }
        for (const key of [ "Type", "Name", "Source", "Destination" ]) {
            if (mount[key] !== undefined && typeof mount[key] !== "string") {
                throw new Error("Invalid mount field");
            }
        }
    }
    return container as unknown as VolumeContainer;
}

export async function inspectStackVolumes(composePsArgs: string[], cwd: string, run: VolumeRunner = runVolumeCommand): Promise<VolumeContainer[]> {
    const ps = await run(composePsArgs, cwd, "compose ps -aq");
    const ids = [ ...new Set(ps.split(/\r?\n/).map(id => id.trim()).filter(Boolean)) ];
    if (ids.some(id => !/^[a-f0-9]{12,64}$/.test(id))) {
        throw new Error("Unable to read stack volumes (compose ps -aq): invalid container IDs");
    }
    const containers: VolumeContainer[] = [];
    for (let offset = 0; offset < ids.length; offset += VOLUME_INSPECT_BATCH_SIZE) {
        const batch = ids.slice(offset, offset + VOLUME_INSPECT_BATCH_SIZE);
        const operation = `docker inspect mounts, batch ${Math.floor(offset / VOLUME_INSPECT_BATCH_SIZE) + 1} (${batch.length} containers)`;
        const output = await run([ "inspect", "--format", VOLUME_INSPECT_FORMAT, ...batch ], cwd, operation);
        try {
            const parsed = output.trim().split(/\r?\n/).filter(Boolean).map(parseContainer);
            if (parsed.length !== batch.length) {
                throw new Error("Incomplete inspection");
            }
            containers.push(...parsed);
        } catch {
            const message = `Unable to read stack volumes (${operation}): invalid or incomplete Docker response`;
            log.warn("stackVolumes", message);
            throw new Error(message);
        }
    }
    return containers;
}
