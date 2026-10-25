type Mapping = Record<string, unknown>;
export interface ResourceLimitDraft {
    cpu: string;
    memory: string;
}

function mapping(value: unknown): Mapping {
    if (value === undefined) {
        return {};
    }
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new Error("invalidStructure");
    }
    return value as Mapping;
}

/** Read raw values: never interpolate or silently replace existing expressions. */
export function readResourceLimits(service: Mapping): ResourceLimitDraft {
    const limits = mapping(mapping(mapping(service.deploy).resources).limits);
    return {
        cpu: String(limits.cpus ?? service.cpus ?? ""),
        memory: String(limits.memory ?? service.mem_limit ?? ""),
    };
}

/** Edit only explicitly changed limits; clone each path to avoid mutating YAML aliases. */
export function applyResourceLimits(service: Mapping, draft: ResourceLimitDraft): Mapping {
    const previous = readResourceLimits(service);
    const cpu = draft.cpu.trim();
    const memory = draft.memory.trim();
    const cpuChanged = cpu !== previous.cpu;
    const memoryChanged = memory !== previous.memory;
    if (!cpuChanged && !memoryChanged) {
        return service;
    }
    if (cpuChanged && cpu && (!/^\d+(?:\.\d{1,9})?$/.test(cpu) || !Number.isFinite(Number(cpu)) || Number(cpu) <= 0 || Number(cpu) > 1000000)) {
        throw new Error("invalidCpu");
    }
    if (memoryChanged && memory) {
        const match = memory.match(/^(\d+(?:\.\d+)?)\s*(b|[kmg]b?)?$/i);
        const power = { b: 0,
            k: 1,
            m: 2,
            g: 3 }[match?.[2]?.[0]?.toLowerCase() || "b"];
        const bytes = match ? Number(match[1]) * 1024 ** (power ?? 0) : NaN;
        if (!Number.isSafeInteger(bytes) || bytes < 6 * 1024 ** 2) {
            throw new Error("invalidMemory");
        }
    }
    const result = { ...service };
    const deploy = { ...mapping(service.deploy) };
    const resources = { ...mapping(deploy.resources) };
    const limits = { ...mapping(resources.limits) };
    for (const [ changed, value, key, alias ] of [
        [ cpuChanged, cpu, "cpus", "cpus" ],
        [ memoryChanged, memory, "memory", "mem_limit" ],
    ] as const) {
        if (!changed) {
            continue;
        }
        if (value) {
            limits[key] = value;
            if (Object.hasOwn(service, alias)) {
                result[alias] = key === "cpus" ? Number(value) : value;
            }
        } else {
            delete limits[key];
            delete result[alias];
        }
    }
    if (Object.keys(limits).length) {
        resources.limits = limits;
    } else {
        delete resources.limits;
    }
    if (Object.keys(resources).length) {
        deploy.resources = resources;
    } else {
        delete deploy.resources;
    }
    if (Object.keys(deploy).length) {
        result.deploy = deploy;
    } else {
        delete result.deploy;
    }
    return result;
}
