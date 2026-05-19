/**
 * AutoPruneManager — purge planifiée des images Docker orphelines (dangling).
 * Singleton. Paramètres persistés dans DATA_DIR/auto-prune-settings.json.
 *
 * Logique : vérification quotidienne à 3h UTC. Si (now - lastRun) >= intervalHours,
 * on liste les images dangling, on filtre les exclusions, on supprime le reste.
 */

import path from "path";
import * as fs from "node:fs";
import { exec } from "child_process";
import { promisify } from "util";
import { Cron } from "croner";
import { log } from "../log";

const execAsync = promisify(exec);
const DATA_DIR    = process.env.DOCKGE_DATA_DIR ?? "/opt/dockge/data";
const SETTINGS_PATH = path.join(DATA_DIR, "auto-prune-settings.json");

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AutoPruneSettings {
    enabled: boolean;
    intervalHours: 24 | 48 | 168;   // 168 = 7 jours
    exclusions: string[];            // IDs courts (12 chars) ou repo:tag
    lastRun?: string;                // ISO
    lastResult?: string;             // résumé lisible du dernier run
}

export interface PruneResult {
    removed: string[];
    skipped: string[];
    errors:  string[];
    summary: string;
}

// ─── Defaults ─────────────────────────────────────────────────────────────────

const DEFAULTS: AutoPruneSettings = {
    enabled: false,
    intervalHours: 24,
    exclusions: [],
};

// ─── Manager ──────────────────────────────────────────────────────────────────

export class AutoPruneManager {
    private static _instance: AutoPruneManager;
    private settings: AutoPruneSettings = { ...DEFAULTS };
    private cronJob: Cron | null = null;

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
        if (this.cronJob) {
            this.cronJob.stop();
            this.cronJob = null;
        }
        if (!this.settings.enabled) return;

        // Vérification quotidienne à 3h UTC — on compare avec lastRun + intervalHours
        this.cronJob = new Cron("0 3 * * *", async () => {
            if (!this.settings.enabled) return;
            if (this.settings.lastRun) {
                const elapsed = Date.now() - new Date(this.settings.lastRun).getTime();
                if (elapsed < this.settings.intervalHours * 3_600_000) return;
            }
            await this.runPrune();
        });

        log.info("AutoPruneManager", `Actif — intervalle ${this.settings.intervalHours}h, vérification à 3h UTC`);
    }

    // ── Purge ─────────────────────────────────────────────────────────────────

    async runPrune(): Promise<PruneResult> {
        const removed: string[] = [];
        const skipped: string[] = [];
        const errors:  string[] = [];

        try {
            // Lister les images dangling
            const { stdout } = await execAsync(
                "docker images --filter dangling=true --format '{{json .}}'",
                { maxBuffer: 10 * 1024 * 1024 }
            );
            const dangling = (stdout || "")
                .trim().split("\n").filter(l => l.trim())
                .map(l => { try { return JSON.parse(l); } catch { return null; } })
                .filter(Boolean) as Record<string, string>[];

            for (const img of dangling) {
                const fullId  = img["ID"] ?? "";
                const shortId = fullId.replace("sha256:", "").slice(0, 12);

                // Vérifie si l'ID est dans la liste d'exclusion
                if (this.isExcluded(shortId, fullId)) {
                    skipped.push(shortId);
                    continue;
                }

                try {
                    await execAsync(`docker rmi ${fullId}`);
                    removed.push(shortId);
                } catch (e: any) {
                    errors.push(`${shortId}: ${(e.stderr ?? e.message ?? "erreur").split("\n")[0]}`);
                }
            }
        } catch (e: any) {
            errors.push(e.message ?? "Impossible de lister les images");
        }

        const summary = `${removed.length} supprimée(s), ${skipped.length} exclue(s)` +
            (errors.length > 0 ? `, ${errors.length} erreur(s)` : "");

        this.settings.lastRun    = new Date().toISOString();
        this.settings.lastResult = summary;
        this.saveSettings();

        log.info("AutoPruneManager", `Purge terminée : ${summary}`);
        return { removed, skipped, errors, summary };
    }

    private isExcluded(shortId: string, fullId: string): boolean {
        return this.settings.exclusions.some(ex =>
            ex === shortId ||
            ex === fullId  ||
            fullId.startsWith(ex.replace("sha256:", "")) ||
            shortId.startsWith(ex.replace("sha256:", "").slice(0, 12))
        );
    }

    // ── API publique ──────────────────────────────────────────────────────────

    getSettings(): AutoPruneSettings & { nextRun: string | null } {
        return { ...this.settings, nextRun: this.nextRunDate() };
    }

    async updateSettings(
        partial: Partial<Pick<AutoPruneSettings, "enabled" | "intervalHours">>
    ): Promise<void> {
        this.settings = { ...this.settings, ...partial };
        this.saveSettings();
        this.reschedule();
    }

    addExclusion(imageRef: string): void {
        const ref = imageRef.replace("sha256:", "").slice(0, 12) || imageRef;
        if (!this.settings.exclusions.includes(ref)) {
            this.settings.exclusions.push(ref);
            this.saveSettings();
        }
    }

    removeExclusion(imageRef: string): void {
        const ref = imageRef.replace("sha256:", "").slice(0, 12) || imageRef;
        this.settings.exclusions = this.settings.exclusions.filter(e => e !== ref && e !== imageRef);
        this.saveSettings();
    }

    private nextRunDate(): string | null {
        if (!this.settings.enabled) return null;
        if (!this.settings.lastRun) {
            // Premier run : prochain 3h UTC
            const next = new Date();
            next.setUTCHours(3, 0, 0, 0);
            if (next <= new Date()) next.setUTCDate(next.getUTCDate() + 1);
            return next.toISOString();
        }
        const next = new Date(new Date(this.settings.lastRun).getTime()
            + this.settings.intervalHours * 3_600_000);
        return next.toISOString();
    }
}
