/** Explicit, restart-required mode. Socket.IO still needs its HTTP transport. */
export function agentOnly(env = process.env): boolean {
    const value = env.DOCKGE_AGENT_ONLY ?? "0";
    if (![ "0", "1" ].includes(value)) {
        throw new Error("DOCKGE_AGENT_ONLY must be 0 or 1");
    }
    if (value === "1" && env.DOCKGE_HUB_ONLY === "1") {
        throw new Error("Agent-only and hub-only modes cannot be combined");
    }
    return value === "1";
}

export function requireAgentAuthentication(mode: string, needsSetup: boolean): void {
    if (agentOnly() && (mode !== "local" || needsSetup)) {
        throw new Error("Agent-only requires local authentication and an existing account or DOCKGE_BOOTSTRAP_USERNAME with DOCKGE_BOOTSTRAP_PASSWORD_FILE");
    }
}

export function requireInteractiveSelfUpdate(): void {
    if (agentOnly()) {
        throw new Error("Update the agent image through its hosting Compose; interactive self-update is disabled in agent-only mode");
    }
}
