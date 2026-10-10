/** Docker Socket Proxy sidecar: attach to a real network before joining more. */
export interface SidecarNetworkPlan {
    initialNetwork: string;
    additionalNetworks: string[];
}

export function planSidecarNetworks(networks: readonly string[]): SidecarNetworkPlan {
    const selected = [...new Set(networks)];
    if (selected.length === 0) {
        throw new Error("Docker Socket Proxy sidecar requires at least one Docker network");
    }
    for (const network of selected) {
        if (!network || network !== network.trim() || network === "none" || network === "host") {
            throw new Error(`Unsupported Docker Socket Proxy sidecar network: ${network}`);
        }
    }
    return { initialNetwork: selected[0],
        additionalNetworks: selected.slice(1) };
}

/** Never release the signed plan until every extra Docker network is connected. */
export async function connectSidecarAdditionalNetworks(
    plan: SidecarNetworkPlan,
    connect: (network: string) => Promise<void>,
    signalReady: () => Promise<void>,
): Promise<void> {
    for (const network of plan.additionalNetworks) {
        await connect(network);
    }
    await signalReady();
}
