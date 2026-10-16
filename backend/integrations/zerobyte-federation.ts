/** Read-only summaries travel through the existing authenticated federation transport. */
import { AgentManager } from "../agent-manager";
import { Agent } from "../models/agent";
import { DockgeServer } from "../dockge-server";
import { zerobyte } from "./zerobyte-manager";
import { workflowsFor } from "./zerobyte-workflows";

export interface ZerobyteSummary {
    enabled: boolean;
    reachable: boolean;
    jobs: number;
    failedJobs: number;
    activeTasks: number;
    workflowAlerts: number;
}
export async function localZerobyteSummary(server: DockgeServer): Promise<ZerobyteSummary> {
    const config = await zerobyte.getSafeConfig();
    const result = { enabled: config.enabled,
        reachable: false,
        jobs: 0,
        failedJobs: 0,
        activeTasks: 0,
        workflowAlerts: 0 };
    if (!config.enabled) {
        return result;
    }
    const status = await workflowsFor(server).status();
    result.workflowAlerts = status.events.filter(e => e.state === "failure").length;
    try {
        const overview = await zerobyte.overview(false);
        result.reachable = true;
        result.jobs = overview.jobs.length;
        result.failedJobs = overview.jobs.filter(j => j.lastBackupStatus === "error").length;
        result.activeTasks = overview.tasks.length;
    } catch { /* A failed remote connection is never presented as a healthy empty inventory. */ }
    return result;
}
export function sanitizeZerobyteSummary(value: unknown): ZerobyteSummary {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new Error("Unsupported peer summary");
    }
    const input = value as Record<string, unknown>;
    if (typeof input.enabled !== "boolean" || typeof input.reachable !== "boolean") {
        throw new Error("Unsupported peer state");
    }
    const result = { enabled: input.enabled === true,
        reachable: input.reachable === true } as ZerobyteSummary;
    for (const key of [ "jobs", "failedJobs", "activeTasks", "workflowAlerts" ] as const) {
        if (!Number.isSafeInteger(input[key]) || Number(input[key]) < 0) {
            throw new Error("Invalid peer summary");
        }
        result[key] = Number(input[key]);
    }
    return result;
}
export class ZerobytePeerError extends Error {
    constructor(public code: "authentication" | "offline" | "timeout" | "incompatible") {
        super(code);
    }
}
export async function collectZerobytePeers(
    peers: Array<{ endpoint: string;
        name: string }>,
    request: (endpoint: string) => Promise<unknown>,
) {
    return Promise.all(peers.slice(0, 100).map(async peer => {
        try {
            return { ...peer,
                online: true,
                summary: sanitizeZerobyteSummary(await request(peer.endpoint)),
                errorCode: null };
        } catch (error) {
            return { ...peer,
                online: false,
                summary: null,
                errorCode: error instanceof ZerobytePeerError ? error.code : "incompatible" };
        }
    }));
}
export async function federatedZerobyteOverview(server: DockgeServer) {
    const agents = await Agent.getAgentList();
    const transport = new AgentManager();
    const peers = Object.entries(agents).map(([ endpoint, agent ]) => ({ endpoint,
        name: String(agent.display_name || endpoint).slice(0, 100) }));
    const remote = await collectZerobytePeers(peers, async endpoint => {
        const failure = AgentManager.connectionFailure(endpoint);
        if (failure) {
            throw new ZerobytePeerError(failure);
        }
        let timeout: NodeJS.Timeout | undefined;
        const response = await Promise.race([
            transport.requestEndpoint<{ ok: boolean;
                data?: unknown }>(endpoint, "getZerobyteSummary"),
            new Promise<never>((_resolve, reject) => {
                timeout = setTimeout(() => reject(new ZerobytePeerError("timeout")), 8000);
            }),
        ]).finally(() => {
            if (timeout) {
                clearTimeout(timeout);
            }
        });
        if (!response.ok) {
            throw new ZerobytePeerError("incompatible");
        }
        return response.data;
    });
    return [{ endpoint: "local",
        name: "local",
        online: true,
        errorCode: null,
        summary: await localZerobyteSummary(server) }, ...remote ];
}
