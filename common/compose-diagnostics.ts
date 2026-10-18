/** Compose diagnostics inspired by darthrater78/dockge. No Docker mutations. */
export interface PublishedPort {
    owner: string;
    service: string;
    published: string;
    protocol: string;
    host: string;
}

export interface PortConflict {
    requested: PublishedPort;
    occupied: PublishedPort;
}

function interval(value: string): [number, number] | null {
    if (!/^\d+(?:-\d+)?$/.test(value)) {
        return null;
    }
    const [ start, end = start ] = value.split("-").map(Number);
    return start > 0 && end >= start && end <= 65535 ? [ start, end ] : null;
}

export function findPortConflicts(requested: PublishedPort[], occupied: PublishedPort[]): PortConflict[] {
    const conflicts: PortConflict[] = [];
    const wildcard = (host: string) => !host || host === "0.0.0.0" || host === "::";
    for (const port of requested) {
        const range = interval(port.published);
        if (!range) {
            continue;
        }
        for (const other of occupied) {
            const otherRange = interval(other.published);
            if (otherRange && port.protocol === other.protocol &&
                (wildcard(port.host) || wildcard(other.host) || port.host === other.host) &&
                range[0] <= otherRange[1] && otherRange[0] <= range[1]) {
                conflicts.push({ requested: port,
                    occupied: other });
            }
        }
    }
    return conflicts;
}

export interface ComposeModel {
    name?: string;
    services?: Record<string, {
        image?: string;
        ports?: { published?: string | number;
            protocol?: string;
            host_ip?: string }[];
    }>;
}

export function modelPorts(model: ComposeModel, owner: string): PublishedPort[] {
    return Object.entries(model.services ?? {}).flatMap(([ service, config ]) =>
        (config.ports ?? []).filter(port => port.published !== undefined).map(port => ({
            owner,
            service,
            published: String(port.published),
            protocol: port.protocol ?? "tcp",
            host: port.host_ip ?? "",
        })));
}

export interface RunningImage {
    service: string;
    image: string;
}

export interface ImageDrift {
    service: string;
    configured: string;
    running: string[];
}

function normalizedReference(value: string): string {
    const reference = value.replace(/^docker\.io\//, "").replace(/^library\//, "");
    return reference.includes("@") || reference.split("/").at(-1)?.includes(":") ? reference : `${reference}:latest`;
}

export function findImageDrift(model: ComposeModel, running: RunningImage[]): ImageDrift[] {
    return Object.entries(model.services ?? {}).flatMap(([ service, config ]) => {
        if (!config.image) {
            return [];
        }
        const images = [ ...new Set(running.filter(item => item.service === service).map(item => item.image)) ];
        return images.some(image => normalizedReference(image) !== normalizedReference(config.image!))
            ? [{ service,
                configured: config.image,
                running: images }] : [];
    });
}
