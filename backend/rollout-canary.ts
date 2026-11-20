import { randomUUID } from "node:crypto";
export interface CanaryState { id: string;
    percent: number;
    mode: string;
    ready: boolean;
    decision?: "promote" | "abort" }
const canaries = new Map<string, CanaryState>();
const key = (directory: string, service: string) => directory + "\0" + service;
export function canaryState(directory: string, service: string): CanaryState | undefined {
    const state = canaries.get(key(directory, service));
    return state ? { ...state } : undefined;
}
export function decideCanary(directory: string, service: string, id: string, decision: "promote" | "abort"): void {
    const state = canaries.get(key(directory, service));
    if (!state || state.id !== id || ![ "promote", "abort" ].includes(decision) || (decision === "promote" && (!state.ready || state.mode !== "manual"))) {
        throw new Error("Canary decision is stale or unavailable");
    }
    state.decision = decision;
}
/** Hold the existing update reservation; restart recovery sees an uncommitted preparing journal. */
export async function runCanary(directory: string, service: string, mode: string,
    route: (percent: number) => Promise<void>, healthy: () => Promise<boolean>, wait: (ms: number) => Promise<void>, attempts = 900): Promise<void> {
    const identity = key(directory, service);
    if (canaries.has(identity)) {
        throw new Error("Canary already active");
    }
    const state: CanaryState = { id: randomUUID(),
        percent: 0,
        mode,
        ready: false };
    canaries.set(identity, state);
    try {
        for (const percent of [ 10, 25, 50 ]) {
            if (!await healthy()) {
                throw new Error("Canary health check failed");
            }
            state.percent = percent;
            state.ready = false;
            state.id = randomUUID();
            delete state.decision;
            await route(percent);
            let promoted = false;
            for (let attempt = 0; attempt < attempts; attempt++) {
                await wait(2000);
                if (state.decision === "abort" || !await healthy()) {
                    throw new Error("Canary cancelled or unhealthy");
                }
                // Every stage observes at least 30 seconds of healthy replicas.
                state.ready = attempt >= 14;
                if (state.ready && (mode === "automatic" || state.decision === "promote")) {
                    promoted = true;
                    break;
                }
            }
            if (!promoted) {
                throw new Error("Canary promotion timeout");
            }
        }
    } finally {
        canaries.delete(identity);
    }
}
