import { promisify } from "node:util";
import { topologyRoutes, topologyRouteLabelsFormat } from "./topology-routes";
import { hostContainerPorts } from "./topology-host-ports";
import { readdir } from "node:fs/promises";
import { execFile } from "./buffered-process";
import { Stack, getManagedStackNameFromConfigFiles } from "./stack";
import type { DockgeServer } from "./dockge-server";
import type { TopologyContainer, TopologySnapshot } from "../common/docker-topology";
const exec = promisify(execFile);
export type TopologyRunner = (args: string[]) => Promise<string>;
const docker: TopologyRunner = async (args) => (await exec("docker", args, { timeout: 15000 })).stdout;
// Base fields; the collector adds an explicit web-route label allowlist. No environment, mounts or commands.
export const topologyContainerFormat = "{\"id\":{{json .Id}},\"name\":{{json .Name}},\"project\":{{json (index .Config.Labels \"com.docker.compose.project\")}},\"service\":{{json (index .Config.Labels \"com.docker.compose.service\")}},\"state\":{{json .State.Status}},\"mode\":{{json .HostConfig.NetworkMode}},\"ports\":{{json .NetworkSettings.Ports}},\"networks\":{{json .NetworkSettings.Networks}}}";
const networkFormat = "{\"name\":{{json .Name}},\"driver\":{{json .Driver}},\"internal\":{{json .Internal}},\"subnets\":{{json .IPAM.Config}}}";
interface InspectedTopologyRow {
    pid?: number;
    routes?: Record<string, string>;
    id?: string;
    name: string;
    project?: string;
    service?: string;
    state?: string;
    mode?: string;
    networks?: Record<string, { IPAddress?: string }>;
    ports?: Record<string, Array<{ HostIp: string;
        HostPort: string }> | null>;
    driver?: string;
    internal?: boolean;
    subnets?: Array<{ Subnet?: string }>;
}
export async function topologyStackNames(server: DockgeServer): Promise<Map<string, {
    name: string;
    external: boolean;
}>> {
    const result = new Map<string, {
        name: string;
        external: boolean;
    }>();
    for (const entry of await readdir(server.stacksDir, { withFileTypes: true })) {
        if (entry.isDirectory() && await Stack.composeFileExists(server.stacksDir, entry.name)) {
            result.set(entry.name, { name: entry.name,
                external: false });
        }
    }
    for (const registration of await server.externalStacks.list()) {
        if (!result.has(registration.project)) {
            result.set(registration.project, { name: registration.name,
                external: true });
        }
    }
    // Compose's project name can differ from the directory/name shown by Enhanced.
    const projects = JSON.parse(await docker([ "compose", "ls", "--all", "--format", "json" ]));
    for (const project of projects) {
        const name = getManagedStackNameFromConfigFiles(project.ConfigFiles, server.stacksDir);
        if (name && result.get(name)?.external === false) {
            result.set(project.Name, { name,
                external: false });
        }
    }
    return result;
}
export async function collectTopology(names: Map<string, {
    name: string;
    external: boolean;
}>, run: TopologyRunner = docker): Promise<TopologySnapshot> {
    let unavailable = 0;
    const started = Date.now();
    const read = async (kind: "container" | "network", ids: string[], format: string): Promise<InspectedTopologyRow[]> => {
        if (!ids.length) {
            return [];
        }
        if (Date.now() - started > 30000) {
            unavailable += ids.length;
            return [];
        }
        try {
            return (await run([ kind, "inspect", "--format", format, ...ids ])).trim().split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
        } catch {
            // A container/network can disappear between listing and inspection; retry only this bounded batch.
            if (ids.length === 1) {
                unavailable++;
                return [];
            }
            const rows: InspectedTopologyRow[] = [];
            for (const id of ids) {
                rows.push(...await read(kind, [ id ], format));
            }
            return rows;
        }
    };
    const containers: TopologyContainer[] = [];
    const ids = (await run([ "ps", "-aq", "--no-trunc" ])).trim().split(/\s+/).filter(Boolean);
    for (let i = 0; i < ids.length; i += 16) {
        for (const c of await read("container", ids.slice(i, i + 16), topologyContainerFormat.slice(0, -1) + ",\"pid\":{{json .State.Pid}},\"routes\":" + topologyRouteLabelsFormat + "}")) {
            const project = String(c.project || "");
            const entry = names.get(project);
            containers.push({ id: String(c.id),
                routes: topologyRoutes(c.routes || {}),
                name: String(c.name).replace(/^\//, ""),
                stack: entry?.name || project,
                service: String(c.service || ""),
                external: entry?.external ?? true,
                state: String(c.state),
                mode: String(c.mode),
                networks: Object.entries(c.networks || {}).map(([ name, value ]) => ({ name,
                    ip: String(value.IPAddress || "") })),
                ports: Object.entries(c.ports || {}).flatMap(([ target, bindings ]) => (Array.isArray(bindings) ? bindings : []).map(binding => ({
                    address: String(binding.HostIp || ""),
                    published: Number(binding.HostPort),
                    target: Number(target.split("/")[0]),
                    protocol: target.split("/")[1] || "tcp",
                }))).filter(p => Number.isInteger(p.published) && p.published > 0 && p.published <= 65535),
            });
            if (c.mode === "host" && c.state === "running") {
                const container = containers[containers.length - 1];
                const ports = Date.now() - started < 30000 ? await hostContainerPorts(String(c.id), Number(c.pid)) : null;
                container.hostPorts = ports === null ? "unavailable" : "attributed";
                container.ports = ports || [];
            }
        }
    }
    const networkIds = (await run([ "network", "ls", "-q", "--no-trunc" ])).trim().split(/\s+/).filter(Boolean);
    const networks: TopologySnapshot["networks"] = [];
    for (let i = 0; i < networkIds.length; i += 16) {
        for (const n of await read("network", networkIds.slice(i, i + 16), networkFormat)) {
            networks.push({ name: String(n.name),
                driver: String(n.driver),
                internal: n.internal === true,
                subnets: (Array.isArray(n.subnets) ? n.subnets : []).map((s: {
                    Subnet?: string;
                }) => s.Subnet || "").filter(Boolean) });
        }
    }
    return { capturedAt: new Date().toISOString(),
        containers,
        networks,
        unavailable,
        primaryHostname: "",
        portLinkAddressMode: "hostname",
        portLinkIp: "" };
}
export class TopologyCache {
    private cached?: TopologySnapshot;
    private pending?: Promise<TopologySnapshot>;
    constructor(private collect: () => Promise<TopologySnapshot>) { }
    get(): Promise<TopologySnapshot> {
        if (this.cached && Date.now() - Date.parse(this.cached.capturedAt) < 10000) {
            return Promise.resolve(this.cached);
        }
        if (!this.pending) {
            this.pending = this.collect().then(snapshot => {
                this.cached = snapshot;
                return snapshot;
            }).finally(() => {
                this.pending = undefined;
            });
        }
        return this.pending;
    }
}
