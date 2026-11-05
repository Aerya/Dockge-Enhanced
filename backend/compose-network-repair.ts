import { composeLabelIsTrue, LABEL_NETWORK_REPAIR } from "../common/compose-labels";
import { ResolvedComposeModel, resolveNetworkNamespaceRecreateTargets } from "./compose-network-namespace";

export type NetworkRepairRead = (args: string[], compose: boolean) => Promise<string>;
interface ContainerNetworkState {
    running: boolean;
    networks: Record<string, { NetworkID?: string }>;
    mode: string;
}

const INSPECT_FORMAT = "{\"running\":{{json .State.Running}},\"networks\":{{json .NetworkSettings.Networks}},\"mode\":{{json .HostConfig.NetworkMode}}}";

/** Read-only planning. Missing networks and failed inspections are never treated as permission to recreate. */
export async function networkRepairTargets(model: ResolvedComposeModel, requested: string[], read: NetworkRepairRead): Promise<string[]> {
    const enabled = requested.filter(name => composeLabelIsTrue(model.services[name]?.labels as Record<string, unknown>, LABEL_NETWORK_REPAIR));
    if (!enabled.length) {
        return [];
    }
    const inventory = (await read([ "network", "ls", "--no-trunc", "--format", "{{json .}}" ], false))
        .trim().split("\n").filter(Boolean).map(line => JSON.parse(line) as { ID: string;
            Name: string });
    const ids = new Set(inventory.map(network => network.ID));
    const containers = new Map<string, ContainerNetworkState[]>();
    const inspect = async (service: string) => {
        const cached = containers.get(service);
        if (cached) {
            return cached;
        }
        const containerIds = (await read([ "ps", "--all", "--quiet", service ], true)).trim().split(/\s+/).filter(Boolean);
        const states: ContainerNetworkState[] = [];
        for (const id of containerIds) {
            if (!/^[a-f0-9]{12,64}$/.test(id)) {
                throw new Error("Invalid Compose container ID during network inspection");
            }
            states.push(JSON.parse(await read([ "inspect", "--type", "container", "--format", INSPECT_FORMAT, id ], false)) as ContainerNetworkState);
        }
        containers.set(service, states);
        return states;
    };
    const stale: string[] = [];
    for (const service of enabled) {
        for (const state of await inspect(service)) {
            if (state.running) {
                continue;
            }
            for (const [ name, attachment ] of Object.entries(state.networks || {})) {
                const previousId = attachment.NetworkID || (/^[a-f0-9]{64}$/.test(state.mode) ? state.mode : "");
                if (!previousId || ids.has(previousId)) {
                    continue;
                }
                const configured = Object.keys(model.services[service].networks || {})
                    .some(key => model.networks?.[key]?.name === name);
                if (!configured || !inventory.some(network => network.Name === name)) {
                    throw new Error(`Network repair refused for ${service}: network ${name} is missing or no longer configured`);
                }
                stale.push(service);
            }
        }
    }
    if (!stale.length) {
        return [];
    }
    const targets = resolveNetworkNamespaceRecreateTargets(model, stale);
    for (const service of targets) {
        if ((await inspect(service)).some(state => state.running)) {
            throw new Error(`Network repair requires an explicit recreation: ${service} still has a running container`);
        }
    }
    return targets;
}
