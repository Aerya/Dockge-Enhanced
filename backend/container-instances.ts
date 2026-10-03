import { ValidationError } from "./util-server";

export interface ContainerInstance {
    id: string;
    name: string;
    service: string;
    state: string;
    health: string;
    image: string;
    ports: string;
    createdAt: string;
    runningFor: string;
}

/** Parse both newline-delimited and array-shaped `docker compose ps --format json` output. */
export function parseContainerInstances(output: string): ContainerInstance[] {
    const instances: ContainerInstance[] = [];
    const add = (value: unknown): void => {
        if (!value || typeof value !== "object") {
            return;
        }
        const row = value as Record<string, unknown>;
        const id = typeof row.ID === "string" ? row.ID : "";
        const name = typeof row.Name === "string" ? row.Name.replace(/^\//, "") : "";
        const service = typeof row.Service === "string" ? row.Service : "";
        if (!/^[a-f0-9]{12,64}$/i.test(id) || !name || !service) {
            return;
        }
        const field = (key: string): string => typeof row[key] === "string" ? row[key] as string : "";
        instances.push({
            id,
            name,
            service,
            state: field("State"),
            health: field("Health"),
            image: field("Image"),
            ports: field("Ports"),
            createdAt: field("CreatedAt"),
            runningFor: field("RunningFor"),
        });
    };

    try {
        const parsed: unknown = JSON.parse(output);
        if (Array.isArray(parsed)) {
            parsed.forEach(add);
            return instances;
        }
    } catch {
        // Docker Compose normally emits one JSON object per line.
    }

    for (const line of output.split("\n")) {
        if (!line.trim()) {
            continue;
        }
        try {
            const parsed: unknown = JSON.parse(line);
            if (Array.isArray(parsed)) {
                parsed.forEach(add);
            } else {
                add(parsed);
            }
        } catch {
            // Docker Compose may mix progress or diagnostics into output.
        }
    }
    return instances;
}

export function requireContainerInstance(instances: ContainerInstance[], id: unknown): ContainerInstance {
    if (typeof id !== "string" || !/^[a-f0-9]{12,64}$/i.test(id)) {
        throw new ValidationError("Invalid container ID");
    }
    const instance = instances.find((entry) => entry.id === id);
    if (!instance) {
        throw new ValidationError("Container does not belong to this stack");
    }
    return instance;
}
