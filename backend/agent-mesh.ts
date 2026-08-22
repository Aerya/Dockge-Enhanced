import { io, Socket as SocketClient } from "socket.io-client";
import { Agent } from "./models/agent";
import { R } from "redbean-node";
import { AGENT_TOKEN_USERNAME, loginAgentClient } from "./agent-manager";

export interface AgentMeshPeer {
    url: string;
    username: string;
    password: string;
    displayName: string;
}

export interface AgentMeshSelf {
    url: string;
    token: string;
    displayName: string;
}

const RPC_TIMEOUT = 15_000;

export function normalizeMeshPeer(value: unknown): AgentMeshPeer {
    if (!value || typeof value !== "object") {
        throw new Error("Mesh peer must be an object");
    }
    const raw = value as Record<string, unknown>;
    const url = typeof raw.url === "string" ? raw.url.trim().replace(/\/$/, "") : "";
    const username = typeof raw.username === "string" ? raw.username.trim() : "";
    const password = typeof raw.password === "string" ? raw.password : "";
    const displayName = typeof raw.displayName === "string" ? raw.displayName.trim() : "";
    let parsed: URL;
    try {
        parsed = new URL(url);
    } catch {
        throw new Error("Invalid mesh peer URL");
    }
    if (![ "http:", "https:" ].includes(parsed.protocol) || !parsed.host) {
        throw new Error("Mesh peer URL must use HTTP or HTTPS");
    }
    if (!username || !password) {
        throw new Error("Mesh peer credentials are required");
    }
    if (displayName.length > 100) {
        throw new Error("Display name must not exceed 100 characters");
    }
    return { url,
        username,
        password,
        displayName };
}

export function meshEndpoint(peer: AgentMeshPeer): string {
    return new URL(peer.url).host;
}

export function validateMeshPeers(values: unknown[]): AgentMeshPeer[] {
    if (!Array.isArray(values) || values.length < 1) {
        throw new Error("At least one mesh peer is required");
    }
    const peers = values.map(normalizeMeshPeer);
    const endpoints = new Set<string>();
    for (const peer of peers) {
        const endpoint = meshEndpoint(peer);
        if (endpoints.has(endpoint)) {
            throw new Error(`Duplicate mesh endpoint: ${endpoint}`);
        }
        endpoints.add(endpoint);
    }
    return peers;
}

export function normalizeMeshSelf(value: unknown): AgentMeshPeer {
    if (!value || typeof value !== "object") {
        throw new Error("Current instance data is required");
    }
    const raw = value as Record<string, unknown>;
    return normalizeMeshPeer({
        url: raw.url,
        username: AGENT_TOKEN_USERNAME,
        password: raw.token,
        displayName: raw.displayName,
    });
}

export function validateMeshCatalogue(values: unknown[]): AgentMeshPeer[] {
    if (!Array.isArray(values)) {
        throw new Error("Mesh catalogue must be an array");
    }
    if (values.length === 0) {
        return [];
    }
    return validateMeshPeers(values);
}

export function peersForTarget(peers: AgentMeshPeer[], targetEndpoint: string): AgentMeshPeer[] {
    return peers.filter((peer) => meshEndpoint(peer) !== targetEndpoint);
}

export async function localMeshPeers(self: AgentMeshPeer): Promise<AgentMeshPeer[]> {
    const agents = await Agent.getAgentList();
    const peers = validateMeshPeers([
        self,
        ...Object.values(agents).map((agent) => ({
            url: agent.url,
            username: agent.username,
            password: agent.password,
            displayName: agent.display_name || "",
        })),
    ]);
    if (peers.length < 2) {
        throw new Error("Add at least one remote agent before synchronizing the mesh");
    }
    return peers;
}

export async function upsertMeshPeers(peers: AgentMeshPeer[], ownEndpoint: string): Promise<void> {
    const existingAgents = Object.values(await Agent.getAgentList());
    const existingByEndpoint = new Map(existingAgents.map((agent) => [ agent.endpoint, agent ]));
    const desiredEndpoints = new Set(peers.map(meshEndpoint).filter((endpoint) => endpoint !== ownEndpoint));
    for (const peer of peers) {
        const endpoint = meshEndpoint(peer);
        if (endpoint === ownEndpoint) {
            continue;
        }
        const bean = existingByEndpoint.get(endpoint) ?? R.dispense("agent") as Agent;
        bean.url = peer.url;
        bean.username = peer.username;
        bean.password = peer.password;
        bean.display_name = peer.displayName;
        await R.store(bean);
    }
    for (const agent of existingAgents) {
        if (!desiredEndpoints.has(agent.endpoint)) {
            await R.trash(agent);
        }
    }
}

function callPeer<T>(peer: AgentMeshPeer, event: string, payload: unknown): Promise<T> {
    return new Promise((resolve, reject) => {
        let settled = false;
        const endpoint = meshEndpoint(peer);
        const client: SocketClient = io(peer.url, {
            reconnection: false,
            timeout: RPC_TIMEOUT,
            extraHeaders: { endpoint },
        });
        const finish = (error?: Error, result?: T) => {
            if (settled) {
                return;
            }
            settled = true;
            clearTimeout(timer);
            client.disconnect();
            if (error) {
                reject(error);
            } else {
                resolve(result as T);
            }
        };
        const timer = setTimeout(() => finish(new Error(`${endpoint}: mesh synchronization timed out`)), RPC_TIMEOUT);
        client.on("connect_error", (error) => finish(error));
        client.on("connect", () => {
            loginAgentClient(client, peer.username, peer.password, (login: { ok?: boolean; msg?: string }) => {
                if (!login?.ok) {
                    finish(new Error(login?.msg || `${endpoint}: login failed`));
                    return;
                }
                client.emit(event, payload, (response: T & { ok?: boolean; msg?: string }) => {
                    if (!response?.ok) {
                        finish(new Error(response?.msg || `${endpoint}: synchronization failed`));
                    } else {
                        finish(undefined, response);
                    }
                });
            });
        });
    });
}

async function exchangePeerCredential(peer: AgentMeshPeer): Promise<AgentMeshPeer> {
    const response = await callPeer<{ token?: string }>(peer, "createAgentFederationToken", {});
    if (typeof response.token !== "string" || response.token === "") {
        throw new Error(`${meshEndpoint(peer)}: federation token was not issued`);
    }
    return {
        ...peer,
        username: AGENT_TOKEN_USERNAME,
        password: response.token,
    };
}

export async function synchronizeAgentMesh(self: AgentMeshPeer, removedEndpoint = ""): Promise<string[]> {
    const currentPeers = await localMeshPeers(self);
    const selfEndpoint = meshEndpoint(self);
    // Exchange every still-valid legacy session or direct credential for a
    // dedicated federation token before any catalogue is changed.
    const peers = await Promise.all(currentPeers.map((peer) => meshEndpoint(peer) === selfEndpoint
        ? peer
        : exchangePeerCredential(peer)));
    const desiredPeers = removedEndpoint ? peers.filter((peer) => meshEndpoint(peer) !== removedEndpoint) : peers;

    // Authenticate every destination before changing any catalogue.
    await Promise.all(peers
        .filter((peer) => meshEndpoint(peer) !== selfEndpoint)
        .map((peer) => callPeer(peer, "validateAgentMeshPeer", {})));

    for (const target of peers) {
        const endpoint = meshEndpoint(target);
        const catalogue = endpoint === removedEndpoint ? [] : peersForTarget(desiredPeers, endpoint);
        if (endpoint === selfEndpoint) {
            await upsertMeshPeers(catalogue, endpoint);
        } else {
            await callPeer(target, "applyAgentMesh", {
                peers: catalogue,
            });
        }
    }
    return desiredPeers.map(meshEndpoint);
}
