export interface TopologyContainer {
    id: string;
    name: string;
    stack: string;
    service: string;
    external: boolean;
    state: string;
    mode: string;
    networks: Array<{
        name: string;
        ip: string;
    }>;
    ports: Array<{
        address: string;
        published: number;
        target: number;
        protocol: string;
    }>;
}
export interface TopologySnapshot {
    capturedAt: string;
    containers: TopologyContainer[];
    networks: Array<{
        name: string;
        driver: string;
        internal: boolean;
        subnets: string[];
    }>;
    unavailable: number;
    primaryHostname: string;
    portLinkAddressMode: string;
    portLinkIp: string;
}
export function topologyOwner(container: TopologyContainer, containers: TopologyContainer[]) {
    if (!container.mode.startsWith("container:")) {
        return undefined;
    }
    const reference = container.mode.slice(10);
    return containers.find(item => item.id === reference || item.name === reference);
}
export function topologySelection(snapshot: TopologySnapshot, stack: string, stopped: boolean, external: boolean) {
    const visible = snapshot.containers.filter(c => (stopped || c.state === "running") && (external || !c.external));
    const selected = visible.filter(c => !stack || c.stack === stack);
    const context = snapshot.containers.filter(c => selected.some(item => topologyOwner(item, snapshot.containers)?.id === c.id)
        || visible.some(item => item.id === c.id && selected.some(parent => topologyOwner(item, snapshot.containers)?.id === parent.id)));
    return { selected,
        context: context.filter(c => !selected.includes(c)) };
}
