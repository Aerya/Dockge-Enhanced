/**
 * useStackStats — Composable Vue 3 qui poll les stats CPU/RAM par stack.
 * Pattern identique à useImageStatus : singleton global, start/stop auto.
 *
 * Export additionnel : `stackStatsEnabled` (ref<boolean>) pour le toggle UI.
 */

import { ref, onMounted, onUnmounted } from "vue";

export interface StackStat {
    cpu:     number; // % cumulé (ex: 1.5)
    memUsed: number; // bytes
}

// ─── État global partagé ─────────────────────────────────────────

const statsCache   = ref<Record<string, StackStat>>({});
let pollTimer: ReturnType<typeof setInterval> | null = null;
let subscribers = 0;

/** Toggle persisté en localStorage — réactif pour tous les composants */
export const stackStatsEnabled = ref<boolean>(
    localStorage.getItem("stackStatsEnabled") === "true"
);

// ─── Fetch ───────────────────────────────────────────────────────

async function fetchStackStats(): Promise<void> {
    try {
        const token = localStorage.getItem("token") ?? "";
        const res = await fetch("/api/system/stack-stats", {
            headers: token ? { "Authorization": `Bearer ${token}` } : {},
        });
        if (res.status === 401) return;
        const json = await res.json();
        if (json.ok) statsCache.value = json.data;
    } catch {
        // Silencieux — docker ou réseau indisponible
    }
}

// ─── Composable ──────────────────────────────────────────────────

export function useStackStats() {
    onMounted(() => {
        subscribers++;
        if (subscribers === 1) {
            fetchStackStats();
            pollTimer = setInterval(fetchStackStats, 10000);
        }
    });

    onUnmounted(() => {
        subscribers--;
        if (subscribers === 0 && pollTimer) {
            clearInterval(pollTimer);
            pollTimer = null;
        }
    });

    return { statsCache };
}

// ─── Helper format mémoire ───────────────────────────────────────

export function formatMem(bytes: number): string {
    if (bytes >= 1024 ** 3) return (bytes / 1024 ** 3).toFixed(1) + " GB";
    if (bytes >= 1024 ** 2) return Math.round(bytes / 1024 ** 2) + " MB";
    if (bytes >= 1024)      return Math.round(bytes / 1024) + " KB";
    return bytes + " B";
}
