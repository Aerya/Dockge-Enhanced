import { Agent } from "./models/agent";
import { agentConnectionOptions } from "./agent-connection-options";
import { callPeer, normalizeMeshPeer } from "./agent-mesh";

export function shareTargets(agents: Record<string, Agent>, source: string, targets: unknown, confirmed: unknown): string[] {
    if (confirmed !== true || !Array.isArray(targets) || targets.length < 1 || targets.length > 16) {
        throw new Error("agentShare.confirmRequired");
    }
    if (!Object.hasOwn(agents, source) || !agents[source].oneWay || agents[source].url.startsWith("reverse://")) {
        throw new Error("agentShare.invalidSource");
    }
    const unique = new Set<string>();
    for (const target of targets) {
        if (typeof target !== "string" || !target || target === source || !Object.hasOwn(agents, target)
            || agents[target].oneWay || agents[target].url.startsWith("reverse://") || unique.has(target)) {
            throw new Error("agentShare.invalidTarget");
        }
        unique.add(target);
    }
    return [ ...unique ];
}

export function sharedConnection(value: unknown) {
    const peer = normalizeMeshPeer(value);
    const options = agentConnectionOptions(peer.url, (value as Record<string, unknown>).connectionOptions);
    if (!options.oneWay) {
        throw new Error("agentShare.invalidSource");
    }
    return { ...peer,
        connectionOptions: JSON.stringify(options) };
}

// Copy only to explicitly selected existing peers. No discovery, return link,
// catalogue replacement, or recursive propagation of proxy credentials.
export async function shareAgentConnection(source: unknown, targets: unknown, confirmed: unknown, dependencies = { getAgents: () => Agent.getAgentList(),
    callPeer }) {
    const agents = await dependencies.getAgents();
    if (typeof source !== "string") {
        throw new Error("agentShare.invalidSource");
    }
    const selected = shareTargets(agents, source, targets, confirmed);
    const agent = agents[source];
    const payload = sharedConnection({ url: agent.url,
        username: agent.username,
        password: agent.password,
        displayName: agent.display_name || "",
        connectionOptions: agent.connection_options });
    const results: { endpoint: string;
        ok: boolean;
        message: string }[] = [];
    for (const endpoint of selected) {
        const recipient = agents[endpoint];
        const peer = { url: recipient.url,
            username: recipient.username,
            password: recipient.password,
            displayName: recipient.display_name || "" };
        try {
            const capability = await dependencies.callPeer<{ version: number }>(peer, "getAgentConnectionShareCapabilities", {});
            if (capability.version !== 1) {
                results.push({ endpoint,
                    ok: false,
                    message: "agentShare.unsupported" });
                continue;
            }
            await dependencies.callPeer(peer, "receiveAgentConnection", payload);
            results.push({ endpoint,
                ok: true,
                message: "agentShare.success" });
        } catch {
            // Never return remote exception text: it may contain credentials.
            results.push({ endpoint,
                ok: false,
                message: "agentShare.failed" });
        }
    }
    return results;
}
