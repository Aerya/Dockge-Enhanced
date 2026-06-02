/**
 * useImageStatus — Composable Vue 3 qui poll l'état des images.
 * Utilisé par le badge à injecter dans la liste des stacks Dockge.
 * Fichier : frontend/src/composables/useImageStatus.ts
 */

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

// Cache global partagé entre tous les composants qui utilisent ce composable
const statusCache = ref<ImageStatus[]>([]);
let poller: Poller | null = null;
let subscribers = 0;

async function fetchStatus() {
    try {
        const token = localStorage.getItem("token") ?? sessionStorage.getItem("token") ?? "";
        const res = await fetch("/api/watcher/image/status", {
            headers: token ? { "Authorization": `Bearer ${token}` } : {},
        });
        if (res.status === 401) return; // non connecté, on ne pollue pas la console
        const json = await res.json();
        if (json.ok) statusCache.value = json.data;
    } catch {
        // Silencieux — le watcher est peut-être désactivé
    }
}

export function useImageStatus() {
    onMounted(() => {
        subscribers++;
        if (subscribers === 1) {
            // Premier abonné : démarre le polling (visibility-aware)
            poller = makePoller({ fetch: fetchStatus, interval: POLL.image });
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

    /** Retourne les statuts d'une stack donnée */
    function statusForStack(stackName: string): ImageStatus[] {
        return statusCache.value.filter(s => s.stack === stackName);
    }

    /** true si au moins une image de la stack a une mise à jour disponible */
    function hasUpdates(stackName: string): boolean {
        return statusForStack(stackName).some(s => s.hasUpdate && !s.error);
    }

    /** Nombre de mises à jour disponibles sur une stack */
    function updateCount(stackName: string): number {
        return statusForStack(stackName).filter(s => s.hasUpdate && !s.error).length;
    }

    /** true si au moins une image de la stack est en erreur de vérification */
    function hasErrors(stackName: string): boolean {
        return statusForStack(stackName).some(s => !!s.error);
    }

    const totalUpdates = computed(() =>
        statusCache.value.filter(s => s.hasUpdate && !s.error).length
    );

    return { statusCache, statusForStack, hasUpdates, updateCount, hasErrors, totalUpdates };
}
