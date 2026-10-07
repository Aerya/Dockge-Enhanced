/**
 * AutoPruneManager — purge planifiée des images Docker.
 *
 * Deux modes indépendants :
 *  - Orphelines (dangling)  : images sans tag, supprimées individuellement après protections.
 *  - Inutilisées (unused)   : images taguées sans conteneur, plus anciennes images
 *                             Enhanced tirées par digest après protection du rollback.
 *
 * Vérification au démarrage puis toutes les 15 minutes, selon lastRun + intervalHours.
 * Persistance : DATA_DIR/auto-prune-settings.json
 */

import path from "path";
import * as fs from "node:fs";
import { execFile } from "child_process";
import { promisify } from "util";
import { log } from "../log";
import { DiscordNotifier } from "../notification/discord";
import { AppriseNotifier } from "../notification/apprise";
import {
    dockerDaemonAvailable,
    finishDockerCleanup,
    isDockerBuildActive,
    tryStartDockerCleanup,
    withDockerCleanupLock,
} from "../docker-operation-state";
import { getSelfUpdateBlocker } from "../self-update/operation-guard";
import { recordImagePruneReport } from "../image-prune-report";
import {
    imageIsUsed,
    ImageInventory as SharedImageInventory,
    InspectedImage,
    isDanglingImageRow,
    loadDockerImageInventory,
    normalizeImageId,
    sameImageId,
} from "../docker-image-inventory";

export { imageIsUsed, normalizeImageId, sameImageId } from "../docker-image-inventory";
export type { InspectedImage } from "../docker-image-inventory";

const execFileAsync = promisify(execFile);
const DATA_DIR = process.env.DOCKGE_DATA_DIR ?? "/opt/dockge/data";
const SETTINGS_PATH = path.join(DATA_DIR, "auto-prune-settings.json");
const SELF_UPDATE_DIR = path.join(DATA_DIR, "self-update");
const SELF_IMAGE_REPOSITORY = "ghcr.io/aerya/dockge-enhanced";
const SELF_IMAGE_GRACE_HOURS = 48;
const PRUNE_HEARTBEAT_MS = 15 * 60_000;
const DOCKER_STARTUP_RETRY_MS = 30_000;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AutoPruneSettings {
    // Mode orphelines (dangling)
    danglingEnabled: boolean;
    danglingIntervalHours: 24 | 48 | 168;
    lastDanglingRun?: string;
    lastDanglingResult?: string;

    // Mode inutilisées (unused tagged)
    unusedEnabled: boolean;
    unusedIntervalHours: 24 | 48 | 168;
    unusedExclusions: string[];  // repo:tag (ex: "nginx:latest")
    lastUnusedRun?: string;
    lastUnusedResult?: string;
    lastUnusedErrors?: string[];
}

export interface PruneResult {
    removed: string[];
    skipped: string[];
    protected: string[];
    excluded: string[];
    tooRecent: string[];
    alreadyAbsent: string[];
    errors: string[];
    summary: string;
    examined: PruneImageDecision[];
}

export type PruneImageOutcome = "removed" | "used" | "active" | "rollback" | "recovery"
    | "tooRecent" | "excluded" | "alreadyAbsent" | "error";

export interface PruneImageDecision {
    id: string;
    references: string[];
    outcome: PruneImageOutcome;
    detail?: string;
}

export function summarizePruneDecisions(examined: PruneImageDecision[]): string {
    const count = (outcome: PruneImageOutcome) => examined.filter(item => item.outcome === outcome).length;
    return `${examined.length} examinée(s) : ${count("removed")} supprimée(s), ${count("used")} utilisée(s), `
        + `${count("active")} active(s), ${count("rollback")} rollback, ${count("recovery")} recovery, `
        + `${count("tooRecent")} trop récente(s), ${count("excluded")} exclue(s), `
        + `${count("alreadyAbsent")} déjà absente(s), ${count("error")} erreur(s)`;
}

// ─── Defaults ─────────────────────────────────────────────────────────────────

const DEFAULTS: AutoPruneSettings = {
    danglingEnabled: false,
    danglingIntervalHours: 24,
    unusedEnabled: false,
    unusedIntervalHours: 168,
    unusedExclusions: [],
};

// ─── Helpers Docker ───────────────────────────────────────────────────────────

export function isPruneDue(lastRun: string | undefined, intervalHours: number, now = Date.now()): boolean {
    if (!lastRun) {
        return true;
    }
    const previous = new Date(lastRun).getTime();
    return !Number.isFinite(previous) || now >= previous + intervalHours * 3_600_000;
}

export function nextPruneRun(lastRun: string | undefined, intervalHours: number, now = Date.now()): string {
    const previous = lastRun ? Date.parse(lastRun) : NaN;
    return new Date(Number.isFinite(previous) ? previous + intervalHours * 3_600_000 : now).toISOString();
}

function setHasImageId(ids: Set<string>, candidate: string): boolean {
    return [ ...ids ].some(id => sameImageId(id, candidate));
}

export type AutoPruneTask = "dangling" | "unused";

export function dueAutoPruneTasks(settings: AutoPruneSettings, now = Date.now()): AutoPruneTask[] {
    const due: AutoPruneTask[] = [];
    if (settings.danglingEnabled && isPruneDue(settings.lastDanglingRun, settings.danglingIntervalHours, now)) {
        due.push("dangling");
    }
    if (settings.unusedEnabled && isPruneDue(settings.lastUnusedRun, settings.unusedIntervalHours, now)) {
        due.push("unused");
    }
    return due;
}

export async function executeDueAutoPruneTasks(
    settings: AutoPruneSettings,
    now: number,
    blockerReason: string | undefined,
    runner: (task: AutoPruneTask) => Promise<void>,
): Promise<{ executed: AutoPruneTask[];
    deferred: AutoPruneTask[] }> {
    const due = dueAutoPruneTasks(settings, now);
    if (blockerReason) {
        return { executed: [],
            deferred: due };
    }
    const executed: AutoPruneTask[] = [];
    for (const task of due) {
        await runner(task);
        executed.push(task);
    }
    return { executed,
        deferred: [] };
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
    if (setHasImageId(protectedImageIds, id)) {
        return false;
    }
    return !exclusions.some(exclusion => exclusion === `${repo}:${tag}` || sameImageId(exclusion, id));
}

export function imageCreatedOldEnough(created: string | undefined, minimumAgeHours?: number, now = Date.now()): boolean {
    if (!minimumAgeHours) {
        return true;
    }
    const timestamp = Date.parse(created ?? "");
    return Number.isFinite(timestamp) && now - timestamp >= minimumAgeHours * 3_600_000;
}

export function selfImageCreatedOldEnough(created: string | undefined, minimumAgeHours?: number, now = Date.now()): boolean {
    return imageCreatedOldEnough(
        created,
        Math.max(SELF_IMAGE_GRACE_HOURS, minimumAgeHours ?? 0),
        now,
    );
}

export interface ImageRowGroup {
    id: string;
    rows: Record<string, string>[];
    references: string[];
}

export function groupImageRowsById(rows: Record<string, string>[]): ImageRowGroup[] {
    const groups = new Map<string, ImageRowGroup>();
    for (const row of rows) {
        const id = normalizeImageId(row["ID"] ?? "");
        if (!/^sha256:[a-f0-9]{64}$/.test(id)) {
            continue;
        }
        const group = groups.get(id) ?? {
            id,
            rows: [],
            references: [],
        };
        group.rows.push(row);
        const repo = row["Repository"] ?? "";
        const tag = row["Tag"] ?? "";
        if (repo && tag && repo !== "<none>" && tag !== "<none>") {
            const reference = `${repo}:${tag}`;
            if (!group.references.includes(reference)) {
                group.references.push(reference);
            }
        }
        groups.set(id, group);
    }
    return [ ...groups.values() ];
}

export function untaggedRepositoryReferences(group: ImageRowGroup): string[] {
    const references: string[] = [];
    for (const row of group.rows) {
        const repo = row["Repository"] ?? "";
        const tag = row["Tag"] ?? "";
        if (!repo || repo === "<none>" || tag !== "<none>") {
            continue;
        }
        const reference = `${repo}:<none>`;
        if (!references.includes(reference)) {
            references.push(reference);
        }
    }
    return references;
}

export function selfUntaggedCandidateIds(
    rows: Record<string, string>[],
    protectedImageIds: Set<string>,
): string[] {
    return [ ...new Set(rows
        .filter(row => row["Repository"] === SELF_IMAGE_REPOSITORY && row["Tag"] === "<none>")
        .map(row => normalizeImageId(row["ID"] ?? ""))
        .filter(id => /^sha256:[a-f0-9]{64}$/.test(id))) ]
        .filter(id => !setHasImageId(protectedImageIds, id));
}

export function isObsoleteSelfImage(image: InspectedImage, protectedImageIds: Set<string>): boolean {
    if (!/^sha256:[a-f0-9]{64}$/i.test(image.Id) || setHasImageId(protectedImageIds, image.Id)) {
        return false;
    }
    const tags = (image.RepoTags ?? []).filter(tag => tag && !tag.endsWith(":<none>"));
    const digests = image.RepoDigests ?? [];
    return tags.length === 0
        && digests.length > 0
        && digests.every(ref => ref.startsWith(`${SELF_IMAGE_REPOSITORY}@sha256:`));
}

export function recoveryImageIds(stateDir = SELF_UPDATE_DIR): Set<string> {
    const ids = new Set<string>();
    try {
        const recoveryDir = path.join(stateDir, "recovery");
        for (const name of fs.readdirSync(recoveryDir).filter(file => /^[a-f0-9]{32}\.json$/.test(file))) {
            try {
                const snapshot = JSON.parse(fs.readFileSync(path.join(recoveryDir, name), "utf8")) as { previousImageId?: string };
                if (snapshot.previousImageId && /^sha256:[a-f0-9]{64}$/i.test(snapshot.previousImageId)) {
                    ids.add(normalizeImageId(snapshot.previousImageId));
                }
            } catch { /* Un snapshot corrompu ne doit pas masquer les autres. */ }
        }
    } catch {
        // Aucun snapshot de récupération disponible.
    }
    return ids;
}

export function activeRollbackImageIds(dataDir = DATA_DIR, now = Date.now()): Set<string> {
    const ids = new Set<string>();
    try {
        const entries = JSON.parse(fs.readFileSync(path.join(dataDir, "rollback-registry.json"), "utf8")) as Array<{
            oldImageId?: string;
            expiresAt?: string;
        }>;
        for (const entry of entries) {
            const expiresAt = Date.parse(entry.expiresAt ?? "");
            if (Number.isFinite(expiresAt) && expiresAt > now
                && /^sha256:[a-f0-9]{64}$/i.test(entry.oldImageId ?? "")) {
                ids.add(normalizeImageId(entry.oldImageId!));
            }
        }
    } catch {
        // Aucun registre de rollback utilisable : les tags restent une protection indépendante.
    }
    return ids;
}

export function rollbackTagFromKey(key: string): string {
    const safe = key.toLowerCase().replace(/[^a-z0-9._-]/g, "-").slice(0, 80);
    return `dockge-rollback-${safe}:keep`;
}

export function activeRollbackTags(dataDir = DATA_DIR, now = Date.now()): Set<string> {
    const tags = new Set<string>();
    try {
        const entries = JSON.parse(fs.readFileSync(path.join(dataDir, "rollback-registry.json"), "utf8")) as Array<{
            key?: string;
            expiresAt?: string;
        }>;
        if (!Array.isArray(entries)) {
            return tags;
        }
        for (const entry of entries) {
            if (entry.key && Date.parse(entry.expiresAt ?? "") > now) {
                tags.add(rollbackTagFromKey(entry.key));
            }
        }
    } catch { /* Aucun registre valide. */ }
    return tags;
}

/** Retire les tags keep expirés ou orphelins sous le verrou de nettoyage du watcher. */
export async function reconcileRollbackKeepTags(dataDir = DATA_DIR, now = Date.now()): Promise<string[]> {
    const activeTags = activeRollbackTags(dataDir, now);
    const activeIds = activeRollbackImageIds(dataDir, now);
    const recoveryIds = recoveryImageIds(path.join(dataDir, "self-update"));
    const { stdout } = await execFileAsync("docker", [ "images", "-a", "--no-trunc", "--format", "{{json .}}" ], {
        maxBuffer: 20 * 1024 * 1024,
    });
    const rows = stdout.trim().split("\n").filter(Boolean).map(line => JSON.parse(line) as Record<string, string>);
    const groups = groupImageRowsById(rows);
    const removed: string[] = [];
    for (const group of groups) {
        for (const tag of group.references.filter(ref => ref.startsWith("dockge-rollback-") && ref.endsWith(":keep") && !activeTags.has(ref))) {
            const { stdout: containers } = await execFileAsync("docker", [ "ps", "-aq", "--filter", `ancestor=${group.id}` ]);
            const protectedElsewhere = Boolean(containers.trim()) || setHasImageId(recoveryIds, group.id)
                || setHasImageId(activeIds, group.id);
            if (protectedElsewhere && group.references.length === 1) {
                // Un tag de remplacement évite que `rmi tag` détruise l'unique référence
                // d'une image encore nécessaire au recovery ou à un conteneur.
                await execFileAsync("docker", [ "tag", group.id, `dockge-retained-${group.id.slice(7)}:keep` ]);
            }
            try {
                await execFileAsync("docker", [ "rmi", tag ]);
                removed.push(tag);
            } catch (error) {
                if (!isMissingDockerImageError(error)) {
                    throw error;
                }
                removed.push(tag);
            }
        }
    }
    return removed;
}

export function protectedImageIds(
    imageRows: Record<string, string>[],
    usedImageIds: Set<string>,
    stateDir = SELF_UPDATE_DIR,
): Set<string> {
    const protectedIds = new Set([ ...usedImageIds ].map(normalizeImageId));
    const activeTags = activeRollbackTags(path.dirname(stateDir));
    for (const image of imageRows) {
        if (activeTags.has(`${image["Repository"]}:${image["Tag"]}`)) {
            protectedIds.add(normalizeImageId(image["ID"] ?? ""));
        }
    }
    for (const id of recoveryImageIds(stateDir)) {
        protectedIds.add(id);
    }
    for (const id of activeRollbackImageIds(path.dirname(stateDir))) {
        protectedIds.add(id);
    }
    return protectedIds;
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

export function isMissingDockerImageError(error: unknown): boolean {
    return /\bno such image\b/i.test(dockerError(error));
}

export function selfUpdateProtectedImages(
    usedImageIds: Set<string>,
    inspectedImages: InspectedImage[] = [],
    stateDir = SELF_UPDATE_DIR,
    now = Date.now(),
): Set<string> | null {
    try {
        const status = JSON.parse(fs.readFileSync(path.join(stateDir, "status.json"), "utf8")) as {
            state?: string;
            finishedAt?: string;
            targetImage?: string;
        };
        const finished = Date.parse(status.finishedAt ?? "");
        if (status.state !== "succeeded" || !Number.isFinite(finished) || finished > now) {
            return null;
        }
        const targetDigest = status.targetImage?.match(/^ghcr\.io\/aerya\/dockge-enhanced@(sha256:[a-f0-9]{64})$/i)?.[1]?.toLowerCase();
        const currentMatchesTarget = inspectedImages.some(image =>
            setHasImageId(usedImageIds, image.Id)
            && (image.RepoDigests ?? []).some(ref => ref.toLowerCase() === `${SELF_IMAGE_REPOSITORY}@${targetDigest}`));
        if (!targetDigest || !currentMatchesTarget) {
            return null;
        }
        const recoveryIds = recoveryImageIds(stateDir);
        if (recoveryIds.size === 0) {
            return null;
        }
        const protectedIds = new Set([ ...usedImageIds ].map(normalizeImageId));
        recoveryIds.forEach(id => protectedIds.add(id));
        return protectedIds;
    } catch {
        return null;
    }
}

export interface ImageInventory extends SharedImageInventory {
    protectedImageIds: Set<string>;
}

// ─── Manager ──────────────────────────────────────────────────────────────────

export class AutoPruneManager {
    private static _instance: AutoPruneManager;
    private settings: AutoPruneSettings = { ...DEFAULTS };
    private heartbeatTimer: NodeJS.Timeout | null = null;
    private startupTimer: NodeJS.Timeout | null = null;
    private heartbeatRunning = false;
    private schedulingSuspended = false;

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
        if (this.heartbeatTimer) {
            clearInterval(this.heartbeatTimer);
        }
        if (this.startupTimer) {
            clearTimeout(this.startupTimer);
        }
        this.heartbeatTimer = null;
        this.startupTimer = null;
        if (this.schedulingSuspended || (!this.settings.danglingEnabled && !this.settings.unusedEnabled)) {
            return;
        }
        this.scheduleStartupCheck();
        this.heartbeatTimer = setInterval(() => this.heartbeat().catch(error => {
            log.error("AutoPruneManager", `Heartbeat : ${String(error)}`);
        }), PRUNE_HEARTBEAT_MS);
        this.heartbeatTimer.unref?.();
        log.info("AutoPruneManager", "Échéances contrôlées au démarrage puis toutes les 15 minutes");
    }

    private scheduleStartupCheck(delay = 5_000): void {
        this.startupTimer = setTimeout(async () => {
            if (this.schedulingSuspended) {
                return;
            }
            if (!await dockerDaemonAvailable()) {
                log.info("AutoPruneManager", "Docker indisponible, nouveau contrôle initial dans 30 secondes");
                this.scheduleStartupCheck(DOCKER_STARTUP_RETRY_MS);
                return;
            }
            await this.heartbeat(Date.now(), true).catch(error => {
                log.warn("AutoPruneManager", `Contrôle initial reporté : ${String(error)}`);
                this.scheduleStartupCheck(DOCKER_STARTUP_RETRY_MS);
            });
        }, delay);
        this.startupTimer.unref?.();
    }

    async heartbeat(now = Date.now(), dockerReady = false): Promise<void> {
        if (this.schedulingSuspended || this.heartbeatRunning || dueAutoPruneTasks(this.settings, now).length === 0) {
            return;
        }
        if (!dockerReady && !await dockerDaemonAvailable()) {
            return;
        }
        if (!tryStartDockerCleanup()) {
            return;
        }
        this.heartbeatRunning = true;
        try {
            const blocker = isDockerBuildActive()
                ? "un build Docker est en cours"
                : (await getSelfUpdateBlocker())?.message;
            await executeDueAutoPruneTasks(this.settings, now, blocker, async task => {
                if (task === "dangling") {
                    await this.runDanglingPrune(true, undefined, [], true, "automatic");
                } else {
                    await this.runUnusedPrune(true, undefined, [], true, "automatic");
                }
            });
        } finally {
            this.heartbeatRunning = false;
            finishDockerCleanup();
        }
    }

    // ── Purge orphelines (dangling) ───────────────────────────────────────────

    async loadImageInventory(): Promise<ImageInventory> {
        const inventory = await loadDockerImageInventory();
        return {
            ...inventory,
            protectedImageIds: protectedImageIds(inventory.rows, inventory.usedImageIds),
        };
    }

    async assertImageRemovalAllowed(target: string): Promise<void> {
        let inspected: InspectedImage;
        try {
            const { stdout } = await execFileAsync("docker", [ "image", "inspect", target ], {
                maxBuffer: 20 * 1024 * 1024,
            });
            const images = JSON.parse(stdout || "[]") as InspectedImage[];
            if (!images[0]) {
                return;
            }
            inspected = images[0];
        } catch (error) {
            if (isMissingDockerImageError(error)) {
                return;
            }
            throw error;
        }

        const imageId = normalizeImageId(inspected.Id);
        const { stdout: containerIds } = await execFileAsync("docker", [
            "ps", "-aq", "--filter", `ancestor=${imageId}`,
        ], { maxBuffer: 20 * 1024 * 1024 });
        if (containerIds.trim()) {
            throw new Error("Cette image est utilisée par un conteneur");
        }

        if ((inspected.RepoTags ?? []).some(tag => activeRollbackTags().has(tag))) {
            throw new Error("Cette image est protégée pour un rollback");
        }

        if (setHasImageId(activeRollbackImageIds(), imageId)) {
            throw new Error("Cette image est protégée pour un rollback");
        }

        if (setHasImageId(recoveryImageIds(), imageId)) {
            throw new Error("Cette image est protégée pour une récupération");
        }
    }

    /**
     * Point de passage unique pour toute suppression d'image déclenchée par
     * Ressources Docker / auto-prune / nettoyage unifié.
     *
     * La protection est revalidée immédiatement avant `docker rmi`, mais de
     * façon ciblée sur l'image concernée : conteneurs, tag rollback et recovery.
     * Une purge en lot ne recharge donc plus tout l'inventaire Docker avant
     * chaque suppression.
     */
    async removeImageSafely(target: string, force = false): Promise<boolean> {
        try {
            await this.assertImageRemovalAllowed(target);
            await execFileAsync("docker", [ "rmi", ...(force ? [ "--force" ] : []), target ]);
            return true;
        } catch (error) {
            if (isMissingDockerImageError(error)) {
                return false;
            }
            throw error;
        }
    }

    async runDanglingPrune(notify = true, minimumAgeHours?: number, exclusions: string[] = [], lockAlreadyHeld = false,
        origin: "manual" | "automatic" = "manual", record = true): Promise<PruneResult> {
        if (!lockAlreadyHeld) {
            return withDockerCleanupLock(() => this.runDanglingPrune(notify, minimumAgeHours, exclusions, true, origin, record));
        }
        const removed: string[] = [];
        const skipped: string[] = [];
        const protectedImages: string[] = [];
        const excluded: string[] = [];
        const tooRecent: string[] = [];
        const alreadyAbsent: string[] = [];
        const errors: string[] = [];
        const examined: PruneImageDecision[] = [];
        try {
            const inventory = await this.loadImageInventory();
            for (const row of inventory.rows.filter(isDanglingImageRow)) {
                if (!/^sha256:[a-f0-9]{64}$/.test(normalizeImageId(row.ID ?? ""))) {
                    const id = row.ID ?? "<ID manquant>";
                    examined.push({ id,
                        references: [ "<none>:<none>" ],
                        outcome: "error",
                        detail: "Image ID invalide" });
                    errors.push(`${id}: Image ID invalide`);
                }
            }
            const candidates = [ ...new Set(inventory.rows
                .filter(isDanglingImageRow)
                .map(row => normalizeImageId(row["ID"] ?? ""))
                .filter(id => /^sha256:[a-f0-9]{64}$/.test(id))) ];
            for (const id of candidates) {
                const image = inventory.inspectedById.get(id);
                const decision: PruneImageDecision = { id,
                    references: [ "<none>:<none>" ],
                    outcome: "error" };
                examined.push(decision);
                if (setHasImageId(inventory.protectedImageIds, id)) {
                    decision.outcome = imageIsUsed(id, inventory.usedImageIds) ? "used"
                        : setHasImageId(recoveryImageIds(), id) ? "recovery" : "rollback";
                    protectedImages.push(id);
                    skipped.push(id);
                    continue;
                }
                if (exclusions.some(exclusion => sameImageId(exclusion, id))) {
                    decision.outcome = "excluded";
                    excluded.push(id);
                    skipped.push(id);
                    continue;
                }
                if (!imageCreatedOldEnough(image?.Created, minimumAgeHours)) {
                    decision.outcome = "tooRecent";
                    tooRecent.push(id);
                    skipped.push(id);
                    continue;
                }
                try {
                    if (await this.removeImageSafely(id)) {
                        decision.outcome = "removed";
                        removed.push(id);
                    } else {
                        decision.outcome = "alreadyAbsent";
                        alreadyAbsent.push(id);
                        skipped.push(id);
                    }
                } catch (error) {
                    decision.detail = dockerError(error);
                    errors.push(`${id}: ${decision.detail}`);
                }
            }
        } catch (error) {
            errors.push(dockerError(error));
        }
        const summary = summarizePruneDecisions(examined);
        if (origin === "automatic") {
            if (errors.length === 0) {
                this.settings.lastDanglingRun = new Date().toISOString();
            }
            this.settings.lastDanglingResult = summary;
            this.saveSettings();
        }
        if (record) {
            recordImagePruneReport(origin, "dangling", examined, errors);
        }
        log.info("AutoPruneManager", `Orphelines : ${summary}`);
        if (notify) {
            await this.notifyPrune("Images orphelines", [ summary, ...errors ].join("\n"), errors.length ? "failure" : "success");
        }
        return { removed,
            skipped,
            protected: protectedImages,
            excluded,
            tooRecent,
            alreadyAbsent,
            errors,
            summary,
            examined };
    }

    // ── Purge inutilisées (unused tagged) ────────────────────────────────────

    async runUnusedPrune(notify = true, minimumAgeHours?: number, additionalExclusions: string[] = [], lockAlreadyHeld = false,
        origin: "manual" | "automatic" = "manual", record = true): Promise<PruneResult> {
        if (!lockAlreadyHeld) {
            return withDockerCleanupLock(() => this.runUnusedPrune(notify, minimumAgeHours, additionalExclusions, true, origin, record));
        }
        const removed: string[] = [];
        const skipped: string[] = [];
        const protectedImages: string[] = [];
        const excluded: string[] = [];
        const tooRecent: string[] = [];
        const alreadyAbsent: string[] = [];
        const errors: string[] = [];
        const examined: PruneImageDecision[] = [];

        try {
            const inventory = await this.loadImageInventory();
            const exclusions = [ ...new Set([ ...this.settings.unusedExclusions, ...additionalExclusions ]) ];
            for (const row of inventory.rows) {
                if (!isDanglingImageRow(row) && !/^sha256:[a-f0-9]{64}$/.test(normalizeImageId(row.ID ?? ""))) {
                    const id = row.ID ?? "<ID manquant>";
                    examined.push({ id,
                        references: [ `${row.Repository ?? "<none>"}:${row.Tag ?? "<none>"}` ],
                        outcome: "error",
                        detail: "Image ID invalide" });
                    errors.push(`${id}: Image ID invalide`);
                }
            }
            const recoveryIds = recoveryImageIds();
            const rollbackIds = activeRollbackImageIds();
            const rollbackTags = activeRollbackTags();
            for (const group of groupImageRowsById(inventory.rows)) {
                const untagged = untaggedRepositoryReferences(group);
                if (group.references.length === 0 && untagged.length === 0) {
                    continue;
                } // mode dangling
                const references = [ ...group.references, ...untagged ];
                const displayName = references.join(", ");
                const selfImage = group.rows.some(row => row.Repository === SELF_IMAGE_REPOSITORY);
                const decision: PruneImageDecision = { id: group.id,
                    references,
                    outcome: "error" };
                examined.push(decision);
                if (imageIsUsed(group.id, inventory.usedImageIds)) {
                    decision.outcome = selfImage ? "active" : "used";
                } else if (setHasImageId(recoveryIds, group.id)) {
                    decision.outcome = "recovery";
                } else if (setHasImageId(rollbackIds, group.id)
                    || group.references.some(ref => rollbackTags.has(ref))) {
                    decision.outcome = "rollback";
                } else if (exclusions.some(value => sameImageId(value, group.id) || references.includes(value))) {
                    decision.outcome = "excluded";
                    excluded.push(displayName);
                } else {
                    const inspected = inventory.inspectedById.get(group.id);
                    if (!inspected) {
                        decision.outcome = "alreadyAbsent";
                        alreadyAbsent.push(displayName);
                    } else if (!imageCreatedOldEnough(inspected.Created,
                        selfImage ? Math.max(SELF_IMAGE_GRACE_HOURS, minimumAgeHours ?? 0) : minimumAgeHours)) {
                        decision.outcome = "tooRecent";
                        tooRecent.push(displayName);
                    } else {
                        const targets = group.references.length ? group.references : [ group.id ];
                        let deleted = 0;
                        for (const target of targets) {
                            try {
                                if (await this.removeImageSafely(target)) {
                                    deleted++;
                                }
                            } catch (error) {
                                decision.detail = `${target}: ${dockerError(error)} (${deleted}/${targets.length} référence(s) retirée(s))`;
                                errors.push(`${group.id}: ${decision.detail}`);
                                break;
                            }
                        }
                        if (!decision.detail) {
                            decision.outcome = deleted ? "removed" : "alreadyAbsent";
                            (deleted ? removed : alreadyAbsent).push(displayName);
                        }
                    }
                }
                if ([ "active", "used", "rollback", "recovery" ].includes(decision.outcome)) {
                    protectedImages.push(displayName);
                }
                if (decision.outcome !== "removed") {
                    skipped.push(displayName);
                }
            }
        } catch (e: unknown) {
            errors.push(dockerError(e));
        }

        const summary = summarizePruneDecisions(examined);

        if (origin === "automatic") {
            if (errors.length === 0) {
                this.settings.lastUnusedRun = new Date().toISOString();
            }
            this.settings.lastUnusedResult = summary;
            this.settings.lastUnusedErrors = errors;
            this.saveSettings();
        }
        if (record) {
            recordImagePruneReport(origin, "unused", examined, errors);
        }
        log.info("AutoPruneManager", `Inutilisées : ${summary}`);
        if (notify) {
            await this.notifyPrune("Images inutilisées", [ summary, ...errors ].join("\n"), errors.length > 0 ? "failure" : "success");
        }
        return {
            removed,
            skipped,
            protected: protectedImages,
            excluded,
            tooRecent,
            alreadyAbsent,
            errors,
            summary,
            examined,
        };
    }

    private async notifyPrune(title: string, body: string, type: "success" | "warning" | "failure"): Promise<void> {
        try {
            const settings = JSON.parse(fs.readFileSync(path.join(DATA_DIR, "watcher-settings.json"), "utf8")) as {
                discordWebhooks?: string[];
                appriseServerUrl?: string;
                appriseUrls?: string[];
            };
            const fullTitle = `Dockge-Enhanced — ${title}`;
            await Promise.all([
                settings.discordWebhooks?.length
                    ? new DiscordNotifier(settings.discordWebhooks).sendEmbed({
                        title: fullTitle,
                        description: body,
                        color: type === "failure" ? 0xef4444 : type === "warning" ? 0xf59e0b : 0x22c55e,
                    })
                    : Promise.resolve(),
                settings.appriseServerUrl
                    ? new AppriseNotifier(settings.appriseServerUrl, settings.appriseUrls ?? []).send({ title: fullTitle,
                        body,
                        type })
                    : Promise.resolve(false),
            ]);
        } catch (error) {
            if ((error as NodeJS.ErrnoException)?.code !== "ENOENT") {
                log.warn("AutoPruneManager", `Notification impossible : ${String(error)}`);
            }
        }
    }

    // ── API publique ──────────────────────────────────────────────────────────

    getSettings(): AutoPruneSettings & { nextDanglingRun: string | null;
        nextUnusedRun: string | null } {
        return {
            ...this.settings,
            nextDanglingRun: this.nextRun(this.settings.lastDanglingRun, this.settings.danglingIntervalHours, this.settings.danglingEnabled),
            nextUnusedRun: this.nextRun(this.settings.lastUnusedRun, this.settings.unusedIntervalHours, this.settings.unusedEnabled),
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

    setSchedulingSuspended(suspended: boolean): void {
        this.schedulingSuspended = suspended;
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
        if (!enabled) {
            return null;
        }
        return nextPruneRun(lastRun, intervalHours);
    }
}
