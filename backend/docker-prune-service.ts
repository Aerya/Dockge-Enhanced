import fs from "node:fs";
import path from "node:path";
import childProcessAsync from "promisify-child-process";
import {
    AutoPruneManager,
    imageIsUsed,
    protectedImageIds,
    sameImageId,
} from "./watchers/auto-prune-manager";
import { loadDockerImageInventory } from "./docker-image-inventory";
import { getSelfUpdateBlocker } from "./self-update/operation-guard";
import { DiscordNotifier } from "./notification/discord";
import { AppriseNotifier } from "./notification/apprise";
import { log } from "./log";
import {
    dockerDaemonAvailable,
    finishDockerCleanup,
    isDockerBuildActive,
    tryStartDockerCleanup,
    withDockerCleanupLock,
} from "./docker-operation-state";

export { CleanupExecutionLock } from "./docker-operation-state";

export type PruneCategory = "containers" | "images" | "networks" | "volumes" | "buildCache";

export interface PruneCandidate {
    id: string;
    name: string;
    detail?: string;
    size?: string;
    composeProject?: string;
    composeVolume?: string;
    stackPresent?: boolean;
    createdAt?: string;
    protected?: boolean;
    protectionReason?: string;
    excluded?: boolean;
}

export interface PrunePreview {
    generatedAt: string;
    reclaimable: Record<string, string>;
    candidates: Record<PruneCategory, PruneCandidate[]>;
}

export interface PruneHistoryEntry {
    id: string;
    startedAt: string;
    finishedAt: string;
    categories: PruneCategory[];
    results: Partial<Record<PruneCategory, string>>;
    success: boolean;
}

const DATA_DIR = process.env.DOCKGE_DATA_DIR ?? "/opt/dockge/data";
const HISTORY_PATH = path.join(DATA_DIR, "docker-prune-history.json");
const SETTINGS_PATH = path.join(DATA_DIR, "docker-cleanup-settings.json");
const DOCKER_STARTUP_RETRY_MS = 30_000;
const DEFERRED_NOTIFICATION_INTERVAL_MS = 60 * 60_000;
const CATEGORY_COMMANDS: Record<PruneCategory, string[]> = {
    containers: [ "container", "prune", "-f" ],
    // Les images passent obligatoirement par AutoPruneManager afin d'appliquer
    // les protections de rollback, d'utilisation et les exclusions.
    images: [],
    networks: [],
    volumes: [],
    buildCache: [],
};

interface InspectedContainer {
    Image: string;
    Mounts?: Array<{
        Type?: string;
        Name?: string;
    }>;
}

interface InspectedNetwork {
    Id?: string;
    Name: string;
    Driver?: string;
    Scope?: string;
    Ingress?: boolean;
    Containers?: Record<string, unknown>;
    Labels?: Record<string, string>;
    Created?: string;
}

async function docker(args: string[]): Promise<string> {
    const result = await childProcessAsync.spawn("docker", args, {
        encoding: "utf-8",
        maxBuffer: 20 * 1024 * 1024,
    });
    const output = `${result.stdout?.toString() ?? ""}${result.stderr?.toString() ?? ""}`.trim();
    if ((result.code ?? 0) !== 0) {
        throw new Error(output || `docker ${args[0]} failed`);
    }
    return output;
}

async function jsonLines(args: string[]): Promise<Record<string, string>[]> {
    const output = await docker(args);
    return output.split("\n").filter(Boolean).flatMap(line => {
        try {
            return [ JSON.parse(line) as Record<string, string> ];
        } catch {
            return [];
        }
    });
}

function dockerLabel(labels: string, key: string): string | undefined {
    for (const item of (labels || "").split(",")) {
        const index = item.indexOf("=");
        if (index > 0 && item.slice(0, index) === key) {
            return item.slice(index + 1);
        }
    }
    return undefined;
}

export function pruneableContainer(row: Record<string, string>): boolean {
    return ![ "running", "restarting", "paused", "removing" ].includes((row.State || "").toLowerCase());
}

export function pruneableNetwork(network: InspectedNetwork): boolean {
    return ![ "bridge", "host", "none" ].includes(network.Name)
        && network.Scope !== "swarm"
        && network.Ingress !== true
        && Object.keys(network.Containers ?? {}).length === 0;
}

async function dockerCleanupBlockerReason(): Promise<string | undefined> {
    if (isDockerBuildActive()) {
        return "un build Docker est en cours";
    }
    return (await getSelfUpdateBlocker())?.message;
}

function readHistory(): PruneHistoryEntry[] {
    try {
        const parsed = JSON.parse(fs.readFileSync(HISTORY_PATH, "utf8"));
        return Array.isArray(parsed) ? parsed.slice(0, 30) : [];
    } catch {
        return [];
    }
}

function saveHistory(entries: PruneHistoryEntry[]): void {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const temporary = `${HISTORY_PATH}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify(entries.slice(0, 30), null, 2), { mode: 0o600 });
    fs.renameSync(temporary, HISTORY_PATH);
}

export async function buildPrunePreview(): Promise<PrunePreview> {
    const [ containers, imageInventory, volumes, networks, diskUsage ] = await Promise.all([
        jsonLines([ "ps", "-a", "--format", "{{json .}}" ]),
        loadDockerImageInventory(),
        jsonLines([ "volume", "ls", "--format", "{{json .}}" ]),
        jsonLines([ "network", "ls", "--format", "{{json .}}" ]),
        jsonLines([ "system", "df", "--format", "{{json .}}" ]),
    ]);

    const containerIds = containers.map(container => container.ID).filter(Boolean);
    const inspectedContainers = containerIds.length > 0
        ? JSON.parse(await docker([ "inspect", ...containerIds ])) as InspectedContainer[]
        : [];
    const images = imageInventory.rows;
    const usedImageIds = imageInventory.usedImageIds;
    const usedVolumes = new Set<string>();
    for (const container of inspectedContainers) {
        for (const mount of container.Mounts ?? []) {
            if (mount.Type === "volume" && mount.Name) {
                usedVolumes.add(mount.Name);
            }
        }
    }

    const networkNames = networks.map(network => network.Name).filter(Boolean);
    const inspectedNetworks = networkNames.length > 0
        ? JSON.parse(await docker([ "network", "inspect", ...networkNames ])) as InspectedNetwork[]
        : [];
    const volumeNames = volumes.map(volume => volume.Name).filter(Boolean);
    const inspectedVolumes = volumeNames.length > 0
        ? JSON.parse(await docker([ "volume", "inspect", ...volumeNames ])) as Array<{
            Name: string;
            Driver?: string;
            Labels?: Record<string, string>;
            CreatedAt?: string;
        }>
        : [];
    const inspectedImagesById = imageInventory.inspectedById;
    const protectedImages = protectedImageIds(images, usedImageIds);
    const settings = cleanupSettings();
    const exclusions = settings.exclusions;
    const imageExclusions = [
        ...(exclusions.images ?? []),
        ...AutoPruneManager.getInstance().getSettings().unusedExclusions,
    ];

    const reclaimable: Record<string, string> = {};
    for (const row of diskUsage) {
        reclaimable[row.Type] = row.Reclaimable || "0B";
    }

    return {
        generatedAt: new Date().toISOString(),
        reclaimable,
        candidates: {
            containers: containers.filter(pruneableContainer).map(container => ({
                id: container.ID,
                name: container.Names,
                detail: `${container.Image} · ${container.Status}`,
                composeProject: dockerLabel(container.Labels, "com.docker.compose.project"),
            })),
            images: images.map(image => {
                const id = image.ID ?? "";
                const name = image.Repository === "<none>" ? id : `${image.Repository}:${image.Tag}`;
                const excluded = imageExclusions.some(value => value === name || sameImageId(value, id));
                const used = imageIsUsed(id, usedImageIds);
                const protectedImage = [ ...protectedImages ].some(protectedId => sameImageId(protectedId, id));
                return {
                    id,
                    name,
                    detail: image.CreatedSince,
                    size: image.Size,
                    createdAt: inspectedImagesById.get(id)?.Created,
                    protected: protectedImage,
                    protectionReason: protectedImage ? (used ? "used-by-container" : "rollback-or-recovery") : undefined,
                    excluded,
                };
            }),
            networks: inspectedNetworks.filter(pruneableNetwork).map(network => ({
                id: network.Id ?? network.Name,
                name: network.Name,
                detail: network.Driver,
                composeProject: network.Labels?.["com.docker.compose.project"],
                createdAt: network.Created,
                excluded: (exclusions.networks ?? []).includes(network.Name) || (exclusions.networks ?? []).includes(network.Id ?? ""),
            })),
            volumes: inspectedVolumes.filter(volume => !usedVolumes.has(volume.Name)).map(volume => {
                const composeProject = volume.Labels?.["com.docker.compose.project"];
                return {
                    id: volume.Name,
                    name: volume.Name,
                    detail: volume.Driver,
                    composeProject,
                    composeVolume: volume.Labels?.["com.docker.compose.volume"],
                    createdAt: volume.CreatedAt,
                    protected: [ "trivy-cache", "trivy-security-cache" ].includes(volume.Name),
                    protectionReason: [ "trivy-cache", "trivy-security-cache" ].includes(volume.Name) ? "trivy-cache" : undefined,
                    excluded: (exclusions.volumes ?? []).includes(volume.Name),
                    stackPresent: composeProject
                        ? fs.existsSync(path.join(process.env.DOCKGE_STACKS_DIR ?? "/opt/stacks", composeProject, "compose.yaml"))
                        : undefined,
                };
            }),
            buildCache: reclaimable["Build Cache"] && !reclaimable["Build Cache"].startsWith("0B")
                ? [{
                    id: "build-cache",
                    name: "Docker build cache",
                    size: reclaimable["Build Cache"],
                }]
                : [],
        },
    };
}

export function getPruneHistory(): PruneHistoryEntry[] {
    return readHistory();
}

async function runPruneUnlocked(categories: PruneCategory[]): Promise<PruneHistoryEntry> {
    const allowed = [ ...new Set(categories) ].filter(category => Object.hasOwn(CATEGORY_COMMANDS, category));
    if (allowed.length === 0) {
        throw new Error("Aucune catégorie de purge valide sélectionnée");
    }

    const startedAt = new Date().toISOString();
    const results: Partial<Record<PruneCategory, string>> = {};
    let success = true;
    for (const category of allowed) {
        try {
            const blockedReason = await dockerCleanupBlockerReason();
            if (blockedReason) {
                throw new Error(`Nettoyage interrompu avant ${category} : ${blockedReason}`);
            }
            if (category === "images") {
                const imageExclusions = cleanupSettings().exclusions.images ?? [];
                const dangling = await AutoPruneManager.getInstance().runDanglingPrune(false, undefined, imageExclusions, true);
                const unused = await AutoPruneManager.getInstance().runUnusedPrune(false, undefined, imageExclusions, true);
                const outcome = summarizeImagePruneResults(dangling, unused);
                results[category] = outcome.message;
                if (!outcome.success) {
                    success = false;
                }
            } else if (category === "buildCache") {
                const settings = cleanupSettings();
                results.buildCache = await docker([ "builder", "prune", "-a", "-f", "--filter", `until=${settings.graceHours}h` ]);
            } else if (category === "volumes" || category === "networks") {
                const preview = await buildPrunePreview();
                const candidates = preview.candidates[category].filter(candidate => !candidate.protected && !candidate.excluded);
                const resource = category === "volumes" ? "volume" : "network";
                const removed: string[] = [];
                for (const candidate of candidates) {
                    await docker([ resource, "rm", candidate.id ]);
                    removed.push(candidate.name);
                }
                results[category] = `${removed.length} supprimé(s)${removed.length ? ` : ${removed.join(", ")}` : ""}`;
            } else {
                results[category] = await docker(CATEGORY_COMMANDS[category]);
            }
        } catch (error) {
            success = false;
            results[category] = error instanceof Error ? error.message : String(error);
        }
    }

    const entry: PruneHistoryEntry = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        startedAt,
        finishedAt: new Date().toISOString(),
        categories: allowed,
        results,
        success,
    };
    saveHistory([ entry, ...readHistory() ]);
    return entry;
}

export const AUTOMATIC_PRUNE_CATEGORIES = [ "images", "networks", "volumes", "buildCache" ] as const;
export type AutomaticPruneCategory = typeof AUTOMATIC_PRUNE_CATEGORIES[number];

export interface DockerCleanupSettings {
    enabled: boolean;
    intervalHours: 24 | 48 | 168;
    categories: Record<AutomaticPruneCategory, boolean>;
    graceHours: number;
    volumeAutomationConfirmed: boolean;
    exclusions: Partial<Record<AutomaticPruneCategory, string[]>>;
    lastRun?: string;
    lastResult?: string;
    lastDeferredReason?: string;
    lastDeferredNotificationAt?: string;
    nextRun?: string | null;
}

const DEFAULT_CLEANUP_SETTINGS: DockerCleanupSettings = {
    enabled: false,
    intervalHours: 168,
    categories: { images: true,
        networks: false,
        volumes: false,
        buildCache: false },
    graceHours: 168,
    volumeAutomationConfirmed: false,
    exclusions: { volumes: [ "trivy-cache", "trivy-security-cache" ] },
};

function cleanupSettings(): DockerCleanupSettings {
    try {
        const stored = JSON.parse(fs.readFileSync(SETTINGS_PATH, "utf8")) as Partial<DockerCleanupSettings>;
        return {
            ...DEFAULT_CLEANUP_SETTINGS,
            ...stored,
            categories: { ...DEFAULT_CLEANUP_SETTINGS.categories,
                ...(stored.categories ?? {}) },
            exclusions: { ...DEFAULT_CLEANUP_SETTINGS.exclusions,
                ...(stored.exclusions ?? {}) },
        };
    } catch {
        return structuredClone(DEFAULT_CLEANUP_SETTINGS);
    }
}

function candidateOldEnough(candidate: PruneCandidate, graceHours: number, now = Date.now()): boolean {
    if (!candidate.createdAt) {
        return false;
    }
    const created = Date.parse(candidate.createdAt);
    return Number.isFinite(created) && now - created >= graceHours * 3_600_000;
}

export function validateVolumeAutomationSettings(settings: Pick<DockerCleanupSettings, "enabled" | "categories" | "volumeAutomationConfirmed">): void {
    if (settings.categories.volumes && settings.volumeAutomationConfirmed !== true) {
        throw new Error("La purge automatique des volumes exige une confirmation renforcée valide");
    }
}

export function automaticCandidateAllowed(candidate: PruneCandidate, exclusions: string[], graceHours: number, now = Date.now()): boolean {
    return !candidate.protected
        && !candidate.excluded
        && !exclusions.includes(candidate.id)
        && !exclusions.includes(candidate.name)
        && candidateOldEnough(candidate, graceHours, now);
}

export function imagePruneSucceeded(...results: Array<{ errors: string[] }>): boolean {
    return results.every(result => result.errors.length === 0);
}

export function summarizeImagePruneResults(...results: Array<{ summary: string;
    errors: string[] }>): { success: boolean;
    message: string;
    errors: string[] } {
    const errors = results.flatMap(result => result.errors);
    return {
        success: imagePruneSucceeded(...results),
        message: [ ...results.map(result => result.summary), ...errors ].join("; "),
        errors,
    };
}

export function dockerCleanupDue(lastRun: string | undefined, intervalHours: number, now = Date.now()): boolean {
    if (!lastRun) {
        return true;
    }
    const previous = Date.parse(lastRun);
    return !Number.isFinite(previous) || now >= previous + intervalHours * 3_600_000;
}

export function shouldNotifyCleanupDeferral(
    previousReason: string | undefined,
    previousNotificationAt: string | undefined,
    reason: string,
    now = Date.now(),
): boolean {
    if (previousReason !== reason) {
        return true;
    }
    const previous = Date.parse(previousNotificationAt ?? "");
    return !Number.isFinite(previous) || now - previous >= DEFERRED_NOTIFICATION_INTERVAL_MS;
}

export async function withCleanupExecutionLock<T>(operation: () => Promise<T>): Promise<T> {
    return withDockerCleanupLock(operation);
}

export async function runPrune(categories: PruneCategory[]): Promise<PruneHistoryEntry> {
    return withCleanupExecutionLock(() => runPruneUnlocked(categories));
}

export class DockerCleanupManager {
    private static instance: DockerCleanupManager;
    private settings = cleanupSettings();
    private heartbeatTimer: NodeJS.Timeout | null = null;
    private startupTimer: NodeJS.Timeout | null = null;
    private heartbeatRunning = false;

    static getInstance(): DockerCleanupManager {
        DockerCleanupManager.instance ??= new DockerCleanupManager();
        return DockerCleanupManager.instance;
    }

    async start(): Promise<void> {
        this.settings = cleanupSettings();
        await this.applySchedule();
    }

    getSettings(): DockerCleanupSettings {
        const last = this.settings.lastRun ? Date.parse(this.settings.lastRun) : NaN;
        return {
            ...this.settings,
            nextRun: this.settings.enabled
                ? new Date((Number.isFinite(last) ? last : Date.now()) + this.settings.intervalHours * 3_600_000).toISOString()
                : null,
        };
    }

    async updateSettings(input: Partial<DockerCleanupSettings>): Promise<void> {
        const categories = { ...this.settings.categories,
            ...(input.categories ?? {}) };
        const nextSettings: DockerCleanupSettings = {
            ...this.settings,
            ...input,
            intervalHours: [ 24, 48, 168 ].includes(Number(input.intervalHours)) ? input.intervalHours as 24 | 48 | 168 : this.settings.intervalHours,
            graceHours: Math.max(24, Math.min(720, Number(input.graceHours ?? this.settings.graceHours))),
            categories,
            exclusions: { ...this.settings.exclusions,
                ...(input.exclusions ?? {}) },
        };
        if (!categories.volumes) {
            nextSettings.volumeAutomationConfirmed = false;
        }
        validateVolumeAutomationSettings(nextSettings);
        if (nextSettings.enabled && !nextSettings.lastRun) {
            nextSettings.lastRun = new Date().toISOString();
        }
        this.settings = nextSettings;
        this.persist();
        await this.applySchedule();
    }

    async runAutomatic(): Promise<PruneHistoryEntry | null> {
        if (!this.settings.enabled || !tryStartDockerCleanup()) {
            return null;
        }
        const categories = AUTOMATIC_PRUNE_CATEGORIES.filter(category => this.settings.categories[category]);
        const startedAt = new Date().toISOString();
        try {
            validateVolumeAutomationSettings(this.settings);
            const blockedReason = await this.currentBlockerReason();
            if (blockedReason) {
                const notifyDeferred = shouldNotifyCleanupDeferral(
                    this.settings.lastDeferredReason,
                    this.settings.lastDeferredNotificationAt,
                    blockedReason,
                );
                this.settings.lastResult = `Reporté : ${blockedReason}`;
                if (notifyDeferred) {
                    this.settings.lastDeferredReason = blockedReason;
                    this.settings.lastDeferredNotificationAt = new Date().toISOString();
                }
                this.persist();
                if (notifyDeferred) {
                    await this.notify("Nettoyage automatique reporté", blockedReason, "warning");
                }
                return null;
            }
            this.settings.lastDeferredReason = undefined;
            this.settings.lastDeferredNotificationAt = undefined;
            this.persist();
            await this.notify("Nettoyage automatique prêt", `Catégories : ${categories.join(", ")}`, "warning");
            const entry = await this.executeProtected(categories);
            this.settings.lastRun = entry.finishedAt;
            this.settings.lastResult = entry.success ? "Terminé" : "Terminé avec erreurs";
            this.persist();
            await this.notify(
                entry.success ? "Nettoyage automatique terminé" : "Nettoyage automatique incomplet",
                Object.values(entry.results).join("\n"),
                entry.success ? "success" : "failure",
            );
            return entry;
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error);
            const results: Partial<Record<PruneCategory, string>> = {};
            for (const category of categories) {
                results[category] = message;
            }
            const entry: PruneHistoryEntry = {
                id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                startedAt,
                finishedAt: new Date().toISOString(),
                categories,
                results,
                success: false,
            };
            saveHistory([ entry, ...readHistory() ]);
            this.settings.lastRun = entry.finishedAt;
            this.settings.lastResult = `Échec : ${message}`;
            this.persist();
            await this.notify("Échec du nettoyage automatique", message, "failure");
            return entry;
        } finally {
            finishDockerCleanup();
        }
    }

    async heartbeat(now = Date.now(), dockerReady = false): Promise<PruneHistoryEntry | null> {
        if (this.heartbeatRunning || !this.settings.enabled
            || !dockerCleanupDue(this.settings.lastRun, this.settings.intervalHours, now)) {
            return null;
        }
        if (!dockerReady && !await dockerDaemonAvailable()) {
            return null;
        }
        this.heartbeatRunning = true;
        try {
            return await this.runAutomatic();
        } finally {
            this.heartbeatRunning = false;
        }
    }

    private async currentBlockerReason(): Promise<string | undefined> {
        return dockerCleanupBlockerReason();
    }

    private async executeProtected(categories: AutomaticPruneCategory[]): Promise<PruneHistoryEntry> {
        const startedAt = new Date().toISOString();
        const results: Partial<Record<PruneCategory, string>> = {};
        let success = true;
        for (const category of categories) {
            try {
                const blockedReason = await this.currentBlockerReason();
                if (blockedReason) {
                    throw new Error(`Nettoyage interrompu avant ${category} : ${blockedReason}`);
                }
                if (category === "volumes") {
                    validateVolumeAutomationSettings(this.settings);
                }
                if (category === "images") {
                    const exclusions = this.settings.exclusions.images ?? [];
                    const dangling = await AutoPruneManager.getInstance().runDanglingPrune(false, this.settings.graceHours, exclusions, true);
                    const unused = await AutoPruneManager.getInstance().runUnusedPrune(false, this.settings.graceHours, exclusions, true);
                    const outcome = summarizeImagePruneResults(dangling, unused);
                    results.images = outcome.message;
                    if (!outcome.success) {
                        success = false;
                    }
                    continue;
                }
                if (category === "buildCache") {
                    if ((this.settings.exclusions.buildCache ?? []).includes("build-cache")) {
                        results.buildCache = "Exclu";
                        continue;
                    }
                    results.buildCache = await docker([ "builder", "prune", "-a", "-f", "--filter", `until=${this.settings.graceHours}h` ]);
                    continue;
                }
                const exclusions = this.settings.exclusions[category] ?? [];
                const preview = await buildPrunePreview();
                const candidates = preview.candidates[category].filter(candidate =>
                    automaticCandidateAllowed(candidate, exclusions, this.settings.graceHours));
                const resource = category === "volumes" ? "volume" : "network";
                const removed: string[] = [];
                for (const candidate of candidates) {
                    await docker([ resource, "rm", candidate.id ]);
                    removed.push(candidate.name);
                }
                results[category] = `${removed.length} supprimé(s)${removed.length ? ` : ${removed.join(", ")}` : ""}`;
            } catch (error) {
                success = false;
                results[category] = error instanceof Error ? error.message : String(error);
            }
        }
        const entry: PruneHistoryEntry = {
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            startedAt,
            finishedAt: new Date().toISOString(),
            categories,
            results,
            success,
        };
        saveHistory([ entry, ...readHistory() ]);
        return entry;
    }

    private persist(): void {
        fs.mkdirSync(DATA_DIR, { recursive: true });
        fs.writeFileSync(SETTINGS_PATH, JSON.stringify(this.settings, null, 2), { mode: 0o600 });
    }

    private async applySchedule(): Promise<void> {
        if (this.heartbeatTimer) {
            clearInterval(this.heartbeatTimer);
        }
        if (this.startupTimer) {
            clearTimeout(this.startupTimer);
        }
        this.heartbeatTimer = null;
        this.startupTimer = null;
        AutoPruneManager.getInstance().setSchedulingSuspended(this.settings.enabled);
        if (!this.settings.enabled) {
            return;
        }
        this.scheduleStartupCheck();
        this.heartbeatTimer = setInterval(() => this.heartbeat().catch(error => {
            log.error("DockerCleanupManager", String(error));
        }), 15 * 60_000);
        this.heartbeatTimer.unref?.();
    }

    private scheduleStartupCheck(delay = 5_000): void {
        this.startupTimer = setTimeout(async () => {
            if (!this.settings.enabled) {
                return;
            }
            if (!await dockerDaemonAvailable()) {
                log.info("DockerCleanupManager", "Docker indisponible, nouveau contrôle initial dans 30 secondes");
                this.scheduleStartupCheck(DOCKER_STARTUP_RETRY_MS);
                return;
            }
            await this.heartbeat(Date.now(), true).catch(error => {
                log.warn("DockerCleanupManager", `Contrôle initial reporté : ${String(error)}`);
                this.scheduleStartupCheck(DOCKER_STARTUP_RETRY_MS);
            });
        }, delay);
        this.startupTimer.unref?.();
    }

    private async notify(title: string, body: string, type: "success" | "warning" | "failure"): Promise<void> {
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
                log.warn("DockerCleanupManager", `Notification impossible : ${String(error)}`);
            }
        }
    }
}
