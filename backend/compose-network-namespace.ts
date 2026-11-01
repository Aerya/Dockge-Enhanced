export interface ResolvedComposeService {
    image?: unknown;
    labels?: unknown;
    network_mode?: unknown;
    container_name?: unknown;
}

export interface ResolvedComposeModel {
    services: Record<string, ResolvedComposeService>;
}

const COMPOSE_MODEL_ERROR = "Unable to resolve Compose network namespace dependencies";

export function composeModelReadError(error: unknown): Error {
    const detail = error instanceof Error ? error.message : String(error);
    if (error instanceof Error && detail.startsWith(COMPOSE_MODEL_ERROR)) {
        return error;
    }
    return new Error(`${COMPOSE_MODEL_ERROR}: ${detail}`);
}

export function parseResolvedComposeModel(output: string): ResolvedComposeModel {
    try {
        const parsed = JSON.parse(output) as { services?: unknown };
        if (!parsed || typeof parsed !== "object" || !parsed.services || typeof parsed.services !== "object" || Array.isArray(parsed.services)) {
            throw new Error("docker compose config returned no services");
        }
        return { services: parsed.services as Record<string, ResolvedComposeService> };
    } catch (error) {
        throw composeModelReadError(error);
    }
}

export function findComposeServicesByImage(
    model: ResolvedComposeModel,
    image: string,
    predicate: (service: ResolvedComposeService) => boolean = () => true,
): string[] {
    const expected = image.trim();
    return Object.entries(model.services)
        .filter(([ , service ]) => typeof service.image === "string" && service.image.trim() === expected && predicate(service))
        .map(([ name ]) => name)
        .sort();
}

/**
 * Returns the requested services first, followed by every direct or transitive
 * consumer of their network namespace. container: references are followed only
 * when they match a container_name declared in this same resolved Compose model.
 */
export function resolveNetworkNamespaceRecreateTargets(
    model: ResolvedComposeModel,
    requestedServices: string[],
): string[] {
    const requested = [ ...new Set(requestedServices) ];
    if (requested.length === 0) {
        return [];
    }
    for (const service of requested) {
        if (!model.services[service]) {
            throw new Error(`${COMPOSE_MODEL_ERROR}: service "${service}" is not present in the resolved model`);
        }
    }

    const serviceByContainerName = new Map<string, string>();
    for (const [ name, service ] of Object.entries(model.services)) {
        if (typeof service.container_name === "string" && service.container_name.trim()) {
            serviceByContainerName.set(service.container_name.trim(), name);
        }
    }

    const consumersByProvider = new Map<string, Set<string>>();
    for (const [ consumerName, service ] of Object.entries(model.services)) {
        if (typeof service.network_mode !== "string") {
            continue;
        }
        let provider = "";
        if (service.network_mode.startsWith("service:")) {
            const referencedService = service.network_mode.slice("service:".length);
            if (model.services[referencedService]) {
                provider = referencedService;
            }
        } else if (service.network_mode.startsWith("container:")) {
            const containerName = service.network_mode.slice("container:".length);
            provider = serviceByContainerName.get(containerName) ?? "";
        }
        if (!provider) {
            continue;
        }
        const consumers = consumersByProvider.get(provider) ?? new Set<string>();
        consumers.add(consumerName);
        consumersByProvider.set(provider, consumers);
    }

    const result = [ ...requested ];
    const visited = new Set(result);
    for (let index = 0; index < result.length; index++) {
        const consumers = [ ...(consumersByProvider.get(result[index]) ?? []) ].sort();
        for (const consumer of consumers) {
            if (visited.has(consumer)) {
                continue;
            }
            visited.add(consumer);
            result.push(consumer);
        }
    }
    return result;
}

export function targetedComposeRecreateArgs(
    model: ResolvedComposeModel,
    requestedServices: string[],
): string[] {
    return targetedComposeRecreateArgsForTargets(
        resolveNetworkNamespaceRecreateTargets(model, requestedServices),
    );
}

export function targetedComposeRecreateArgsForTargets(targets: string[]): [string, ...string[]] {
    if (targets.length === 0) {
        throw new Error(`${COMPOSE_MODEL_ERROR}: no service was selected for targeted recreation`);
    }
    return [
        "up",
        "-d",
        "--force-recreate",
        "--no-deps",
        ...targets,
    ];
}

/** Compose restart may restart namespace providers and consumers concurrently. */
export async function restartComposeServices(
    model: ResolvedComposeModel,
    requested: string[] | undefined,
    run: (command: string, ...args: string[]) => Promise<void>,
): Promise<void> {
    const targets = resolveNetworkNamespaceRecreateTargets(model, requested ?? Object.keys(model.services));
    if (targets.length === 0) {
        throw new Error(`${COMPOSE_MODEL_ERROR}: no service was selected for restart`);
    }
    const providers = new Map(targets.map(name => [ name, new Set<string>() ]));
    for (const provider of targets) {
        for (const consumer of resolveNetworkNamespaceRecreateTargets(model, [ provider ]).slice(1)) {
            providers.get(consumer)?.add(provider);
        }
    }
    if ([ ...providers.values() ].every(dependencies => dependencies.size === 0)) {
        await run("restart", ...(requested ?? []));
        return;
    }
    const ordered: string[] = [];
    const visiting = new Set<string>();
    const visited = new Set<string>();
    const visit = (name: string) => {
        if (visiting.has(name)) {
            throw new Error(`${COMPOSE_MODEL_ERROR}: cyclic network namespace dependency`);
        }
        if (visited.has(name)) {
            return;
        }
        visiting.add(name);
        for (const provider of providers.get(name) ?? []) {
            visit(provider);
        }
        visiting.delete(name);
        visited.add(name);
        ordered.push(name);
    };
    // Resolve the complete order before making any Docker mutation.
    targets.forEach(visit);
    for (const name of ordered) {
        // Wait for the provider to run before starting a consumer. Unlike up,
        // restart never applies pending Compose edits or pulls a new image.
        await run("restart", "--no-deps", name);
    }
}
