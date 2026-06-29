import { ref, computed, onMounted, onUnmounted } from "vue";
import { POLL, makePoller, type Poller } from "./useLowPower";

export interface ImageStatus {
    image: string;
    stack: string;
    localDigest: string;
    remoteDigest: string;
    hasUpdate: boolean;
    lastChecked: string;
    error?: string;
}

export type AutoUpdateMode = "off" | "ignored" | "immediate" | "scheduled";

export interface AutoUpdateStatus {
    mode: AutoUpdateMode;
    time: string;
    pending: boolean;
    updating: boolean;
}

interface AutoUpdateEntry {
    mode: Exclude<AutoUpdateMode, "off">;
    time?: string;
}

const statusCache = ref<ImageStatus[]>([]);
const autoUpdateConfig = ref<Record<string, AutoUpdateEntry>>({});
const pendingAutoUpdates = ref<string[]>([]);
const updatingImages = ref<string[]>([]);
let poller: Poller | null = null;
let subscribers = 0;

function authHeaders(json = false): Record<string, string> {
    const token = localStorage.getItem("token") ?? sessionStorage.getItem("token") ?? "";
    return {
        ...(token ? { "Authorization": `Bearer ${token}` } : {}),
        ...(json ? { "Content-Type": "application/json" } : {}),
    };
}

async function fetchStatus() {
    try {
        const [ statusRes, autoUpdateRes ] = await Promise.all([
            fetch("/api/watcher/image/status", { headers: authHeaders() }),
            fetch("/api/watcher/image/auto-update", { headers: authHeaders() }),
        ]);
        if (statusRes.status === 401 || autoUpdateRes.status === 401) {
            return;
        }

        const statusJson = await statusRes.json();
        if (statusJson.ok) {
            statusCache.value = statusJson.data;
        }

        const autoUpdateJson = await autoUpdateRes.json();
        if (autoUpdateJson.ok) {
            autoUpdateConfig.value = autoUpdateJson.data?.autoUpdateConfig ?? {};
            pendingAutoUpdates.value = autoUpdateJson.data?.pendingAutoUpdates ?? [];
            updatingImages.value = autoUpdateJson.data?.updatingImages ?? [];
        }
    } catch {
        // The watcher can be disabled or temporarily unavailable.
    }
}

export function useImageStatus() {
    onMounted(() => {
        subscribers++;
        if (subscribers === 1) {
            poller = makePoller({
                fetch: fetchStatus,
                interval: POLL.image,
            });
            poller.start();
        }
    });

    onUnmounted(() => {
        subscribers--;
        if (subscribers === 0 && poller) {
            poller.stop();
            poller = null;
        }
    });

    function statusForStack(stackName: string): ImageStatus[] {
        return statusCache.value.filter(s => s.stack === stackName);
    }

    function hasUpdates(stackName: string): boolean {
        return statusForStack(stackName).some(s => s.hasUpdate && !s.error);
    }

    function updateCount(stackName: string): number {
        return statusForStack(stackName).filter(s => s.hasUpdate && !s.error).length;
    }

    function hasErrors(stackName: string): boolean {
        return statusForStack(stackName).some(s => !!s.error);
    }

    const totalUpdates = computed(() =>
        statusCache.value.filter(s => s.hasUpdate && !s.error).length
    );

    function autoUpdateFor(stackName: string, image: string): AutoUpdateStatus {
        const key = `${stackName}::${image}`;
        const config = autoUpdateConfig.value[key];
        return {
            mode: config?.mode ?? "off",
            time: config?.time ?? "02:00",
            pending: pendingAutoUpdates.value.includes(key),
            updating: updatingImages.value.includes(key),
        };
    }

    async function setAutoUpdateMode(stackName: string, image: string, mode: AutoUpdateMode, time?: string) {
        const key = `${stackName}::${image}`;
        try {
            const res = await fetch("/api/watcher/image/auto-update", {
                method: "POST",
                headers: authHeaders(true),
                body: JSON.stringify({
                    key,
                    mode,
                    ...(mode === "scheduled" ? { time: time ?? "02:00" } : {}),
                }),
            });
            const json = await res.json();
            if (!res.ok || !json.ok) {
                return {
                    ok: false,
                    message: json.message ?? res.statusText,
                };
            }

            pendingAutoUpdates.value = pendingAutoUpdates.value.filter(item => item !== key);
            if (mode === "off") {
                delete autoUpdateConfig.value[key];
            } else {
                autoUpdateConfig.value[key] = mode === "scheduled"
                    ? {
                        mode,
                        time: time ?? "02:00",
                    }
                    : { mode };
            }
            return { ok: true };
        } catch (error) {
            return {
                ok: false,
                message: error instanceof Error ? error.message : String(error),
            };
        }
    }

    return {
        statusCache,
        statusForStack,
        hasUpdates,
        updateCount,
        hasErrors,
        totalUpdates,
        autoUpdateFor,
        setAutoUpdateMode,
    };
}
