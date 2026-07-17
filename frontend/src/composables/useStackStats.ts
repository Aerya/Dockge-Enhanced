/**
 * useStackStats — Composable Vue 3 qui poll les stats CPU/RAM par stack.
 * Pattern identique à useImageStatus : singleton global, start/stop auto.
 *
 * Export additionnel : `stackStatsEnabled` (ref<boolean>) pour le toggle UI.
 */

import { ref, onMounted, onUnmounted, watch } from "vue";
import { setLowPower, POLL, makePoller, type Poller } from "./useLowPower";

export interface StackStat {
    cpu:     number; // % cumulé (ex: 1.5)
    memUsed: number; // bytes
}

// ─── État global partagé ─────────────────────────────────────────

const statsCache   = ref<Record<string, StackStat>>({});
const containerStatsCache = ref<Record<string, StackStat>>({});
let poller: Poller | null = null;
let subscribers = 0;

/** Toggle persisté en localStorage — réactif pour tous les composants */
export const stackStatsEnabled = ref<boolean>(
    localStorage.getItem("stackStatsEnabled") === "true"
);

// Activation du badge → rafraîchit tout de suite (sinon il faudrait attendre
// le prochain tick du poller, jusqu'à 60 s en mode low-power).
watch(stackStatsEnabled, (on) => {
    if (on && subscribers > 0) void fetchStackStats();
});

// ─── Fetch ───────────────────────────────────────────────────────

async function fetchStackStats(): Promise<void> {
    // Si le badge stats est désactivé, inutile de solliciter docker
    if (!stackStatsEnabled.value) return;
    try {
        const token = localStorage.getItem("token") ?? sessionStorage.getItem("token") ?? "";
        const res = await fetch("/api/system/stack-stats", {
            headers: token ? { "Authorization": `Bearer ${token}` } : {},
        });
        if (res.status === 401) return;
        const json = await res.json();
        if (json.ok) {
            statsCache.value = json.data;
            containerStatsCache.value = json.containerData ?? {};
        }
        setLowPower(json.lowPowerMode);
    } catch {
        // Silencieux — docker ou réseau indisponible
    }
}

// ─── Composable ──────────────────────────────────────────────────

export function useStackStats() {
    onMounted(() => {
        subscribers++;
        if (subscribers === 1) {
            poller = makePoller({ fetch: fetchStackStats, interval: POLL.stack });
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

    return { statsCache, containerStatsCache };
}

// ─── Helper format mémoire ───────────────────────────────────────

export function formatMem(bytes: number): string {
    if (bytes >= 1024 ** 3) return (bytes / 1024 ** 3).toFixed(1) + " GB";
    if (bytes >= 1024 ** 2) return Math.round(bytes / 1024 ** 2) + " MB";
    if (bytes >= 1024)      return Math.round(bytes / 1024) + " KB";
    return bytes + " B";
}
