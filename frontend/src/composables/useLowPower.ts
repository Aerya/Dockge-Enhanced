/**
 * useLowPower — Mode Synology / faible consommation, côté frontend.
 *
 * Flag réactif partagé par toute l'app. Sa valeur est apprise depuis les
 * réponses backend déjà pollées (system stats, stack stats, serviceStatusList)
 * via setLowPower(), et persistée en localStorage pour que la cadence lente
 * s'applique dès le premier chargement (utile sur NAS).
 *
 * Fournit :
 *  - POLL.*   : intervalles de polling (ms) dérivés du mode
 *  - makePoller : un poller auto-replanifié, qui se met en PAUSE quand l'onglet
 *                 est caché (document.hidden) et reprend au retour.
 */

import { ref } from "vue";

const STORAGE_KEY = "lowPowerMode";

export const lowPowerMode = ref<boolean>(
    localStorage.getItem(STORAGE_KEY) === "true"
);

/** Met à jour le flag depuis une réponse backend (idempotent). */
export function setLowPower(v: unknown): void {
    const b = v === true;
    if (lowPowerMode.value !== b) {
        lowPowerMode.value = b;
        try { localStorage.setItem(STORAGE_KEY, b ? "true" : "false"); } catch { /* ignore */ }
    }
}

/** Intervalles de polling frontend (ms), selon le mode. */
export const POLL = {
    system:   (): number => (lowPowerMode.value ? 30_000 : 5_000),
    stack:    (): number => (lowPowerMode.value ? 60_000 : 10_000),
    image:    (): number => (lowPowerMode.value ? 30_000 : 15_000),
    overview: (): number => (lowPowerMode.value ? 60_000 : 30_000),
    service:  (): number => (lowPowerMode.value ? 30_000 : 5_000),
};

/** true si l'onglet est visible (toujours true hors contexte navigateur). */
export function isVisible(): boolean {
    return typeof document === "undefined" || document.visibilityState !== "hidden";
}

export interface Poller {
    start(): void;
    stop(): void;
}

/**
 * Poller auto-replanifié et visibility-aware.
 *  - ne fetch jamais quand l'onglet est caché (pause)
 *  - relit `interval()` à chaque cycle → un changement de mode s'applique à chaud
 *  - refetch immédiat au retour de visibilité
 */
export function makePoller(opts: {
    fetch: () => Promise<void> | void;
    interval: () => number;
}): Poller {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let running = false;

    const clear = () => {
        if (timer) { clearTimeout(timer); timer = null; }
    };

    const tick = async () => {
        if (!running) return;
        if (!isVisible()) return; // suspendu — reprise via visibilitychange
        try { await opts.fetch(); } catch { /* silencieux */ }
        if (!running || !isVisible()) return;
        clear();
        timer = setTimeout(tick, opts.interval());
    };

    const onVisibility = () => {
        if (!running) return;
        if (isVisible()) {
            clear();
            void tick(); // refetch immédiat + reprise
        } else {
            clear(); // pause
        }
    };

    return {
        start() {
            if (running) return;
            running = true;
            if (typeof document !== "undefined") {
                document.addEventListener("visibilitychange", onVisibility);
            }
            void tick();
        },
        stop() {
            running = false;
            clear();
            if (typeof document !== "undefined") {
                document.removeEventListener("visibilitychange", onVisibility);
            }
        },
    };
}
