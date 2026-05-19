/**
 * AutoPruneManager — purge planifiée des images Docker.
 *
 * Deux modes indépendants :
 *  - Orphelines (dangling)  : images sans tag — `docker image prune -f`, sans exclusion.
 *  - Inutilisées (unused)   : images taguées mais sans conteneur actif — suppression
 *                             individuelle avec liste d'exclusion par repo:tag.
 *
 * Vérification quotidienne à 3h UTC pour chaque mode activé.
 * Persistance : DATA_DIR/auto-prune-settings.json
 */

import path from "path";
import * as fs from "node:fs";
import { exec } from "child_process";
import { promisify } from "util";
import { Cron } from "croner";
import { log } from "../log";

const execAsync   = promisify(exec);
const DATA_DIR    = process.env.DOCKGE_DATA_DIR ?? "/opt/dockge/data";
const SETTINGS_PATH = path.join(DATA_DIR, "auto-prune-settings.json");

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AutoPruneSettings {
    // Mode orphelines (dangling)
    danglingEnabled:       boolean;
    danglingIntervalHours: 24 | 48 | 168;
    lastDanglingRun?:      string;
    lastDanglingResult?:   string;

    // Mode inutilisées (unused tagged)
    unusedEnabled:         boolean;
    unusedIntervalHours:   24 | 48 | 168;
    unusedExclusions:      string[];  // repo:tag (ex: "nginx:latest")
    lastUnusedRun?:        string;
    lastUnusedResult?:     string;
}

export interface PruneResult {
    removed: string[];
    skipped: string[];
    errors:  string[];
    summary: string;
}

// ─── Defaults ─────────────────────────────────────────────────────────────────

const DEFAULTS: AutoPruneSettings = {
    danglingEnabled:       false,
    danglingIntervalHours: 24,
    unusedEnabled:         false,
    unusedIntervalHours:   168,
    unusedExclusions:      [],
};

// ─── Helpers Docker ───────────────────────────────────────────────────────────

async function dockerJsonLines(cmd: string): Promise<Record<string, string>[]> {
    try {
        const { stdout } = await execAsync(cmd, { maxBuffer: 10 * 1024 * 1024 });
        return (stdout || "").trim().split("\n").filter(l => l.trim())
            .map(l => { try { return JSON.parse(l); } catch { return null; } })
            .filter(Boolean) as Record<string, string>[];
    } catch { return []; }
}

// ─── Manager ──────────────────────────────────────────────────────────────────

export class AutoPruneManager {
    private static _instance: AutoPruneManager;
    private settings: AutoPruneSettings = { ...DEFAULTS };
    private danglingCron: Cron | null = null;
    private unusedCron:   Cron | null = null;

    static getInstance(): AutoPruneManager {
        if (!AutoPruneManager._instance) {
            AutoPruneManager._instance = new AutoPruneManager();
        }
        return AutoPruneManager._instance;
    }

    // ── Démarrage ─────────────────────────────────────────────────────────────

    async startIfEnabled(): Promise<void> {
        this.loadSettings();
        this.reschedule();
    }

    // ── Persistance ───────────────────────────────────────────────────────────

    private loadSettings(): void {
        try {
            const raw = fs.readFileSync(SETTINGS_PATH, "utf-8");
            this.settings = { ...DEFAULTS, ...JSON.parse(raw) };
        } catch {
            this.settings = { ...DEFAULTS };
        }
    }

    private saveSettings(): void {
        try {
            fs.mkdirSync(DATA_DIR, { recursive: true });
            fs.writeFileSync(SETTINGS_PATH, JSON.stringify(this.settings, null, 2), "utf-8");
        } catch (e) {
            log.error("AutoPruneManager", "Erreur sauvegarde : " + e);
        }
    }

    // ── Scheduling ────────────────────────────────────────────────────────────

    private reschedule(): void {
        // Dangling
        if (this.danglingCron) { this.danglingCron.stop(); this.danglingCron = null; }
        if (this.settings.danglingEnabled) {
            this.danglingCron = new Cron("0 3 * * *", async () => {
                if (!this.settings.danglingEnabled) return;
                if (this.settings.lastDanglingRun) {
                    const elapsed = Date.now() - new Date(this.settings.lastDanglingRun).getTime();
                    if (elapsed < this.settings.danglingIntervalHours * 3_600_000) return;
                }
                await this.runDanglingPrune();
            });
            log.info("AutoPruneManager", `Orphelines actif — intervalle ${this.settings.danglingIntervalHours}h`);
        }

        // Unused
        if (this.unusedCron) { this.unusedCron.stop(); this.unusedCron = null; }
        if (this.settings.unusedEnabled) {
            this.unusedCron = new Cron("0 3 * * *", async () => {
                if (!this.settings.unusedEnabled) return;
                if (this.settings.lastUnusedRun) {
                    const elapsed = Date.now() - new Date(this.settings.lastUnusedRun).getTime();
                    if (elapsed < this.settings.unusedIntervalHours * 3_600_000) return;
                }
                await this.runUnusedPrune();
            });
            log.info("AutoPruneManager", `Inutilisées actif — intervalle ${this.settings.unusedIntervalHours}h`);
        }
    }

    // ── Purge orphelines (dangling) ───────────────────────────────────────────

    async runDanglingPrune(): Promise<PruneResult> {
        try {
            const { stdout } = await execAsync("docker image prune -f", { maxBuffer: 2 * 1024 * 1024 });
            const summary = (stdout || "Aucune image supprimée").trim().split("\n").pop() ?? "OK";
            this.settings.lastDanglingRun    = new Date().toISOString();
            this.settings.lastDanglingResult = summary;
            this.saveSettings();
            log.info("AutoPruneManager", `Orphelines : ${summary}`);
            return { removed: [], skipped: [], errors: [], summary };
        } catch (e: any) {
            const summary = e.stderr ?? e.message ?? "Erreur";
            this.settings.lastDanglingRun    = new Date().toISOString();
            this.settings.lastDanglingResult = `Erreur : ${summary}`;
            this.saveSettings();
            return { removed: [], skipped: [], errors: [summary], summary };
        }
    }

    // ── Purge inutilisées (unused tagged) ────────────────────────────────────

    async runUnusedPrune(): Promise<PruneResult> {
        const removed: string[] = [];
        const skipped: string[] = [];
        const errors:  string[] = [];

        try {
            // Lister toutes les images taguées + tous les conteneurs (actifs ou non)
            const [allImgs, allCtrs] = await Promise.all([
                dockerJsonLines("docker images --format '{{json .}}'"),
                dockerJsonLines("docker ps -a --format '{{json .}}'"),
            ]);

            // Images utilisées par au moins un conteneur (par nom ou par ID)
            const usedRefs = new Set<string>();
            for (const c of allCtrs) {
                usedRefs.add(c["Image"] ?? "");
            }

            for (const img of allImgs) {
                const repo = img["Repository"] ?? "";
                const tag  = img["Tag"] ?? "";
                const id   = img["ID"] ?? "";

                // Ignorer les dangling (gérés par l'autre mode)
                if (repo === "<none>" || tag === "<none>") continue;

                const nameTag = `${repo}:${tag}`;

                // Vérifier si utilisée par un conteneur
                if (usedRefs.has(nameTag) || usedRefs.has(id) || usedRefs.has(repo)) continue;

                // Vérifier exclusion
                if (this.settings.unusedExclusions.includes(nameTag)) {
                    skipped.push(nameTag);
                    continue;
                }

                try {
                    await execAsync(`docker rmi ${id}`);
                    removed.push(nameTag);
                } catch (e: any) {
                    errors.push(`${nameTag}: ${(e.stderr ?? e.message ?? "erreur").split("\n")[0]}`);
                }
            }
        } catch (e: any) {
            errors.push(e.message ?? "Impossible de lister les images");
        }

        const summary = `${removed.length} supprimée(s), ${skipped.length} exclue(s)` +
            (errors.length > 0 ? `, ${errors.length} erreur(s)` : "");

        this.settings.lastUnusedRun    = new Date().toISOString();
        this.settings.lastUnusedResult = summary;
        this.saveSettings();
        log.info("AutoPruneManager", `Inutilisées : ${summary}`);
        return { removed, skipped, errors, summary };
    }

    // ── API publique ──────────────────────────────────────────────────────────

    getSettings(): AutoPruneSettings & { nextDanglingRun: string | null; nextUnusedRun: string | null } {
        return {
            ...this.settings,
            nextDanglingRun: this.nextRun(this.settings.lastDanglingRun, this.settings.danglingIntervalHours, this.settings.danglingEnabled),
            nextUnusedRun:   this.nextRun(this.settings.lastUnusedRun,   this.settings.unusedIntervalHours,   this.settings.unusedEnabled),
        };
    }

    async updateSettings(partial: Partial<AutoPruneSettings>): Promise<void> {
        this.settings = { ...this.settings, ...partial };
        this.saveSettings();
        this.reschedule();
    }

    addUnusedExclusion(nameTag: string): void {
        if (!this.settings.unusedExclusions.includes(nameTag)) {
            this.settings.unusedExclusions.push(nameTag);
            this.saveSettings();
        }
    }

    removeUnusedExclusion(nameTag: string): void {
        this.settings.unusedExclusions = this.settings.unusedExclusions.filter(e => e !== nameTag);
        this.saveSettings();
    }

    private nextRun(lastRun: string | undefined, intervalHours: number, enabled: boolean): string | null {
        if (!enabled) return null;
        if (!lastRun) {
            const next = new Date();
            next.setUTCHours(3, 0, 0, 0);
            if (next <= new Date()) next.setUTCDate(next.getUTCDate() + 1);
            return next.toISOString();
        }
        return new Date(new Date(lastRun).getTime() + intervalHours * 3_600_000).toISOString();
    }
}
