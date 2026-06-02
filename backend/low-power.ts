/**
 * low-power.ts — Mode Synology / faible consommation.
 *
 * Source unique de vérité : le flag `lowPowerMode` des settings Monitoring
 * (persistés dans monitoring-settings.json, tenus en mémoire par le singleton
 * MonitoringWatcher). Ce module ne fait que lire ce flag et en dériver les
 * intervalles de collecte côté backend.
 *
 * Tout est lu DYNAMIQUEMENT (à chaque appel) : basculer le mode dans l'UI
 * s'applique sans redémarrage du serveur.
 */

import { MonitoringWatcher } from "./watchers/monitoring-watcher";

export function isLowPower(): boolean {
    try {
        return MonitoringWatcher.getInstance().settings.lowPowerMode === true;
    } catch {
        return false;
    }
}

export interface PollIntervals {
    /** Échantillonnage CPU via /proc/stat (ms) */
    cpuSample: number;
    /** Collecte `docker stats` + `docker ps` agrégée par stack (ms) */
    stackStats: number;
    /** TTL du cache de `getServiceStatusList` (docker compose ps + inspect) (ms) */
    serviceStatusTtl: number;
}

const NORMAL: PollIntervals = {
    cpuSample:        3_000,
    stackStats:       10_000,
    serviceStatusTtl: 4_000,
};

const LOW_POWER: PollIntervals = {
    cpuSample:        15_000,
    stackStats:       60_000,
    serviceStatusTtl: 25_000,
};

export function intervals(): PollIntervals {
    return isLowPower() ? LOW_POWER : NORMAL;
}
