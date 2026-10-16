export interface StackResourceStat {
    cpu: number;
    memUsed: number;
}

export interface AggregatedStackResources {
    data: Record<string, StackResourceStat>;
    containerData: Record<string, StackResourceStat>;
    instances: Record<string, ContainerResourceStat>;
}

export interface ContainerResourceStat extends StackResourceStat {
    project: string;
    service: string;
    name: string;
}

/** Docker CLI memory usage already excludes inactive file cache on Linux. */
export function parseDockerBytes(value: string): number | null {
    const units: Record<string, number> = {
        B: 1,
        kB: 1000,
        KB: 1000,
        KiB: 1024,
        MB: 1000 ** 2,
        MiB: 1024 ** 2,
        GB: 1000 ** 3,
        GiB: 1024 ** 3,
        TB: 1000 ** 4,
        TiB: 1024 ** 4,
    };
    const match = value.trim().match(/^(\d+(?:\.\d+)?)\s*([A-Za-z]+)$/);
    if (!match || !units[match[2]]) {
        return null;
    }
    const bytes = Number(match[1]) * units[match[2]];
    return Number.isFinite(bytes) ? Math.round(bytes) : null;
}

function dockerRows(output: string): Array<Record<string, unknown>> {
    return output.split(/\r?\n/).filter(line => line.trim()).map(line => {
        const row: unknown = JSON.parse(line);
        if (!row || typeof row !== "object" || Array.isArray(row)) {
            throw new Error("Invalid Docker resource statistics");
        }
        return row as Record<string, unknown>;
    });
}

/** Sum every replica once; an incomplete running project is left unavailable. */
export function aggregateDockerStackResources(statsOutput: string, containersOutput: string): AggregatedStackResources {
    const byIdentity = new Map<string, { project: string;
        service: string;
        identity: string;
        name: string;
        running: boolean }>();
    const expected = new Map<string, Set<string>>();
    const measured = new Set<string>();
    const result: AggregatedStackResources = { data: {},
        containerData: {},
        instances: {} };
    for (const row of dockerRows(containersOutput)) {
        const labels = typeof row.Labels === "string" ? row.Labels : "";
        const project = labels.match(/(?:^|,)com\.docker\.compose\.project=([^,]+)/)?.[1];
        const service = labels.match(/(?:^|,)com\.docker\.compose\.service=([^,]+)/)?.[1];
        if (!project || !service) {
            continue;
        }
        const identities = [ row.ID, ...String(row.Names ?? "").split(",") ]
            .filter((value): value is string => typeof value === "string" && !!value.trim())
            .map(value => value.trim().replace(/^\//, ""));
        if (!identities.length) {
            continue;
        }
        const running = ![ "exited", "dead", "created", "removing" ].includes(String(row.State ?? "running"));
        const container = { project,
            service,
            identity: identities[0],
            name: String(row.Names ?? identities[0]).split(",")[0].replace(/^\//, ""),
            running };
        for (const identity of identities) {
            byIdentity.set(identity, container);
        }
        if (typeof row.ID === "string") {
            byIdentity.set(row.ID.slice(0, 12), container);
        }
        const required = expected.get(project) ?? new Set<string>();
        if (running) {
            required.add(container.identity);
        }
        expected.set(project, required);
        result.data[project] ??= { cpu: 0,
            memUsed: 0 };
        if (!running) {
            result.instances[container.identity] = { project,
                service,
                name: container.name,
                cpu: 0,
                memUsed: 0 };
        }
    }
    for (const row of dockerRows(statsOutput)) {
        const identities = [ row.ID, row.Container, row.Name ].filter((value): value is string => typeof value === "string");
        const container = identities.map(value => byIdentity.get(value.replace(/^\//, "")) ?? byIdentity.get(value.slice(0, 12))).find(Boolean);
        if (!container || !container.running || measured.has(container.identity)) {
            continue;
        }
        const rawCpu = String(row.CPUPerc ?? "").replace(/%$/, "").trim();
        const cpu = rawCpu ? Number(rawCpu) : Number.NaN;
        const memUsed = parseDockerBytes(String(row.MemUsage ?? "").split("/")[0]);
        if (!Number.isFinite(cpu) || cpu < 0 || memUsed === null) {
            continue;
        }
        measured.add(container.identity);
        result.instances[container.identity] = { project: container.project,
            service: container.service,
            name: container.name,
            cpu,
            memUsed };
        const stack = result.data[container.project];
        stack.cpu += cpu;
        stack.memUsed += memUsed;
        const key = `${container.project}:${container.service}`;
        const service = result.containerData[key] ??= { cpu: 0,
            memUsed: 0 };
        service.cpu += cpu;
        service.memUsed += memUsed;
    }
    for (const [ project, containers ] of expected) {
        if ([ ...containers ].some(identity => !measured.has(identity))) {
            delete result.data[project];
            for (const key of Object.keys(result.containerData)) {
                if (key.startsWith(`${project}:`)) {
                    delete result.containerData[key];
                }
            }
        }
    }
    for (const stat of [ ...Object.values(result.data), ...Object.values(result.containerData) ]) {
        stat.cpu = Math.round(stat.cpu * 10) / 10;
    }
    return result;
}
