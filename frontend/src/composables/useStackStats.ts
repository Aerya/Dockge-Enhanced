import { computed, onMounted, onUnmounted, ref, type ComputedRef } from "vue";
import { setLowPower, POLL, makePoller, type Poller } from "./useLowPower";

export interface StackStat { cpu: number;
    memUsed: number; }
type AgentEmitter = (endpoint: string, eventName: string, ...args: unknown[]) => void;
type StackStatsResponse = {
    ok?: boolean;
    enabled?: boolean;
    data?: Record<string, StackStat>;
    containerData?: Record<string, StackStat>;
    lowPowerMode?: boolean;
    available?: boolean;
};

export const statsByEndpoint = ref<Record<string, Record<string, StackStat>>>({});
const containerStatsByEndpoint = ref<Record<string, Record<string, StackStat>>>({});
const enabledByEndpoint = ref<Record<string, boolean>>({});
const pollers = new Map<string, Poller>();
const subscriberCounts = new Map<string, number>();
const emitters = new Map<string, AgentEmitter>();

export const stackStatsEnabled = ref(false);

function applySnapshot(endpoint: string, response: StackStatsResponse): void {
    const key = endpoint || "";
    const enabled = response.enabled === true;
    enabledByEndpoint.value = { ...enabledByEndpoint.value,
        [key]: enabled };
    const available = enabled && response.available !== false;
    statsByEndpoint.value = { ...statsByEndpoint.value,
        [key]: available ? (response.data ?? {}) : {} };
    containerStatsByEndpoint.value = { ...containerStatsByEndpoint.value,
        [key]: available ? (response.containerData ?? {}) : {} };
    if (!key) {
        stackStatsEnabled.value = enabled;
    }
    if (typeof response.lowPowerMode === "boolean") {
        setLowPower(response.lowPowerMode);
    }
}

async function fetchLocal(): Promise<void> {
    try {
        const token = localStorage.getItem("token") ?? sessionStorage.getItem("token") ?? "";
        const res = await fetch("/api/system/stack-stats", { headers: token ? { Authorization: `Bearer ${token}` } : {} });
        if (!res.ok) {
            throw new Error("Stack metrics unavailable");
        }
        const json = await res.json() as StackStatsResponse;
        if (!json.ok) {
            throw new Error("Stack metrics unavailable");
        }
        applySnapshot("", json);
    } catch {
        clearEndpointStats("");
    }
}

function clearEndpointStats(endpoint: string): void {
    statsByEndpoint.value = { ...statsByEndpoint.value,
        [endpoint]: {} };
    containerStatsByEndpoint.value = { ...containerStatsByEndpoint.value,
        [endpoint]: {} };
}

async function fetchRemote(endpoint: string): Promise<void> {
    const emit = emitters.get(endpoint);
    if (!emit) {
        return;
    }
    await new Promise<void>((resolve) => {
        let settled = false;
        const timer = window.setTimeout(() => {
            if (!settled) {
                settled = true; clearEndpointStats(endpoint); resolve();
            }
        }, 8000);
        emit(endpoint, "stackStatsGet", (response: StackStatsResponse) => {
            if (settled) {
                return;
            }
            settled = true;
            window.clearTimeout(timer);
            if (response?.ok) {
                applySnapshot(endpoint, response);
            } else {
                clearEndpointStats(endpoint);
            }
            resolve();
        });
    });
}

function fetchEndpoint(endpoint: string): Promise<void> {
    return endpoint ? fetchRemote(endpoint) : fetchLocal();
}
function startEndpoint(endpoint: string): void {
    if (pollers.has(endpoint)) {
        return;
    }
    const poller = makePoller({ fetch: () => fetchEndpoint(endpoint),
        interval: POLL.stack });
    pollers.set(endpoint, poller);
    poller.start();
}
function stopEndpoint(endpoint: string): void {
    pollers.get(endpoint)?.stop();
    pollers.delete(endpoint);
    if (endpoint) {
        emitters.delete(endpoint);
    }
}

export function useStackStats(endpoint = "", emitAgent?: AgentEmitter): {
    statsCache: ComputedRef<Record<string, StackStat>>;
    containerStatsCache: ComputedRef<Record<string, StackStat>>;
    stackStatsEnabled: ComputedRef<boolean>;
} {
    const key = endpoint || "";
    if (key && emitAgent) {
        emitters.set(key, emitAgent);
    }
    const statsCache = computed(() => statsByEndpoint.value[key] ?? {});
    const containerStatsCache = computed(() => containerStatsByEndpoint.value[key] ?? {});
    const endpointEnabled = computed(() => enabledByEndpoint.value[key] === true);

    onMounted(() => {
        const count = (subscriberCounts.get(key) ?? 0) + 1;
        subscriberCounts.set(key, count);
        if (count === 1) {
            startEndpoint(key);
        }
    });
    onUnmounted(() => {
        const count = Math.max(0, (subscriberCounts.get(key) ?? 1) - 1);
        if (count === 0) {
            subscriberCounts.delete(key); stopEndpoint(key);
        } else {
            subscriberCounts.set(key, count);
        }
    });
    return { statsCache,
        containerStatsCache,
        stackStatsEnabled: endpointEnabled };
}

export function formatMem(bytes: number): string {
    if (bytes >= 1024 ** 3) {
        return (bytes / 1024 ** 3).toFixed(1) + " GiB";
    }
    if (bytes >= 1024 ** 2) {
        return Math.round(bytes / 1024 ** 2) + " MiB";
    }
    if (bytes >= 1024) {
        return Math.round(bytes / 1024) + " KiB";
    }
    return bytes + " B";
}
