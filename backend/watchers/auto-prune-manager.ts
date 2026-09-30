/**
 * AutoPruneManager — purge planifiée des images Docker.
 *
 * Deux modes indépendants :
 *  - Orphelines (dangling)  : images sans tag — `docker image prune -f`, sans exclusion.
 *  - Inutilisées (unused)   : images taguées sans conteneur, plus anciennes images
 *                             Enhanced tirées par digest après protection du rollback.
 *
 * Vérification quotidienne à 3h (heure locale du processus) pour chaque mode activé.
 * Persistance : DATA_DIR/auto-prune-settings.json
 */

import path from "path";
import * as fs from "node:fs";
import { exec, execFile } from "child_process";
import { promisify } from "util";
import { Cron } from "croner";
import { log } from "../log";

const execAsync   = promisify(exec);
const execFileAsync = promisify(execFile);
const DATA_DIR    = process.env.DOCKGE_DATA_DIR ?? "/opt/dockge/data";
const SETTINGS_PATH = path.join(DATA_DIR, "auto-prune-settings.json");
const SELF_UPDATE_DIR = path.join(DATA_DIR, "self-update");
const SELF_IMAGE_REPOSITORY = "ghcr.io/aerya/dockge-enhanced";
const SELF_IMAGE_GRACE_MS = 48 * 3_600_000;

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
    lastUnusedErrors?:     string[];
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

async function dockerJsonLines(args: string[]): Promise<Record<string, string>[]> {
    const { stdout } = await execFileAsync("docker", args, { maxBuffer: 10 * 1024 * 1024 });
    return (stdout || "").trim().split("\n").filter(l => l.trim())
        .map(l => JSON.parse(l) as Record<string, string>);
}

export function isPruneDue(lastRun: string | undefined, intervalHours: number, now = Date.now()): boolean {
    if (!lastRun) {
        return false;
    }
    const previous = new Date(lastRun).getTime();
    // Le cron passe à 03:00:00, tandis qu'une exécution précédente finit quelques secondes après.
    return Number.isFinite(previous) && now - previous + 60_000 >= intervalHours * 3_600_000;
}

export function shouldPruneTaggedImage(image: Record<string, string>, protectedImageIds: Set<string>, exclusions: string[]): boolean {
    const repo = image["Repository"] ?? "";
    const tag = image["Tag"] ?? "";
    const id = image["ID"] ?? "";
    if (!repo || !tag || !id || repo === "<none>" || tag === "<none>") {
        return false;
    }
    if (repo.startsWith("dockge-rollback-")) {
        return false;
    }
    if (protectedImageIds.has(id)) {
        return false;
    }
    return !exclusions.includes(`${repo}:${tag}`);
}

interface InspectedImage {
    Id: string;
    RepoTags?: string[];
    RepoDigests?: string[];
}

export function isObsoleteSelfImage(image: InspectedImage, protectedImageIds: Set<string>): boolean {
    if (!/^sha256:[a-f0-9]{64}$/i.test(image.Id) || protectedImageIds.has(image.Id)) {
        return false;
    }
    const refs = [ ...(image.RepoTags ?? []), ...(image.RepoDigests ?? []) ];
    return refs.length > 0 && refs.every(ref => ref === `${SELF_IMAGE_REPOSITORY}@${image.Id}`);
}

function dockerError(error: unknown): string {
    if (typeof error === "object" && error !== null) {
        const detail = error as {
            stderr?: string;
            message?: string;
        };
        return (detail.stderr || detail.message || "Erreur").trim().split("\n")[0];
    }
    return String(error);
}

export function selfUpdateProtectedImages(usedImageIds: Set<string>, stateDir = SELF_UPDATE_DIR, now = Date.now()): Set<string> | null {
    try {
        const status = JSON.parse(fs.readFileSync(path.join(stateDir, "status.json"), "utf8")) as {
            state?: string;
            finishedAt?: string;
            targetImage?: string;
        };
        const finished = Date.parse(status.finishedAt ?? "");
        if (status.state !== "succeeded" || !Number.isFinite(finished) || now - finished < SELF_IMAGE_GRACE_MS) {
            return null;
        }
        const target = status.targetImage?.match(/^ghcr\.io\/aerya\/dockge-enhanced@(sha256:[a-f0-9]{64})$/i)?.[1];
        if (!target || !usedImageIds.has(target)) {
            return null;
        }
        const protectedIds = new Set(usedImageIds);
        const recoveryDir = path.join(stateDir, "recovery");
        const recoveryFiles = fs.readdirSync(recoveryDir).filter(name => /^[a-f0-9]{32}\.json$/.test(name));
        if (recoveryFiles.length === 0) {
            return null;
        }
        for (const name of recoveryFiles) {
            const snapshot = JSON.parse(fs.readFileSync(path.join(recoveryDir, name), "utf8")) as { previousImageId?: string };
            const previousImageId = snapshot.previousImageId;
            if (!previousImageId || !/^sha256:[a-f0-9]{64}$/i.test(previousImageId)) {
                return null;
            }
            protectedIds.add(previousImageId);
        }
        return protectedIds;
    } catch {
        return null;
    }
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
            this.settings = {
                ...DEFAULTS,
                ...JSON.parse(raw),
            };
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
                if (this.settings.lastDanglingRun && !isPruneDue(this.settings.lastDanglingRun, this.settings.danglingIntervalHours)) {
                    return;
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
                if (this.settings.lastUnusedRun && !isPruneDue(this.settings.lastUnusedRun, this.settings.unusedIntervalHours)) {
                    return;
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
            return {
                removed: [],
                skipped: [],
                errors: [],
                summary,
            };
        } catch (e: unknown) {
            const summary = dockerError(e);
            this.settings.lastDanglingRun    = new Date().toISOString();
            this.settings.lastDanglingResult = `Erreur : ${summary}`;
            this.saveSettings();
            return {
                removed: [],
                skipped: [],
                errors: [ summary ],
                summary,
            };
        }
    }

    // ── Purge inutilisées (unused tagged) ────────────────────────────────────

    async runUnusedPrune(): Promise<PruneResult> {
        const removed: string[] = [];
        const skipped: string[] = [];
        const errors:  string[] = [];

        try {
            const allImgs = await dockerJsonLines([ "images", "--no-trunc", "--format", "{{json .}}" ]);
            const { stdout: containerIds } = await execFileAsync("docker", [ "ps", "-aq" ]);
            const ids = containerIds.trim().split("\n").filter(Boolean);
            const usedImageIds = new Set<string>();
            if (ids.length > 0) {
                const { stdout } = await execFileAsync("docker", [ "inspect", ...ids ], { maxBuffer: 20 * 1024 * 1024 });
                for (const container of JSON.parse(stdout) as { Image: string }[]) {
                    usedImageIds.add(container.Image);
                }
            }
            // Un second tag sur la même image ne doit pas contourner la protection rollback.
            const protectedImageIds = new Set(usedImageIds);
            for (const image of allImgs) {
                if ((image["Repository"] ?? "").startsWith("dockge-rollback-")) {
                    protectedImageIds.add(image["ID"]);
                }
            }

            for (const img of allImgs) {
                const repo = img["Repository"] ?? "";
                const tag  = img["Tag"] ?? "";
                const nameTag = `${repo}:${tag}`;
                if (!shouldPruneTaggedImage(img, protectedImageIds, this.settings.unusedExclusions)) {
                    if (this.settings.unusedExclusions.includes(nameTag)) {
                        skipped.push(nameTag);
                    }
                    continue;
                }
                try {
                    await execFileAsync("docker", [ "rmi", nameTag ]);
                    removed.push(nameTag);
                } catch (e: unknown) {
                    errors.push(`${nameTag}: ${dockerError(e)}`);
                }
            }

            // Les anciennes images Enhanced tirées par digest ont Tag=<none> mais ne sont
            // pas dangling pour Docker. Ne les retirer qu'après confirmation du self-update.
            const selfProtectedIds = selfUpdateProtectedImages(protectedImageIds);
            if (selfProtectedIds) {
                const candidateIds = [ ...new Set(allImgs
                    .filter(img => img["Repository"] === SELF_IMAGE_REPOSITORY && img["Tag"] === "<none>")
                    .map(img => img["ID"])) ].filter(id => !selfProtectedIds.has(id));
                if (candidateIds.length > 0) {
                    const { stdout } = await execFileAsync("docker", [ "image", "inspect", ...candidateIds ], { maxBuffer: 20 * 1024 * 1024 });
                    for (const image of JSON.parse(stdout) as InspectedImage[]) {
                        if (!isObsoleteSelfImage(image, selfProtectedIds)) {
                            continue;
                        }
                        try {
                            await execFileAsync("docker", [ "rmi", image.Id ]);
                            removed.push(`${SELF_IMAGE_REPOSITORY}@${image.Id}`);
                        } catch (e: unknown) {
                            errors.push(`${image.Id}: ${dockerError(e)}`);
                        }
                    }
                }
            }
        } catch (e: unknown) {
            errors.push(dockerError(e));
        }

        const summary = `${removed.length} supprimée(s), ${skipped.length} exclue(s)` +
            (errors.length > 0 ? `, ${errors.length} erreur(s)` : "");

        this.settings.lastUnusedRun    = new Date().toISOString();
        this.settings.lastUnusedResult = summary;
        this.settings.lastUnusedErrors = errors;
        this.saveSettings();
        log.info("AutoPruneManager", `Inutilisées : ${summary}`);
        return {
            removed,
            skipped,
            errors,
            summary,
        };
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
        this.settings = {
            ...this.settings,
            ...partial,
        };
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
        const schedule = new Cron("0 3 * * *", { paused: true });
        const previous = lastRun ? new Date(lastRun).getTime() : NaN;
        const earliest = Number.isFinite(previous)
            ? new Date(previous + intervalHours * 3_600_000 - 60_001)
            : new Date();
        return schedule.nextRun(earliest)?.toISOString() ?? null;
    }
}
