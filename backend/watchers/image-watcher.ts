/**
 * ImageWatcher — Lit les compose.yaml de chaque stack active, compare les digests
 * distants via API Registry v2 (sans pull), notifie Discord.
 * Fichier : backend/watchers/image-watcher.ts
 */

import * as cron from "node-cron";
import { execFile } from "child_process";
import { promisify } from "util";
import * as fs from "fs/promises";
import * as fsSync from "fs";
import * as path from "path";
import { buildStackBulkPlan, StackBulkRequest, validateStackBulkRequest } from "./stack-auto-update";
import * as yaml from "js-yaml";
import axios from "axios";
import { EventEmitter } from "events";
import { parse as parseDotenv } from "dotenv";

EventEmitter.defaultMaxListeners = 50;
import { DiscordNotifier } from "../notification/discord";
import { AppriseNotifier } from "../notification/apprise";
import { getNotificationLang, getNotificationLocale, notificationText, NotificationLang } from "../notification/notification-lang";
import { Settings } from "../settings";
import { log } from "../log";
import { ExternalStackManager } from "../external-stacks";
import { BackupManager } from "./backup-manager";
import {
    acceptedComposeFileNames,
    envsubstYAML,
    sleep,
} from "../../common/util-common";
import {
    DockerRegistryCredential,
    normalizeRegistryHost,
    syncDockerRegistryCredentials,
} from "../registry-auth";
import { isUpdatePaused, normalizeUpdatePause, UpdatePause } from "./update-policy";
import {
    automaticImageUpdatesMayRun,
    AutomaticImageUpdateWindow,
    getAutomaticImageUpdateWindow,
    readPersistedSelfUpdateSettings,
} from "../self-update/settings";
import {
    composeModelReadError,
    findComposeServicesByImage,
    parseResolvedComposeModel,
    targetedComposeRecreateArgs,
} from "../compose-network-namespace";
import { composeLabelIsFalse, LABEL_IMAGEUPDATES_CHECK } from "../../common/compose-labels";
import { finishDockerCleanup, tryStartDockerCleanup } from "../docker-operation-state";
import { reconcileRollbackKeepTags, rollbackTagFromKey as rollbackTag } from "./auto-prune-manager";
import { resolveDataDir } from "../data-dir";

const execFileAsync = promisify(execFile);

const STACKS_DIR = process.env.DOCKGE_STACKS_DIR ?? "/opt/stacks";
const DATA_DIR = resolveDataDir();

const ROLLBACK_WINDOW_MS = 24 * 3_600_000; // 24 heures
const UPDATE_HISTORY_MAX = 100;
const MANAGED_DOZZLE_STACK = "dozzle-dockge-enhanced";
const MANAGED_DOZZLE_IMAGE = "amir20/dozzle:latest";

export function isMandatoryManagedUpdate(status: Pick<ImageStatus, "stack" | "image">): boolean {
    return status.stack === MANAGED_DOZZLE_STACK && status.image === MANAGED_DOZZLE_IMAGE;
}

export function buildImageUpdateComposePlan(
    resolvedComposeOutput: string,
    image: string,
): { services: string[];
    recreateArgs: string[] } {
    const model = parseResolvedComposeModel(resolvedComposeOutput);
    const services = findComposeServicesByImage(
        model,
        image,
        service => !composeLabelIsFalse(service.labels as Record<string, unknown> | unknown[] | undefined, LABEL_IMAGEUPDATES_CHECK),
    );
    if (services.length === 0) {
        throw composeModelReadError(new Error(`image "${image}" is not used by a service in the resolved model`));
    }
    return {
        services,
        recreateArgs: targetedComposeRecreateArgs(model, services),
    };
}

export function buildRollbackComposeRecreateArgs(
    resolvedComposeOutput: string,
    services: string[],
): string[] {
    return targetedComposeRecreateArgs(parseResolvedComposeModel(resolvedComposeOutput), services);
}

type AutomaticImageUpdateAction = "immediate" | "scheduled" | "pending" | null;

export function resolveAutomaticImageUpdateAction(
    entry: AutoUpdateEntry | undefined,
    mandatory: boolean,
    globalWindow: AutomaticImageUpdateWindow | null,
    globalWindowOpen: boolean,
    alreadyPending = false,
): AutomaticImageUpdateAction {
    if (!mandatory && (!entry || entry.mode === "ignored")) {
        return null;
    }
    if (globalWindow) {
        if (alreadyPending) {
            return null;
        }
        return globalWindowOpen ? "scheduled" : "pending";
    }
    if (mandatory || entry?.mode === "immediate") {
        return "immediate";
    }
    return entry?.mode === "scheduled" && !alreadyPending ? "pending" : null;
}

export function pendingAutomaticImageUpdateMayRun(
    entry: AutoUpdateEntry | undefined,
    mandatory: boolean,
    globalWindow: AutomaticImageUpdateWindow | null,
    globalWindowOpen: boolean,
    currentTime: string,
): boolean {
    if (!mandatory && (!entry || entry.mode === "ignored")) {
        return false;
    }
    if (globalWindow) {
        return globalWindowOpen;
    }
    if (mandatory || entry?.mode === "immediate") {
        return true;
    }
    return entry?.mode === "scheduled" && entry.time === currentTime;
}

async function automaticImageUpdateWindowPolicy(now = new Date()): Promise<{
    window: AutomaticImageUpdateWindow | null;
    open: boolean;
}> {
    try {
        const settings = await readPersistedSelfUpdateSettings(DATA_DIR);
        return {
            window: getAutomaticImageUpdateWindow(settings),
            open: automaticImageUpdatesMayRun(settings, now),
        };
    } catch (error) {
        console.warn("[ImageWatcher] Impossible de lire le créneau global de maintenance:", error);
        return { window: null,
            open: true };
    }
}

// ─── Types ────────────────────────────────────────────────────────

export interface RegistryCredential extends DockerRegistryCredential {
    registry: string; // "ghcr.io", "registry.example.com"
    username: string;
    token: string; // PAT GitHub ou password
}

export interface AutoUpdateEntry {
    mode: "immediate" | "scheduled" | "ignored";
    time?: string; // "HH:MM" — uniquement pour mode scheduled
    pause?: UpdatePause;
}

/** Poll only immediate-policy images between the less frequent full scans. */
export const IMMEDIATE_IMAGE_CHECK_CRON = "*/5 * * * *";

/** A single registry manifest lookup is enough for all stacks sharing the same tag and platform. */
export function reuseCyclePromise<T>(
    cache: Map<string, Promise<T>>,
    key: string,
    load: () => Promise<T>,
): Promise<T> {
    let pending = cache.get(key);
    if (!pending) {
        pending = load();
        cache.set(key, pending);
    }
    return pending;
}

export function immediateUpdateKeys(entries: Record<string, AutoUpdateEntry>): string[] {
    return Object.entries(entries)
        .filter(([ , entry ]) => entry?.mode === "immediate")
        .map(([ key ]) => key);
}

export interface WatcherSettings {
    enabled: boolean;
    intervalHours: number;
    discordWebhooks: string[]; // liste de webhooks (migration auto depuis discordWebhook)
    credentials: RegistryCredential[];
    notificationLang: NotificationLang;
    autoUpdateConfig: Record<string, AutoUpdateEntry>; // clé "stack::image" → config màj auto
    pendingAutoUpdates: string[]; // clés en attente de màj planifiée
    appriseServerUrl: string; // URL du serveur Apprise (ex: "http://apprise:8000")
    appriseUrls: string[]; // URLs Apprise (ntfy://, tgram://, etc.)
    ignoredDigests: Record<string, string[]>; // clé "stack::image" → digests à ignorer
    imagePlatform: string; // "" = auto, sinon ex: "linux/arm64" ou "linux/arm/v7"
    globalUpdatePause: UpdatePause;
}

export interface ImageStatus {
    image: string; // ex: "nginx:latest"
    stack: string; // nom du dossier stack
    localDigest: string;
    remoteDigest: string;
    hasUpdate: boolean;
    lastChecked: string; // ISO date
    ignored?: boolean;
    ignoredDigest?: string; // digest remote actuellement ignoré ("skip this release")
    error?: string;
}

export interface RollbackEntry {
    key: string; // "stack::image"
    image: string; // ex: "nginx:latest"
    stack: string;
    composePath: string; // chemin absolu vers le compose.yaml
    project?: string; // project name Compose pour une stack externe
    configFiles?: string[]; // chaîne -f complète pour les projets multi-Compose
    workingDir?: string; // project directory Compose pour une stack externe
    envFiles?: string[]; // --env-file explicites du projet externe
    service: string | null; // nom du service docker compose
    services?: string[]; // tous les services utilisant l'image (compatibilité: service ci-dessus)
    oldImageId: string; // sha256:... de l'image avant màj
    updatedAt: string; // ISO date de la màj
    expiresAt: string; // ISO date = updatedAt + 24h
}

export interface UpdateHistoryEntry {
    timestamp: string;
    stack: string;
    image: string;
    oldDigest: string;
    newDigest: string;
    mode: "immediate" | "scheduled" | "manual";
    success: boolean;
    error?: string;
}

/* eslint-disable @stylistic/indent -- this legacy watcher uses two-space indentation */
export interface ManualUpdateBatch {
  running: boolean;
  total: number;
  completed: number;
  current: string | null;
  error: string | null;
}

export function isManualBatchCandidate(status: ImageStatus): boolean {
  return status.hasUpdate && !status.error && !/(^|\/)dockge-enhanced(?=[:@]|$)/i.test(status.image);
}
/* eslint-enable @stylistic/indent */

// Stores partagés — lus par le router pour le polling frontend
export const imageStatusStore = new Map<string, ImageStatus>();
export const rollbackStore = new Map<string, RollbackEntry>();
export const updateHistoryStore: UpdateHistoryEntry[] = [];

// ─── Helpers registry ─────────────────────────────────────────────

function normalizeImage(image: string): {
    registry: string;
    name: string;
    tag: string;
} {
    let registry = "registry-1.docker.io";
    let name = image;
    let tag = "latest";

    // Sépare le tag (attention aux images avec digest @sha256:...)
    if (name.includes("@")) {
    // image@sha256:xxx → on considère que c'est déjà fixé, pas besoin de check
        const [ n, d ] = name.split("@");
        return { registry,
            name: n,
            tag: d };
    }

    const colonIdx = name.lastIndexOf(":");
    if (colonIdx > name.lastIndexOf("/")) {
        tag = name.slice(colonIdx + 1);
        name = name.slice(0, colonIdx);
    }

    // Registry custom : premier segment contient "." ou ":"
    const firstSlash = name.indexOf("/");
    if (firstSlash !== -1) {
        const first = name.slice(0, firstSlash);
        if (first.includes(".") || first.includes(":") || first === "localhost") {
            registry = first;
            name = name.slice(firstSlash + 1);
        }
    }

    // Docker Hub image sans namespace
    if (registry === "registry-1.docker.io" && !name.includes("/")) {
        name = `library/${name}`;
    }

    return { registry,
        name,
        tag };
}

const MANIFEST_ACCEPT = [
    "application/vnd.docker.distribution.manifest.list.v2+json",
    "application/vnd.docker.distribution.manifest.v2+json",
    "application/vnd.oci.image.index.v1+json",
    "application/vnd.oci.image.manifest.v1+json",
].join(", ");

interface ImagePlatform {
    os: string;
    architecture: string;
    variant?: string;
}

interface RemoteDigestInfo {
    digest: string; // digest à afficher/comparer en priorité
    platformDigest: string; // digest du manifest correspondant à la plateforme courante si disponible
    indexDigest: string; // digest de l'index/manifest list multi-arch si disponible
    platform: ImagePlatform;
}

export function assertRegistryHost(registry: string): string {
    const host = registry.trim().toLowerCase();
    const dnsOrIpv4 = /^(?:localhost|[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?)(?::[0-9]{1,5})?$/;
    const ipv6 = /^\[[0-9a-f:]+\](?::[0-9]{1,5})?$/;
    if ((!dnsOrIpv4.test(host) && !ipv6.test(host)) || host.includes("..")) {
        throw new Error("Hôte de registry invalide");
    }
    const parsed = new URL(`https://${host}`);
    if (parsed.host !== host || (parsed.port && Number(parsed.port) > 65535)) {
        throw new Error("Hôte de registry invalide");
    }
    return host;
}

export function buildManifestUrl(registry: string, name: string, tag: string): string {
    const safeRegistry = assertRegistryHost(registry);
    const safeName = name.split("/").map(segment => {
        if (!/^[a-z0-9][a-z0-9._-]*$/i.test(segment)) {
            throw new Error("Nom d’image invalide");
        }
        return encodeURIComponent(segment);
    }).join("/");
    if (!/^[a-z0-9_][a-z0-9_.-]{0,127}$/i.test(tag)) {
        throw new Error("Tag d’image invalide");
    }
    return `https://${safeRegistry}/v2/${safeName}/manifests/${encodeURIComponent(tag)}`;
}

interface LocalImageInfo {
    digest: string;
    imageId: string;
    repoDigests: string[];
    comparable: boolean;
    source: "repoDigest" | "digest" | "none";
    platform?: ImagePlatform;
}

/**
 * A local tag can already point to the newest image while an older running
 * container still holds a previous immutable image ID. Registry digests cannot
 * be compared to Docker's config image IDs: compare config IDs with config IDs.
 */
export function hasRunningImageDrift(tagImageId: string, runningImageIds: string[]): boolean {
    const sha256Id = /^sha256:[0-9a-f]{64}$/i;
    if (!sha256Id.test(tagImageId)) {
        return false;
    }
    return runningImageIds.some((id) => sha256Id.test(id) && id !== tagImageId);
}

function normalizeArch(arch: string): string {
    switch (arch) {
        case "x64":
            return "amd64";
        case "aarch64":
            return "arm64";
        default:
            return arch;
    }
}

function normalizeOs(os: string): string {
    return os === "win32" ? "windows" : os;
}

function parsePlatform(value: string): ImagePlatform | null {
    const raw = value.trim();
    if (!raw) {
        return null;
    }
    const [ os, architecture, variant ] = raw
        .split("/")
        .map((v) => v.trim())
        .filter(Boolean);
    if (!os || !architecture) {
        return null;
    }
    return { os,
        architecture: normalizeArch(architecture),
        variant };
}

function getCurrentPlatform(preferred = ""): ImagePlatform {
    return (
        parsePlatform(preferred) ??
    parsePlatform(process.env.DOCKGE_IMAGE_PLATFORM ?? "") ?? {
            os: normalizeOs(process.platform),
            architecture: normalizeArch(process.arch),
            variant: process.env.DOCKGE_IMAGE_VARIANT?.trim() || undefined,
        }
    );
}

function platformToString(platform: ImagePlatform): string {
    return `${platform.os}/${platform.architecture}${platform.variant ? `/${platform.variant}` : ""}`;
}

function isManifestList(mediaType = ""): boolean {
    const clean = mediaType.split(";")[0].trim();
    return (
        clean === "application/vnd.docker.distribution.manifest.list.v2+json" ||
    clean === "application/vnd.oci.image.index.v1+json"
    );
}

function platformMatches(candidate: any, wanted: ImagePlatform): boolean {
    if (!candidate) {
        return false;
    }
    if (candidate.os !== wanted.os) {
        return false;
    }
    if (candidate.architecture !== wanted.architecture) {
        return false;
    }

    // Si une variante est explicitement demandée, elle doit matcher quand le manifest la précise.
    if (
        wanted.variant &&
    candidate.variant &&
    candidate.variant !== wanted.variant
    ) {
        return false;
    }

    return true;
}

function digestEquals(a: string, b: string): boolean {
    if (!a || !b) {
        return false;
    }
    const norm = (d: string) => d.replace(/^[^:]+:/, "");
    return norm(a) === norm(b);
}

function extractShaDigest(value: unknown): string {
    if (typeof value !== "string") {
        return "";
    }
    return value.match(/sha256:[a-f0-9]{64}/)?.[0] ?? "";
}

function normalizeRepoName(value: string): string {
    let repo = value.trim().toLowerCase();
    if (!repo) {
        return "";
    }
    if (repo.includes("@")) {
        repo = repo.split("@")[0];
    }
    if (repo.includes(":") && repo.lastIndexOf(":") > repo.lastIndexOf("/")) {
        repo = repo.slice(0, repo.lastIndexOf(":"));
    }
    if (repo.startsWith("docker.io/")) {
        repo = repo.slice("docker.io/".length);
    }
    if (repo.startsWith("registry-1.docker.io/")) {
        repo = repo.slice("registry-1.docker.io/".length);
    }
    if (!repo.includes("/")) {
        repo = `library/${repo}`;
    }
    return repo;
}

function findRepoDigestsForImage(image: string, repoDigests: unknown): string[] {
    if (!Array.isArray(repoDigests)) {
        return [];
    }
    const digests = repoDigests.filter(
        (digest): digest is string =>
            typeof digest === "string" && digest.includes("@sha256:"),
    );
    if (digests.length === 0) {
        return [];
    }

    const wantedRepo = normalizeRepoName(image);
    const matchingDigests = digests.filter((digest) => {
        const repo = normalizeRepoName(digest);
        return repo === wantedRepo || repo.endsWith(`/${wantedRepo}`);
    });

    const selected = matchingDigests.length > 0 ? matchingDigests : digests;
    return [
        ...new Set(
            selected.map((digest) => extractShaDigest(digest)).filter(Boolean),
        ),
    ];
}

/**
 * Résout un challenge WWW-Authenticate Bearer en récupérant un token
 * depuis le realm indiqué. Fonctionne pour tout registry v2 conforme
 * (Docker Hub, ghcr.io, lscr.io, quay.io, etc.)
 */
async function resolveChallenge(
    wwwAuthenticate: string,
    credentials: RegistryCredential[],
    registry: string,
): Promise<string> {
    const realmM = wwwAuthenticate.match(/realm="([^"]+)"/);
    const serviceM = wwwAuthenticate.match(/service="([^"]+)"/);
    const scopeM = wwwAuthenticate.match(/scope="([^"]+)"/);
    if (!realmM) {
        return "";
    }

    const params = new URLSearchParams();
    if (serviceM) {
        params.set("service", serviceM[1]);
    }
    if (scopeM) {
        params.set("scope", scopeM[1]);
    }
    const realm = new URL(realmM[1]);
    if (realm.protocol !== "https:" || realm.username || realm.password || realm.hash) {
        return "";
    }
    realm.search = params.toString();
    const tokenUrl = realm.toString();

    // Utilise les credentials si disponibles (registry exact ou domaine du realm)
    const cred = credentials.find(
        (c) => c.registry === registry || assertRegistryHost(c.registry) === realm.host,
    );

    try {
        const res = cred
            ? await axios.get(tokenUrl, {
                auth: { username: cred.username,
                    password: cred.token },
                timeout: 10000,
                maxRedirects: 0,
            })
            : await axios.get(tokenUrl, { timeout: 10000,
                maxRedirects: 0 });
        const token = res.data.token ?? res.data.access_token;
        return token ? `Bearer ${token}` : "";
    } catch {
        return "";
    }
}

/**
 * Renvoie le header Authorization pour un registry donné.
 * Essaie d'abord les credentials explicitement configurés,
 * sinon obtient un token anonyme via l'endpoint standard.
 */
async function getInitialAuth(
    registry: string,
    name: string,
    credentials: RegistryCredential[],
): Promise<string> {
    // Credentials explicites → Basic auth (fonctionne pour ghcr.io, registries privés, etc.)
    const cred = credentials.find((c) => c.registry === registry);
    if (cred) {
        return `Basic ${Buffer.from(`${cred.username}:${cred.token}`).toString("base64")}`;
    }

    // Docker Hub → token anonyme via auth.docker.io
    if (registry === "registry-1.docker.io") {
        try {
            const res = await axios.get(
        `https://auth.docker.io/token?service=registry.docker.io&scope=repository:${name}:pull`,
        { timeout: 10000 },
            );
            return `Bearer ${res.data.token}`;
        } catch {
            return "";
        }
    }

    // Autres registries (ghcr.io, lscr.io…) : on tente sans auth d'abord
    // et on résoudra le challenge 401 si nécessaire dans getRemoteDigest().
    return "";
}

/** Nombre total de tentatives d'une requête de manifest (un envoi, deux reprises). */
const MANIFEST_MAX_ATTEMPTS = 3;

/** Délai de base du backoff (ms) quand le registry ne fournit pas de Retry-After exploitable. */
const MANIFEST_RETRY_BASE_DELAY_MS = 1000;

/** Plafond du délai entre deux tentatives (ms) : un cycle de vérification ne doit pas s'immobiliser. */
const MANIFEST_RETRY_MAX_DELAY_MS = 20000;

/** Statuts HTTP transitoires d'un registry qui justifient une reprise (limite de débit, surcharge). */
export function isRetryableRegistryStatus(status: number): boolean {
    return status === 429 || status === 503;
}

/**
 * Délai (ms) avant de réessayer une requête registry.
 * Priorité à l'en-tête Retry-After (secondes ou date HTTP, RFC 9110), sinon backoff exponentiel.
 * Le résultat est toujours borné par maxDelayMs.
 * Exporté pour les tests.
 */
export function registryRetryDelayMs(
    retryAfterHeader: unknown,
    attempt: number,
    maxDelayMs = MANIFEST_RETRY_MAX_DELAY_MS,
): number {
    const raw = Array.isArray(retryAfterHeader) ? retryAfterHeader[0] : retryAfterHeader;
    let delay = 0;
    if (typeof raw === "number" && Number.isFinite(raw)) {
        delay = raw * 1000;
    } else if (typeof raw === "string" && raw.trim() !== "") {
        const seconds = Number(raw);
        if (Number.isFinite(seconds)) {
            delay = seconds * 1000;
        } else {
            const timestamp = Date.parse(raw);
            if (!Number.isNaN(timestamp)) {
                delay = Math.max(0, timestamp - Date.now());
            }
        }
    }
    if (delay <= 0) {
        delay = MANIFEST_RETRY_BASE_DELAY_MS * 2 ** Math.max(0, attempt - 1);
    }
    return Math.min(delay, maxDelayMs);
}

/** Respect rate limits across targeted cycles instead of requesting the same registry every five minutes. */
export function registryRateLimitCooldownMs(status: number, retryAfterHeader: unknown): number {
    if (status !== 429) {
        return 0;
    }
    // If the registry supplies Retry-After, honour it up to one day; otherwise wait ten minutes.
    return Math.max(10 * 60_000, registryRetryDelayMs(retryAfterHeader, 1, 24 * 3_600_000));
}

interface RegistryRequestRetryOptions {
    label: string;
    wait?: (delayMs: number) => Promise<unknown>;
    warn?: (message: string) => void;
}

/** Exécute réellement une requête registry avec une reprise bornée des erreurs transitoires. */
export async function requestRegistryWithRetry<T>(
    request: () => Promise<T>,
    options: RegistryRequestRetryOptions,
): Promise<T> {
    const wait = options.wait ?? sleep;
    const warn = options.warn ?? ((message: string) => console.warn(message));

    for (let attempt = 1; ; attempt += 1) {
        try {
            return await request();
        } catch (err) {
            const response = axios.isAxiosError(err) ? err.response : undefined;
            const status = response?.status ?? 0;
            if (!isRetryableRegistryStatus(status) || attempt === MANIFEST_MAX_ATTEMPTS) {
                throw err;
            }
            const delay = registryRetryDelayMs(response?.headers?.["retry-after"], attempt);
            warn(
        `[ImageWatcher] ${options.label} → HTTP ${status}, reprise ${attempt + 1}/${MANIFEST_MAX_ATTEMPTS} dans ${Math.round(delay / 1000)} s`,
            );
            await wait(delay);
        }
    }
}

/**
 * Interroge l'API Registry v2 pour récupérer le digest distant du manifest.
 * Implémente le flux auth complet (RFC 7235 + Distribution Auth spec) :
 *   1. Requête sans auth ou avec auth si credentials disponibles
 *   2. Si 401 → parse WWW-Authenticate → obtient token depuis le realm
 *   3. Réessaie avec Bearer token
 * Fonctionne avec Docker Hub, ghcr.io, lscr.io, quay.io, etc.
 * N'effectue AUCUN téléchargement de layer — HEAD/GET sur /manifests/ uniquement.
 */
async function getRemoteDigest(
    image: string,
    credentials: RegistryCredential[],
    preferredPlatform = "",
): Promise<RemoteDigestInfo> {
    const { registry, name, tag } = normalizeImage(image);
    const platform = getCurrentPlatform(preferredPlatform);

    // Image épinglée sur un digest → pas de mise à jour possible
    if (tag.startsWith("sha256:")) {
        return { digest: tag,
            platformDigest: tag,
            indexDigest: "",
            platform };
    }

    const manifestUrl = buildManifestUrl(registry, name, tag);

    let auth = await getInitialAuth(registry, name, credentials);

    const makeHeaders = (): Record<string, string> => {
        const h: Record<string, string> = { Accept: MANIFEST_ACCEPT };
        if (auth) {
            h["Authorization"] = auth;
        }
        return h;
    };

    const fetchManifest = async () => {
        try {
            return await axios.get(manifestUrl, {
                headers: makeHeaders(),
                timeout: 15000,
                maxRedirects: 0,
            });
        } catch (err: any) {
            if (err.response?.status === 401) {
                const challenge =
                    (err.response.headers["www-authenticate"] as string) ?? "";
                if (challenge) {
                    auth = await resolveChallenge(challenge, credentials, registry);
                    return await axios.get(manifestUrl, {
                        headers: makeHeaders(),
                        timeout: 15000,
                        maxRedirects: 0,
                    });
                }
            }
            throw err;
        }
    };

    // Un 429 ou un 503 transitoire (limite de débit partagée, proxy de registry) ne doit pas
    // écarter l'image du cycle de vérification : reprise en respectant Retry-After.
    const res = await requestRegistryWithRetry(fetchManifest, {
        label: `${registry}/${name}:${tag}`,
    });
    const contentType = String(res.headers["content-type"] ?? "");
    const indexDigest = String(res.headers["docker-content-digest"] ?? "");

    if (!isManifestList(contentType)) {
        if (!indexDigest) {
            throw new Error("Header Docker-Content-Digest absent dans la réponse");
        }
        return {
            digest: indexDigest,
            platformDigest: indexDigest,
            indexDigest: "",
            platform,
        };
    }

    const manifests = Array.isArray(res.data?.manifests)
        ? res.data.manifests
        : [];
    const match = manifests.find((m: any) =>
        platformMatches(m.platform, platform),
    );

    if (!match?.digest) {
        const available = manifests
            .map((m: any) => (m.platform ? platformToString(m.platform) : ""))
            .filter(Boolean)
            .join(", ");

        throw new Error(
      `Aucun manifest distant pour ${platformToString(platform)}` +
        (available ? `. Plateformes disponibles: ${available}` : ""),
        );
    }

    return {
        digest: String(match.digest),
        platformDigest: String(match.digest),
        indexDigest,
        platform,
    };
}

/** Retourne l'image avec tag explicite (ajoute :latest si aucun tag ni digest) */
function withExplicitTag(image: string): string {
    if (image.includes("@")) {
        return image;
    }
    const colonIdx = image.lastIndexOf(":");
    if (colonIdx > image.lastIndexOf("/")) {
        return image;
    }
    return `${image}:latest`;
}

export function composeExecInvocation(
    composePath: string,
    args: string[],
    project?: string,
    configFiles?: string[],
    workingDir?: string,
    envFiles?: string[],
): { args: string[];
    cwd: string } {
    const composeDir = path.dirname(composePath);
    const cwd = workingDir ? path.resolve(workingDir) : composeDir;
    const files = configFiles?.length ? configFiles : [ composePath ];
    const fileArgs = files.flatMap((file) => {
        const resolved = path.resolve(file);
        return [ "-f", path.dirname(resolved) === cwd ? path.basename(resolved) : resolved ];
    });
    const envArgs = (envFiles ?? []).flatMap((file) => [ "--env-file", path.resolve(file) ]);
    return {
        args: [
            "compose",
            ...(workingDir ? [ "--project-directory", cwd ] : []),
            ...(project ? [ "--project-name", project ] : []),
            ...envArgs,
            ...fileArgs,
            ...args,
        ],
        cwd,
    };
}

async function docker(args: string[], options: { cwd?: string;
    timeout: number }): Promise<string> {
    const { stdout } = await execFileAsync("docker", args, {
        ...options,
        encoding: "utf8",
        maxBuffer: 20 * 1024 * 1024,
    });
    return stdout;
}

/** Normalise l'intervalle cron en heures pour éviter les expressions invalides */
function sanitizeIntervalHours(value: unknown, fallback = 6): number {
    const interval = Number(value);
    if (!Number.isFinite(interval)) {
        return fallback;
    }
    return Math.min(24, Math.max(1, Math.floor(interval)));
}

/** Informations sur l'image actuellement présente localement */
async function getLocalImageInfo(image: string): Promise<LocalImageInfo> {
    try {
        const ref = withExplicitTag(image);
        const stdout = await docker([ "image", "inspect", "--format", "{{json .}}", ref ], { timeout: 15000 });
        const data = JSON.parse(stdout.trim());
        const repoDigests = findRepoDigestsForImage(image, data?.RepoDigests);
        const looseDigest = extractShaDigest(data?.Digest);
        const os = typeof data?.Os === "string" ? data.Os : "";
        const architecture =
            typeof data?.Architecture === "string" ? data.Architecture : "";
        const variant =
            typeof data?.Variant === "string" ? data.Variant : undefined;

        return {
            digest: repoDigests[0] || looseDigest,
            imageId: typeof data?.Id === "string" ? data.Id : "",
            repoDigests,
            comparable: repoDigests.length > 0,
            source: repoDigests.length > 0 ? "repoDigest" : looseDigest ? "digest" : "none",
            platform:
        os && architecture
            ? { os,
                architecture: normalizeArch(architecture),
                variant }
            : undefined,
        };
    } catch {
        return { digest: "",
            imageId: "",
            repoDigests: [],
            comparable: false,
            source: "none" };
    }
}

/** Lit le YAML brut en repli lorsque Docker Compose ne peut pas résoudre la stack. */
export function extractWatchableImagesFromComposeModel(model: { services?: unknown }): string[] {
    if (!model?.services || typeof model.services !== "object" || Array.isArray(model.services)) {
        return [];
    }
    const images: string[] = [];
    for (const rawService of Object.values(model.services as Record<string, unknown>)) {
        if (!rawService || typeof rawService !== "object" || Array.isArray(rawService)) {
            continue;
        }
        const sourceService = rawService as Record<string, unknown>;
        const merged = sourceService["<<"];
        const service = merged && typeof merged === "object" && !Array.isArray(merged)
            ? { ...(merged as Record<string, unknown>),
                ...sourceService }
            : sourceService;
        if (composeLabelIsFalse(service.labels as Record<string, unknown> | unknown[] | undefined, LABEL_IMAGEUPDATES_CHECK)) {
            continue;
        }
        if (typeof service.image === "string" && service.image.trim()) {
            images.push(service.image.trim());
        }
    }
    return [ ...new Set(images) ];
}

function extractImagesFromComposeYaml(composePath: string): string[] {
    try {
        let raw = fsSync.readFileSync(composePath, "utf8");
        const shellEnv = Object.fromEntries(
            Object.entries(process.env).filter(
                (entry): entry is [string, string] => typeof entry[1] === "string",
            ),
        );
        let fileEnv: Record<string, string> = {};
        try {
            fileEnv = parseDotenv(
                fsSync.readFileSync(path.join(path.dirname(composePath), ".env")),
            );
        } catch {
            /* .env optionnel */
        }
        raw = envsubstYAML(raw, { ...fileEnv,
            ...shellEnv });
        const doc = yaml.load(raw) as Record<string, unknown>;
        return extractWatchableImagesFromComposeModel(doc);
    } catch (err) {
        console.warn(
      `[ImageWatcher] extractImagesFromCompose: erreur lecture ${composePath}:`,
      err,
        );
        return [];
    }
}

/**
 * Retourne toutes les images du modèle Compose résolu, même si la stack est arrêtée.
 * `config --format json` prend en charge les variables, ancres, extends et includes,
 * tout en conservant les labels nécessaires au filtrage par service.
 */
async function extractImagesFromCompose(composePath: string, project?: string, configFiles?: string[], workingDir?: string, envFiles?: string[]): Promise<string[]> {
    const configCommand = composeExecInvocation(composePath, [ "config", "--format", "json" ], project, configFiles, workingDir, envFiles);
    try {
        const stdout = await docker(configCommand.args, {
            cwd: configCommand.cwd,
            timeout: 30000,
        });
        return extractWatchableImagesFromComposeModel(JSON.parse(stdout) as { services?: unknown });
    } catch (err) {
        console.warn(
      `[ImageWatcher] docker compose config --images a échoué pour ${composePath}, lecture YAML de repli:`,
      err,
        );
        return extractImagesFromComposeYaml(composePath);
    }
}

async function findComposePath(stackDir: string): Promise<string> {
    for (const filename of acceptedComposeFileNames) {
        const candidate = path.join(stackDir, filename);
        try {
            await fs.access(candidate);
            return candidate;
        } catch {
            /* next */
        }
    }
    return "";
}

export interface WatchedComposeStack {
    composePath: string;
    project?: string;
    configFiles?: string[];
    workingDir?: string;
    envFiles?: string[];
}

/** Query only the running Compose services that actually use this image. */
async function runningComposeImageIds(image: string, watched: WatchedComposeStack): Promise<string[]> {
    const { composePath, project, configFiles, workingDir, envFiles } = watched;
    const invocation = (args: string[]) => composeExecInvocation(composePath, args, project, configFiles, workingDir, envFiles);
    const configCommand = invocation([ "config", "--format", "json" ]);
    const config = await docker(configCommand.args, { cwd: configCommand.cwd,
        timeout: 30000 });
    const { services } = buildImageUpdateComposePlan(config, image);
    const psCommand = invocation([ "ps", "--status", "running", "-q", ...services ]);
    const idsText = await docker(psCommand.args, { cwd: psCommand.cwd,
        timeout: 15000 });
    const ids = idsText.split(/\s+/).filter(Boolean);
    if (ids.length === 0) {
        return [];
    }
    const output = await docker([ "container", "inspect", "--format", "{{.Image}}", ...ids ], { timeout: 15000 });
    return output.split(/\s+/).filter(Boolean);
}

export async function collectWatchedComposeStacks(
    stacksDir: string,
    externalStacks: ExternalStackManager,
): Promise<Map<string, WatchedComposeStack>> {
    const watched = new Map<string, WatchedComposeStack>();
    const entries = await fs.readdir(stacksDir, { withFileTypes: true });
    for (const entry of entries) {
        if (!entry.isDirectory()) {
            continue;
        }
        const composePath = await findComposePath(path.join(stacksDir, entry.name));
        if (composePath) {
            watched.set(entry.name, { composePath });
        }
    }

    for (const registration of await externalStacks.list()) {
        if (watched.has(registration.name)) {
            continue;
        }
        try {
            const verified = await externalStacks.assertRegisteredPath(registration);
            watched.set(verified.name, { composePath: verified.composeFile,
                project: verified.project,
                configFiles: verified.configFiles,
                workingDir: verified.workingDir,
                envFiles: verified.envFiles });
        } catch (error) {
            console.warn(`[ImageWatcher] Stack externe ${registration.name} ignorée: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    return watched;
}

// ─── Classe principale ────────────────────────────────────────────

export class ImageWatcher {
    private static _instance: ImageWatcher;
    private cronJob: cron.ScheduledTask | null = null;
    private minuteCron: cron.ScheduledTask | null = null;
    private immediateCron: cron.ScheduledTask | null = null;
    private cleanupCron: cron.ScheduledTask | null = null;
    private _immediateCycleRunning = false;
    private immediateRemoteCache: Map<string, Promise<RemoteDigestInfo>> | null = null;
    private readonly registryCooldownUntil = new Map<string, number>();
    private baseUrl: string = "";
    private _checkRunning = false;
    private _updatingImages = new Set<string>();
/* eslint-disable @stylistic/indent -- this legacy watcher uses two-space indentation */
  private manualBatch: ManualUpdateBatch = {
    running: false,
    total: 0,
    completed: 0,
    current: null,
    error: null,
  };

    /* eslint-enable @stylistic/indent */
    private readonly dataDir: string;
    private readonly settingsPath: string;
    private readonly rollbackPath: string;
    private readonly updateHistoryPath: string;
    private readonly externalStacks: ExternalStackManager;

    constructor(dataDir = DATA_DIR) {
        this.dataDir = dataDir;
        this.settingsPath = path.join(dataDir, "watcher-settings.json");
        this.rollbackPath = path.join(dataDir, "rollback-registry.json");
        this.updateHistoryPath = path.join(dataDir, "update-history.json");
        this.externalStacks = new ExternalStackManager(dataDir, STACKS_DIR);
    }

    setBaseUrl(url: string): void {
        this.baseUrl = url;
    }

    settings: WatcherSettings = {
        enabled: false,
        intervalHours: 6,
        discordWebhooks: [],
        credentials: [],
        notificationLang: "fr",
        autoUpdateConfig: {},
        pendingAutoUpdates: [],
        appriseServerUrl: "",
        appriseUrls: [],
        ignoredDigests: {},
        imagePlatform: "",
        globalUpdatePause: { enabled: false,
            until: null },
    };

    static getInstance(): ImageWatcher {
        if (!ImageWatcher._instance) {
            ImageWatcher._instance = new ImageWatcher();
        }
        return ImageWatcher._instance;
    }

    // ── Persistance ───────────────────────────────────────────────

    async loadSettings(): Promise<void> {
        try {
            const raw = await fs.readFile(this.settingsPath, "utf8");
            const data = JSON.parse(raw) as Record<string, unknown>;
            // Migration : ancien champ discordWebhook (string) → discordWebhooks (string[])
            if (typeof data.discordWebhook === "string" && !data.discordWebhooks) {
                data.discordWebhooks = data.discordWebhook ? [ data.discordWebhook ] : [];
                delete data.discordWebhook;
            }
            // Migration : autoUpdateImages (string[]) → autoUpdateConfig (Record)
            if (Array.isArray(data.autoUpdateImages) && !data.autoUpdateConfig) {
                data.autoUpdateConfig = {};
                for (const key of data.autoUpdateImages as string[]) {
                    (data.autoUpdateConfig as Record<string, AutoUpdateEntry>)[key] = {
                        mode: "immediate",
                    };
                }
                delete data.autoUpdateImages;
            }

            data.globalUpdatePause = normalizeUpdatePause(data.globalUpdatePause);
            if (data.autoUpdateConfig && typeof data.autoUpdateConfig === "object") {
                for (const value of Object.values(data.autoUpdateConfig as Record<string, AutoUpdateEntry>)) {
                    if (value && typeof value === "object") {
                        value.pause = normalizeUpdatePause(value.pause);
                    }
                }
            }
            this.settings = {
                ...this.settings,
                ...(data as Partial<WatcherSettings>),
            };
        } catch {
            /* première utilisation */
        }
    }

    async saveSettings(partial: Partial<WatcherSettings>, runInitialCheck = true): Promise<void> {
        this.settings = { ...this.settings,
            ...partial };
        this.settings.credentials = this.settings.credentials.map((credential) => ({
            ...credential,
            registry: normalizeRegistryHost(credential.registry),
        }));
        await this.persistToFile();
        await syncDockerRegistryCredentials(this.settings.credentials, this.dataDir);
        this.restart(runInitialCheck);
    }

    /** Écrit les settings sur disque SANS redémarrer le watcher (usage interne) */
    private async persistToFile(): Promise<void> {
        await fs.mkdir(this.dataDir, { recursive: true });
        await fs.writeFile(this.settingsPath, JSON.stringify(this.settings, null, 2), { mode: 0o600 });
        await fs.chmod(this.settingsPath, 0o600).catch(() => {});
    }

    getSettingsSafe(): WatcherSettings {
        return {
            ...this.settings,
            credentials: this.settings.credentials.map((c) => ({
                ...c,
                token: "***",
            })),
        };
    }

    getRegistryCredentialHosts(): string[] {
        return [ ...new Set(this.settings.credentials.map((credential) => normalizeRegistryHost(credential.registry)).filter(Boolean)) ];
    }

    getRegistryCredential(registry: string): RegistryCredential | undefined {
        const normalized = normalizeRegistryHost(registry);
        const credential = this.settings.credentials.find((item) => normalizeRegistryHost(item.registry) === normalized);
        return credential ? { ...credential,
            registry: normalized } : undefined;
    }

    async importRegistryCredential(credential: RegistryCredential): Promise<void> {
        const registry = normalizeRegistryHost(credential.registry);
        const username = credential.username.trim();
        if (!registry || !username || !credential.token) {
            throw new Error("Invalid registry credential");
        }
        const credentials = this.settings.credentials.filter((item) => normalizeRegistryHost(item.registry) !== registry);
        credentials.push({ registry,
            username,
            token: credential.token });
        await this.saveSettings({ credentials });
    }

    getAutoUpdateState() {
        return {
            enabled: this.settings.enabled,
            autoUpdateConfig: this.settings.autoUpdateConfig ?? {},
            pendingAutoUpdates: this.settings.pendingAutoUpdates ?? [],
            updatingImages: [ ...this._updatingImages ],
            globalUpdatePause: normalizeUpdatePause(this.settings.globalUpdatePause),
        };
    }

    /** Prepare the same server-owned, resolved Compose preview for local and linked instances. */
    async previewStackBulkAutoUpdate(raw: unknown) {
        const request = validateStackBulkRequest(raw);
        const stacks = await collectWatchedComposeStacks(STACKS_DIR, this.externalStacks);
        const watched = stacks.get(request.stack);
        if (!watched) {
            throw new Error("Stack absente ou non accessible sur cette instance");
        }
        const command = composeExecInvocation(watched.composePath, [ "config", "--format", "json" ], watched.project, watched.configFiles, watched.workingDir, watched.envFiles);
        const model = parseResolvedComposeModel(await docker(command.args, { cwd: command.cwd,
            timeout: 30000 }));
        return buildStackBulkPlan(request, model, this.settings.autoUpdateConfig ?? {});
    }

    /** Persist the entire policy batch once; never trust image keys supplied by a browser. */
    async applyStackBulkAutoUpdate(raw: unknown) {
        const request: StackBulkRequest = validateStackBulkRequest(raw);
        if (!request.previewToken) {
            throw new Error("Aperçu obligatoire avant application");
        }
        if (this.isBusy()) {
            throw new Error("Une opération ImageWatcher est déjà en cours. Réessayer plus tard.");
        }
        const plan = await this.previewStackBulkAutoUpdate(request);
        if (request.previewToken !== plan.previewToken) {
            throw new Error("La stack ou ses réglages ont changé : actualiser l’aperçu");
        }
        if (!plan.changed) {
            return { ...plan,
                applied: 0,
                autoUpdateState: this.getAutoUpdateState() };
        }
        const config = { ...this.settings.autoUpdateConfig };
        const changes = new Set(plan.changes.map(change => change.key));
        for (const change of plan.changes) {
            if (request.mode === "off") {
                delete config[change.key];
            } else {
                config[change.key] = request.mode === "scheduled"
                    ? { mode: "scheduled",
                        time: request.time }
                    : { mode: "immediate" };
            }
        }
        const pendingAutoUpdates = this.settings.pendingAutoUpdates.filter(key => !changes.has(key));
        await this.saveSettings({ autoUpdateConfig: config,
            pendingAutoUpdates,
            ...(request.mode !== "off" && !this.settings.enabled ? { enabled: true } : {}) }, false);
        if (request.mode === "immediate") {
            // Sequential targeted checks avoid a large parallel pull burst.
            void (async () => {
                for (const { key } of plan.changes) {
                    try {
                        await this.runImmediateCheck(key);
                    } catch (error) {
                        console.warn("[ImageWatcher] Bulk immediate check failed:", key, error);
                    }
                }
            })();
        }
        return { ...plan,
            applied: plan.changed,
            autoUpdateState: this.getAutoUpdateState() };
    }

    isBusy(): boolean {
        return this._checkRunning || this._updatingImages.size > 0 || this.manualBatch.running;
    }

/* eslint-disable @stylistic/indent -- this legacy watcher uses two-space indentation */
  getManualUpdateBatch(): {
    available: number;
    batch: ManualUpdateBatch;
  } {
    return {
      available: [ ...imageStatusStore.values() ].filter(isManualBatchCandidate).length,
      batch: { ...this.manualBatch },
    };
  }

  startManualUpdateBatch(): ManualUpdateBatch {
    if (this.manualBatch.running) {
      throw new Error("A batch update is already running");
    }
    if (this._checkRunning || this._updatingImages.size > 0) {
      throw new Error("An image check or update is already running");
    }
    if (BackupManager.getInstance().isBackupRunActive() || BackupManager.getInstance().isRestoreRunActive()) {
      throw new Error("A Restic backup or restore is already running");
    }
    const keys = [ ...imageStatusStore.entries() ]
      .filter(([ , status ]) => isManualBatchCandidate(status))
      .map(([ key ]) => key);
    if (keys.length === 0) {
      throw new Error("No applicable image update is available");
    }
    this.manualBatch = {
      running: true,
      total: keys.length,
      completed: 0,
      current: null,
      error: null,
    };
    void this.runManualUpdateBatch(keys);
    return { ...this.manualBatch };
  }

  private async runManualUpdateBatch(keys: string[]): Promise<void> {
    try {
      for (const key of keys) {
        this.manualBatch.current = key;
        if (BackupManager.getInstance().isBackupRunActive() || BackupManager.getInstance().isRestoreRunActive()) {
          throw new Error("A Restic backup or restore started during the batch");
        }
        const success = await this.manualUpdate(key, true);
        if (!success) {
          throw new Error(`Update failed, stack paused, or already in progress: ${key}`);
        }
        this.manualBatch.completed++;
      }
    } catch (error) {
      this.manualBatch.error = error instanceof Error ? error.message : String(error);
    } finally {
      this.manualBatch.current = null;
      this.manualBatch.running = false;
    }
  }
    /* eslint-enable @stylistic/indent */

    // ── Cycle de vie ──────────────────────────────────────────────

    async startIfEnabled(): Promise<void> {
        await this.loadSettings();
        this.settings.credentials = this.settings.credentials.map((credential) => ({
            ...credential,
            registry: normalizeRegistryHost(credential.registry),
        }));
        await syncDockerRegistryCredentials(this.settings.credentials);
        await this.loadRollbackRegistry();
        await this._loadUpdateHistory();
        if (this.settings.enabled) {
            this.start();
        }
    }

    private async _loadUpdateHistory(): Promise<void> {
        try {
            const raw = await fs.readFile(this.updateHistoryPath, "utf8");
            const entries = JSON.parse(raw) as UpdateHistoryEntry[];
            updateHistoryStore.length = 0;
            updateHistoryStore.push(...entries.slice(0, UPDATE_HISTORY_MAX));
        } catch {
            /* première utilisation */
        }
    }

    async clearUpdateHistory(): Promise<void> {
        updateHistoryStore.length = 0;
        try {
            await fs.unlink(this.updateHistoryPath);
        } catch {
            /* ignore */
        }
    }

    start(runInitialCheck = true): void {
        this.stop();
        const intervalHours = sanitizeIntervalHours(this.settings.intervalHours);
        this.settings.intervalHours = intervalHours;
        const expr = `0 */${intervalHours} * * *`;
        console.log(
      `[ImageWatcher] Démarrage — vérification toutes les ${intervalHours}h`,
        );
        this.cronJob = cron.schedule(expr, () => this.runCheck());
        // Les images en mode « Immédiat » sont surveillées séparément toutes les
        // 5 minutes, avec cache des manifests par cycle, sans scan global.
        this.immediateCron = cron.schedule(IMMEDIATE_IMAGE_CHECK_CRON, () =>
            this.runImmediateChecks().catch(console.error),
        );
        // Cron minutaire pour appliquer les màj planifiées
        this.minuteCron = cron.schedule("* * * * *", () =>
            this.applyPendingUpdates().catch(console.error),
        );
        // Cron horaire pour supprimer les anciennes images dont le rollback a expiré
        this.cleanupCron = cron.schedule("0 * * * *", () =>
            this.cleanExpiredRollbacks().catch(console.error),
        );
        // Réconciliation immédiate des tags rollback expirés/orphelins au démarrage.
        this.cleanExpiredRollbacks().catch(console.error);
        // Check immédiat au démarrage, sauf quand l'appelant lance un contrôle ciblé.
        if (runInitialCheck) {
            this.runCheck().catch(console.error);
        }
    }

    stop(): void {
        this.cronJob?.stop();
        this.cronJob = null;
        this.minuteCron?.stop();
        this.minuteCron = null;
        this.immediateCron?.stop();
        this.immediateCron = null;
        this.cleanupCron?.stop();
        this.cleanupCron = null;
    }

    restart(runInitialCheck = true): void {
        this.settings.enabled ? this.start(runInitialCheck) : this.stop();
    }

    /** Avoid overlapping a targeted cycle with a full scan or manual updates. */
    private async runImmediateChecks(): Promise<void> {
        if (!this.settings.enabled || this._checkRunning || this._immediateCycleRunning ||
            this.manualBatch.running || this._updatingImages.size > 0) {
            return;
        }
        const keys = immediateUpdateKeys(this.settings.autoUpdateConfig ?? {});
        if (keys.length === 0) {
            return;
        }
        this._immediateCycleRunning = true;
        this.immediateRemoteCache = new Map();
        const startedAt = Date.now();
        let checked = 0;
        let updated = 0;
        let pending = 0;
        let failures = 0;
        try {
            for (const key of keys) {
                if (!this.settings.enabled || this._checkRunning || this.manualBatch.running) {
                    break;
                }
                checked++;
                try {
                    const result = await this.runImmediateCheck(key);
                    if (imageStatusStore.get(key)?.error) {
                        failures++;
                    } else if (result === "updated") {
                        updated++;
                    } else if (result === "pending") {
                        pending++;
                    }
                } catch (error) {
                    failures++;
                    console.warn(`[ImageWatcher] Contrôle ciblé ${key} impossible:`, error);
                }
            }
        } finally {
            const uniqueManifests = this.immediateRemoteCache?.size ?? 0;
            const durationSeconds = ((Date.now() - startedAt) / 1000).toFixed(1);
            console.log(
                `[ImageWatcher] Contrôle ciblé (5 min) : ${checked}/${keys.length} service(s), ` +
                `${uniqueManifests} manifest(s) unique(s), ${updated} mise(s) à jour, ` +
                `${pending} en attente, ${failures} erreur(s), ${durationSeconds} s`,
            );
            this.immediateRemoteCache = null;
            this._immediateCycleRunning = false;
        }
    }

    // ── Check principal ───────────────────────────────────────────

/* eslint-disable @stylistic/indent -- this legacy watcher uses two-space indentation */
  async runImmediateCheck(key: string): Promise<"up-to-date" | "updated" | "pending" | "skipped"> {
    const sepIdx = key.indexOf("::");
    if (sepIdx <= 0) {
      throw new Error("Clé image invalide");
    }
    const stack = key.slice(0, sepIdx);
    const image = key.slice(sepIdx + 2);
    const cfg = this.settings.autoUpdateConfig?.[key];
    if (!cfg || cfg.mode !== "immediate") {
      return "skipped";
    }

    const watchedStacks = await collectWatchedComposeStacks(STACKS_DIR, this.externalStacks);
    const watched = watchedStacks.get(stack);
    if (!watched) {
      throw new Error(`Stack introuvable: ${stack}`);
    }

    const images = await extractImagesFromCompose(
      watched.composePath,
      watched.project,
      watched.configFiles,
      watched.workingDir,
      watched.envFiles,
    );
    if (!images.includes(image)) {
      throw new Error(`Image introuvable dans la stack: ${image}`);
    }

    const status = await this.checkOneImage(image, stack, watched);
    const skippedDigests = this.settings.ignoredDigests?.[key] ?? [];
    if (status.remoteDigest && skippedDigests.includes(status.remoteDigest)) {
      status.hasUpdate = false;
      status.ignoredDigest = status.remoteDigest;
    }
    imageStatusStore.set(key, status);
    if (!status.hasUpdate || status.error) {
      return "up-to-date";
    }

    if (isUpdatePaused(this.settings.globalUpdatePause) || isUpdatePaused(cfg.pause)) {
      return "pending";
    }
    const globalWindowPolicy = await automaticImageUpdateWindowPolicy();
    if (globalWindowPolicy.window && !globalWindowPolicy.open) {
      this.settings.pendingAutoUpdates = [ ...new Set([ ...(this.settings.pendingAutoUpdates ?? []), key ]) ];
      await this.persistToFile();
      return "pending";
    }

    const updated = await this.performAutoUpdate(status, watched, "immediate");
    if (updated && (this.settings.discordWebhooks.length > 0 || this.settings.appriseServerUrl)) {
      await this.notify([ status ], 1, [ status ], this.settings.autoUpdateConfig, globalWindowPolicy.window);
    }
    return updated ? "updated" : "pending";
  }

    /* eslint-enable @stylistic/indent */
    async runCheck(): Promise<ImageStatus[]> {
        if (this._checkRunning || this._immediateCycleRunning || this.manualBatch.running) {
            console.log("[ImageWatcher] Check déjà en cours, ignoré.");
            return [];
        }
        this._checkRunning = true;
        log.info("image-watcher", "Vérification des images démarrée");
        const results: ImageStatus[] = [];

        let watchedStacks: Map<string, WatchedComposeStack>;
        try {
            watchedStacks = await collectWatchedComposeStacks(STACKS_DIR, this.externalStacks);
        } catch {
            console.error(`[ImageWatcher] Impossible de lire ${STACKS_DIR}`);
            this._checkRunning = false;
            return [];
        }

        // Collecte les clés traitées ce cycle pour purger les entrées obsolètes
        const processedKeys = new Set<string>();
        // Map stack → compose pour l'auto-update
        const composeByStack = new Map<string, WatchedComposeStack>();

        for (const [ stack, watched ] of watchedStacks) {
            try {
                const composePath = watched.composePath;
                composeByStack.set(stack, watched);

                const images = await extractImagesFromCompose(composePath, watched.project, watched.configFiles, watched.workingDir, watched.envFiles);
                if (images.length === 0) {
                    console.log(
            `[ImageWatcher] ${stack}: aucune image trouvée dans ${composePath}`,
                    );
                }
                for (const image of images) {
                    const key = `${stack}::${image}`;
                    processedKeys.add(key);
                    const cfg = (this.settings.autoUpdateConfig ?? {})[key];
                    if (cfg?.mode === "ignored") {
                        const prev = imageStatusStore.get(key);
                        const ignored: ImageStatus = prev
                            ? { ...prev,
                                ignored: true,
                                hasUpdate: false }
                            : {
                                image,
                                stack,
                                localDigest: "",
                                remoteDigest: "",
                                hasUpdate: false,
                                lastChecked: new Date().toISOString(),
                                ignored: true,
                            };
                        imageStatusStore.set(key, ignored);
                        continue;
                    }
                    const status = await this.checkOneImage(image, stack, watched);
                    // Digest ignoré → on supprime le flag hasUpdate pour ce cycle
                    const skipped = this.settings.ignoredDigests?.[key] ?? [];
                    if (status.remoteDigest && skipped.includes(status.remoteDigest)) {
                        status.hasUpdate = false;
                        status.ignoredDigest = status.remoteDigest;
                    }
                    results.push(status);
                    imageStatusStore.set(key, status);
                }
            } catch (err) {
                console.error(
          `[ImageWatcher] Erreur lors du traitement de la stack "${stack}":`,
          err,
                );
            }
        }

        // Supprime les entrées du store qui ne correspondent plus à aucune image active
        for (const key of imageStatusStore.keys()) {
            if (!processedKeys.has(key)) {
                imageStatusStore.delete(key);
            }
        }

        const updates = results.filter((r) => r.hasUpdate && !r.error);

        // ── Auto-update ───────────────────────────────────────────
        const autoUpdateConfig = this.settings.autoUpdateConfig ?? {};
        const currentPending = new Set(this.settings.pendingAutoUpdates ?? []);

        const toApplyNow: Array<{ status: ImageStatus;
            mode: "immediate" | "scheduled" }> = [];
        const newlyPending: string[] = [];

        const globalPaused = isUpdatePaused(this.settings.globalUpdatePause);
        const globalWindowPolicy = await automaticImageUpdateWindowPolicy();
        for (const r of updates) {
            const key = `${r.stack}::${r.image}`;
            const cfg = autoUpdateConfig[key];
            if (globalPaused || isUpdatePaused(cfg?.pause)) {
                continue;
            }
            const action = resolveAutomaticImageUpdateAction(
                cfg,
                isMandatoryManagedUpdate(r),
                globalWindowPolicy.window,
                globalWindowPolicy.open,
                currentPending.has(key),
            );
            if (action === "immediate" || action === "scheduled") {
                toApplyNow.push({ status: r,
                    mode: action });
            } else if (action === "pending") {
                newlyPending.push(key);
            }
        }

        // Enregistre les nouvelles màj en attente (sans restart — watcher déjà actif)
        if (newlyPending.length > 0) {
            const merged = [ ...new Set([ ...currentPending, ...newlyPending ]) ];
            this.settings.pendingAutoUpdates = merged;
            await this.persistToFile();
            console.log(
        `[ImageWatcher] ${newlyPending.length} image(s) mise(s) en attente de màj planifiée`,
            );
        }

        // Applique les màj immédiates
        const autoUpdated: ImageStatus[] = [];
        for (const item of toApplyNow) {
            const watched = composeByStack.get(item.status.stack);
            if (watched) {
                const success = await this.performAutoUpdate(
                    item.status,
                    watched,
                    item.mode,
                );
                if (success) {
                    autoUpdated.push(item.status);
                }
            }
        }

        // Notifications après les màj auto, pour tout signaler en un seul embed
        if (
            updates.length > 0 &&
      (this.settings.discordWebhooks.length > 0 ||
        this.settings.appriseServerUrl)
        ) {
            await this.notify(
                updates,
                results.length,
                autoUpdated,
                this.settings.autoUpdateConfig,
                globalWindowPolicy.window,
            );
        }

        console.log(
      `[ImageWatcher] ${results.length} image(s) vérifiée(s), ` +
        `${updates.length} mise(s) à jour disponible(s)` +
        (autoUpdated.length
            ? `, ${autoUpdated.length} immédiate(s) effectuée(s)`
            : "") +
        (newlyPending.length
            ? `, ${newlyPending.length} planifiée(s) en attente`
            : ""),
        );
        this._checkRunning = false;
        return results;
    }

    /** Applique les màj planifiées dont l'heure correspond à l'heure courante (appelé chaque minute) */
    private async applyPendingUpdates(): Promise<void> {
/* eslint-disable @stylistic/indent -- this legacy watcher uses two-space indentation */
    if (this.manualBatch.running) {
      return;
    }
        /* eslint-enable @stylistic/indent */
        const pending = this.settings.pendingAutoUpdates ?? [];
        if (pending.length === 0) {
            return;
        }

        const now = new Date();
        const currentTime = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;

        if (isUpdatePaused(this.settings.globalUpdatePause)) {
            return;
        }

        const globalWindowPolicy = await automaticImageUpdateWindowPolicy(now);
        if (globalWindowPolicy.window && !globalWindowPolicy.open) {
            return;
        }

        const toApply = pending.filter((key) => {
            const cfg = this.settings.autoUpdateConfig?.[key];
            const sepIdx = key.indexOf("::");
            if (sepIdx === -1 || isUpdatePaused(cfg?.pause)) {
                return false;
            }
            const mandatory = isMandatoryManagedUpdate({
                stack: key.slice(0, sepIdx),
                image: key.slice(sepIdx + 2),
            });
            return pendingAutomaticImageUpdateMayRun(
                cfg,
                mandatory,
                globalWindowPolicy.window,
                globalWindowPolicy.open,
                currentTime,
            );
        });
        if (toApply.length === 0) {
            return;
        }

        // Retire les clés traitées du pending avant d'appliquer (évite double-tir si la màj est longue)
        // Pas de restart — le watcher tourne déjà, on veut juste persister l'état
        this.settings.pendingAutoUpdates = pending.filter(
            (k) => !toApply.includes(k),
        );
        await this.persistToFile();

        console.log(
      `[ImageWatcher] Màj planifiée à ${currentTime} : ${toApply.length} image(s)`,
        );

        const applied: ImageStatus[] = [];
        const watchedStacks = await collectWatchedComposeStacks(STACKS_DIR, this.externalStacks);
        for (const key of toApply) {
            const sepIdx = key.indexOf("::");
            if (sepIdx === -1) {
                continue;
            }
            const stack = key.slice(0, sepIdx);
            const image = key.slice(sepIdx + 2);

            // Trouve le fichier compose (stack native ou externe)
            const watched = watchedStacks.get(stack);
            if (!watched) {
                continue;
            }

            // Récupère le statut connu ou fait un check rapide
            const status: ImageStatus = imageStatusStore.get(key) ?? {
                image,
                stack,
                localDigest: "",
                remoteDigest: "",
                hasUpdate: true,
                lastChecked: new Date().toISOString(),
            };

            const success = await this.performAutoUpdate(
                status,
                watched,
                "scheduled",
            );
            if (success) {
                applied.push(status);
            }
        }

        if (
            applied.length > 0 &&
      (this.settings.discordWebhooks.length > 0 ||
        this.settings.appriseServerUrl)
        ) {
            await this.notify(
                applied,
                applied.length,
                applied,
                this.settings.autoUpdateConfig,
            );
        }
    }

    private async resolveImageUpdatePlan(
        composePath: string,
        image: string,
        project?: string,
        configFiles?: string[],
        workingDir?: string,
        envFiles?: string[],
    ): Promise<{ services: string[];
        recreateArgs: string[] }> {
        const configCommand = composeExecInvocation(composePath, [ "config", "--format", "json" ], project, configFiles, workingDir, envFiles);
        try {
            const stdout = await docker(configCommand.args, { cwd: configCommand.cwd,
                timeout: 30_000 });
            return buildImageUpdateComposePlan(stdout, image);
        } catch (error) {
            throw composeModelReadError(error);
        }
    }

    /** Tire et redémarre une image via docker compose. Retourne true si succès. */
    private async performAutoUpdate(
        status: ImageStatus,
        watched: WatchedComposeStack,
        mode: "immediate" | "scheduled" | "manual" = "immediate",
        respectPaused = false,
    ): Promise<boolean> {
        const key = `${status.stack}::${status.image}`;
        const { composePath, project, configFiles, workingDir, envFiles } = watched;
/* eslint-disable @stylistic/indent -- this legacy watcher uses two-space indentation */
    if (mode !== "manual" || respectPaused) {
      const pausedCommand = composeExecInvocation(composePath, [ "ps", "--status", "paused", "--services" ], project, configFiles, workingDir, envFiles);
      try {
        const pausedServices = await docker(pausedCommand.args, {
          cwd: pausedCommand.cwd,
          timeout: 15000,
        });
        if (pausedServices.trim()) {
          console.log("[ImageWatcher] Auto-update postponed for paused stack", status.stack);
          return false;
        }
      } catch (error) {
        console.warn("[ImageWatcher] Could not check paused state; postponing update:", status.stack, error);
        return false;
      }
    } /* eslint-enable @stylistic/indent */
        if (this._updatingImages.has(key)) {
            console.log(`[ImageWatcher] Auto-update ${key} déjà en cours, ignorée.`);
            return false;
        }
        this._updatingImages.add(key);
        const oldDigest = status.localDigest ?? "";
        try {
            const { services, recreateArgs } = await this.resolveImageUpdatePlan(
                composePath,
                status.image,
                project,
                configFiles,
                workingDir,
                envFiles,
            );
            console.log(
        `[ImageWatcher] Auto-update: ${status.stack}/${status.image} (services: ${services.join(", ")})`,
            );
            // Capture l'image *exécutée* : le tag local peut avoir changé quand
            // plusieurs stacks partagent :latest. Un seul rollback ID est pris
            // en charge ; avec plusieurs versions actives, pas de faux rollback.
            let oldImageId = "";
            try {
                const runningIds = await runningComposeImageIds(status.image, watched);
                const distinct = [ ...new Set(runningIds) ];
                if (distinct.length === 1) {
                    oldImageId = distinct[0];
                } else if (distinct.length === 0) {
                    const ref = withExplicitTag(status.image);
                    const stdout = await docker([ "image", "inspect", "--format", "{{.Id}}", ref ], { timeout: 10000 });
                    oldImageId = stdout.trim();
                } else {
                    console.warn("[ImageWatcher] Rollback non disponible : %s exécute plusieurs versions d'image", key);
                }
            } catch (error) {
                console.warn("[ImageWatcher] Impossible de capturer l'image avant MàJ pour %s :", key, error);
            }

            const pullCommand = composeExecInvocation(composePath, [ "pull", ...services ], project, configFiles, workingDir, envFiles);
            await docker(pullCommand.args, {
                cwd: pullCommand.cwd,
                timeout: 600000,
            });
            const upCommand = composeExecInvocation(composePath, recreateArgs, project, configFiles, workingDir, envFiles);
            await docker(upCommand.args, {
                cwd: upCommand.cwd,
                timeout: 120000,
            });

            // ── Sauvegarde l'entrée de rollback si on avait une image antérieure ──
            if (oldImageId) {
                const now = new Date();
                await this.saveRollbackEntry({
                    key,
                    image: status.image,
                    stack: status.stack,
                    composePath,
                    project,
                    configFiles,
                    workingDir,
                    envFiles,
                    service: services[0] ?? null,
                    services,
                    oldImageId,
                    updatedAt: now.toISOString(),
                    expiresAt: new Date(now.getTime() + ROLLBACK_WINDOW_MS).toISOString(),
                });
            }

            // Recheck pour mettre à jour le digest dans le store
            const newStatus = await this.checkOneImage(status.image, status.stack, watched);
            imageStatusStore.set(key, newStatus);
            console.log(
        `[ImageWatcher] Auto-update terminée: ${status.stack}/${status.image}`,
            );
            this._updatingImages.delete(key);

            await this._recordUpdateHistory({
                timestamp: new Date().toISOString(),
                stack: status.stack,
                image: status.image,
                oldDigest,
                newDigest: newStatus.localDigest ?? status.remoteDigest,
                mode,
                success: true,
            });

            return true;
        } catch (e) {
            const errMsg = e instanceof Error ? e.message : String(e);
            console.error(
                "[ImageWatcher] Échec de l’auto-update:",
                status.stack,
                status.image,
                e,
            );
            this._updatingImages.delete(key);

            await this._recordUpdateHistory({
                timestamp: new Date().toISOString(),
                stack: status.stack,
                image: status.image,
                oldDigest,
                newDigest: "",
                mode,
                success: false,
                error: errMsg,
            });

            return false;
        }
    }

    private async _recordUpdateHistory(entry: UpdateHistoryEntry): Promise<void> {
        updateHistoryStore.unshift(entry);
        if (updateHistoryStore.length > UPDATE_HISTORY_MAX) {
            updateHistoryStore.splice(UPDATE_HISTORY_MAX);
        }
        try {
            await fs.mkdir(this.dataDir, { recursive: true });
            await fs.writeFile(
                this.updateHistoryPath,
                JSON.stringify(updateHistoryStore, null, 2),
            );
        } catch {
            /* non bloquant */
        }
    }

    // ── Ignore digest ─────────────────────────────────────────────────

    async ignoreDigest(key: string, digest: string): Promise<void> {
        const ignoredDigests = { ...(this.settings.ignoredDigests ?? {}) };
        const existing = ignoredDigests[key] ?? [];
        if (!existing.includes(digest)) {
            existing.push(digest);
        }
        ignoredDigests[key] = existing;
        // Mise à jour du store immédiatement sans redémarrer le watcher
        this.settings = { ...this.settings,
            ignoredDigests };
        const current = imageStatusStore.get(key);
        if (current && current.remoteDigest === digest) {
            imageStatusStore.set(key, {
                ...current,
                hasUpdate: false,
                ignoredDigest: digest,
            });
        }
        await this.persistToFile();
    }

    async clearIgnoredDigests(key: string): Promise<void> {
        const ignoredDigests = { ...(this.settings.ignoredDigests ?? {}) };
        delete ignoredDigests[key];
        this.settings = { ...this.settings,
            ignoredDigests };
        const current = imageStatusStore.get(key);
        if (current?.ignoredDigest) {
            const [ stack, image ] = key.split("::");
            if (stack && image) {
                imageStatusStore.set(key, await this.checkOneImage(image, stack));
            } else {
                const { ignoredDigest: _, ...rest } = current;
                imageStatusStore.set(key, { ...rest,
                    hasUpdate: false });
            }
        }
        await this.persistToFile();
    }

    // ── Manual update (on-demand from UI) ─────────────────────────────

    async manualUpdate(key: string, respectPaused = false): Promise<boolean> {
        const sepIdx = key.indexOf("::");
        if (sepIdx === -1) {
            throw new Error("Invalid key format — expected 'stack::image'");
        }
        const stack = key.slice(0, sepIdx);
        const image = key.slice(sepIdx + 2);

        const status = imageStatusStore.get(key);
        if (!status || status.stack !== stack || status.image !== image) {
            throw new Error("Image status not found; run an image check first");
        }
        if (!status.hasUpdate || status.error) {
            throw new Error("No applicable update is available for this image");
        }

        const watchedStacks = await collectWatchedComposeStacks(STACKS_DIR, this.externalStacks);
        const watched = watchedStacks.get(stack);
        if (!watched) {
            throw new Error(`Stack "${stack}" not found`);
        }

        return this.performAutoUpdate(status, watched, "manual", respectPaused);
    }

    // ── Rollback ──────────────────────────────────────────────────────

    private async loadRollbackRegistry(): Promise<void> {
        try {
            const raw = await fs.readFile(this.rollbackPath, "utf8");
            const entries = JSON.parse(raw) as RollbackEntry[];
            rollbackStore.clear();
            for (const e of entries) {
                // Les entrées expirées doivent rester visibles jusqu'au passage du
                // nettoyeur, sinon leurs tags Docker subsistent indéfiniment.
                rollbackStore.set(e.key, e);
            }
            console.log(
        `[ImageWatcher] Registre rollback chargé — ${rollbackStore.size} entrée(s) active(s)`,
            );
        } catch {
            /* première utilisation */
        }
    }

    private async saveRollbackRegistry(): Promise<void> {
        await fs.mkdir(this.dataDir, { recursive: true });
        await fs.writeFile(
            this.rollbackPath,
            JSON.stringify([ ...rollbackStore.values() ], null, 2),
        );
    }

    private async saveRollbackEntry(entry: RollbackEntry): Promise<void> {
    // Si une entrée existe déjà pour cette clé (double màj dans la fenêtre), retire l'ancien tag
        const existing = rollbackStore.get(entry.key);
        if (existing) {
            try {
                await docker([ "rmi", rollbackTag(existing.key) ], { timeout: 10000 });
            } catch {}
        }
        rollbackStore.set(entry.key, entry);
        await this.saveRollbackRegistry();
        // Tague l'ancienne image pour la protéger des `docker image prune`
        try {
            await docker([ "tag", entry.oldImageId, rollbackTag(entry.key) ], { timeout: 10000 });
        } catch {
            /* non-bloquant — l'image sera juste non protégée */
        }
        const exp = new Date(entry.expiresAt).toLocaleString("fr-FR");
        console.log(
      `[ImageWatcher] Rollback disponible pour ${entry.key} jusqu'au ${exp}`,
        );
    }

    async cleanExpiredRollbacks(): Promise<void> {
        if (!tryStartDockerCleanup()) {
            console.log("[ImageWatcher] Expiration rollback reportée — nettoyage Docker déjà en cours");
            return;
        }
        try {
            const now = new Date();
            let changed = false;
            for (const [ key, entry ] of rollbackStore) {
                if (new Date(entry.expiresAt) <= now) {
                    rollbackStore.delete(key);
                    changed = true;
                }
            }
            if (changed) {
                await this.saveRollbackRegistry();
            }
            const retired = await reconcileRollbackKeepTags(this.dataDir, now.getTime());
            if (retired.length) {
                console.log(`[ImageWatcher] ${retired.length} tag(s) keep expiré(s)/orphelin(s) retiré(s)`);
            }
        } finally {
            finishDockerCleanup();
        }
    }

    async performRollback(key: string): Promise<void> {
        const entry = rollbackStore.get(key);
        if (!entry) {
            throw new Error("Aucune entrée de rollback pour cette image");
        }
        if (new Date() > new Date(entry.expiresAt)) {
            rollbackStore.delete(key);
            await this.saveRollbackRegistry();
            throw new Error("Fenêtre de rollback expirée (24h dépassées)");
        }

        const image = withExplicitTag(entry.image);
        const services = entry.services?.length ? entry.services : entry.service ? [ entry.service ] : [];
        console.log(
      `[ImageWatcher] Rollback: ${entry.stack}/${entry.image} → ${entry.oldImageId.slice(0, 19)}`,
        );

        let recreateArgs = [ "up", "-d" ];
        if (services.length > 0) {
            const configCommand = composeExecInvocation(
                entry.composePath,
                [ "config", "--format", "json" ],
                entry.project,
                entry.configFiles,
                entry.workingDir,
                entry.envFiles,
            );
            try {
                const output = await docker(configCommand.args, { cwd: configCommand.cwd,
                    timeout: 30_000 });
                recreateArgs = buildRollbackComposeRecreateArgs(output, services);
            } catch (error) {
                throw composeModelReadError(error);
            }
        }

        // Re-tag l'ancienne image pour lui redonner son nom (détache la nouvelle)
        await docker([ "tag", entry.oldImageId, image ], { timeout: 30000 });
        // Retire le tag de protection — l'image est de nouveau la production active
        try {
            await docker([ "rmi", rollbackTag(entry.key) ], { timeout: 10000 });
        } catch {}
        // Redémarre le container avec l'ancienne image
        const upCommand = composeExecInvocation(entry.composePath, recreateArgs, entry.project, entry.configFiles, entry.workingDir, entry.envFiles);
        await docker(upCommand.args, {
            cwd: upCommand.cwd,
            timeout: 120000,
        });

        rollbackStore.delete(key);
        await this.saveRollbackRegistry();

        // Met à jour le status dans le store
        const newStatus = await this.checkOneImage(entry.image, entry.stack);
        imageStatusStore.set(key, newStatus);
        console.log(
      `[ImageWatcher] Rollback terminé: ${entry.stack}/${entry.image}`,
        );
    }

    async deleteRollbackEntry(key: string): Promise<void> {
        if (!rollbackStore.has(key)) {
            return;
        }
        try {
            // Retire le tag de protection — Docker supprime l'image si plus aucun autre tag ne la référence
            await docker([ "rmi", rollbackTag(key) ], { timeout: 30000 });
        } catch {
            /* déjà supprimée */
        }
        rollbackStore.delete(key);
        await this.saveRollbackRegistry();
    }

    private async checkOneImage(
        image: string,
        stack: string,
        watched?: WatchedComposeStack,
    ): Promise<ImageStatus> {
        const status: ImageStatus = {
            image,
            stack,
            localDigest: "",
            remoteDigest: "",
            hasUpdate: false,
            lastChecked: new Date().toISOString(),
        };
        try {
            const localInfo = await getLocalImageInfo(image);
            const preferredPlatform =
                this.settings.imagePlatform ||
        (localInfo.platform ? platformToString(localInfo.platform) : "");
            const registry = normalizeImage(image).registry;
            const cooldownUntil = this._immediateCycleRunning ? (this.registryCooldownUntil.get(registry) ?? 0) : 0;
            if (cooldownUntil > Date.now()) {
                status.error = `Registry ${registry} en limitation de débit jusqu'à ${new Date(cooldownUntil).toISOString()}`;
                return status;
            }
            let remoteInfo: RemoteDigestInfo;
            try {
                const fetchRemote = () => getRemoteDigest(image, this.settings.credentials, preferredPlatform);
                const cache = this.immediateRemoteCache;
                remoteInfo = await (cache
                    ? reuseCyclePromise(cache, JSON.stringify([ image, preferredPlatform ]), fetchRemote)
                    : fetchRemote());
            } catch (error) {
                if (this._immediateCycleRunning && axios.isAxiosError(error)) {
                    const response = error.response;
                    const delay = registryRateLimitCooldownMs(response?.status ?? 0, response?.headers?.["retry-after"]);
                    if (delay > 0) {
                        this.registryCooldownUntil.set(registry, Date.now() + delay);
                    }
                }
                throw error;
            }

            status.remoteDigest = remoteInfo.platformDigest || remoteInfo.digest;

            const comparableLocalDigests =
                localInfo.repoDigests.length > 0
                    ? localInfo.repoDigests
                    : localInfo.digest
                        ? [ localInfo.digest ]
                        : [];

            const localMatchesRemote =
                comparableLocalDigests.some((digest) =>
                    digestEquals(digest, remoteInfo.platformDigest),
                ) ||
        comparableLocalDigests.some((digest) =>
            digestEquals(digest, remoteInfo.indexDigest),
        );

            status.localDigest =
                comparableLocalDigests.find((digest) =>
                    digestEquals(digest, remoteInfo.platformDigest),
                ) ??
        comparableLocalDigests.find((digest) =>
            digestEquals(digest, remoteInfo.indexDigest),
        ) ??
        localInfo.digest;

            if (!localInfo.comparable) {
                status.hasUpdate = false;
                if (!localMatchesRemote) {
                    status.error = localInfo.digest
                        ? `Digest local non comparable (${localInfo.source})`
                        : "Digest local registry indisponible";
                }
                return status;
            }

            // Docker peut déjà avoir déplacé le tag `latest` vers la nouvelle image
            // alors qu'une autre stack exécute toujours l'ancienne image. Comparer
            // l'ID immuable des conteneurs au tag local, mais seulement si le digest
            // du tag est lui-même cohérent avec la registry.
            let runningDrift = false;
            if (localMatchesRemote && watched && localInfo.imageId && !image.includes("@sha256:")) {
                try {
                    const runningIds = await runningComposeImageIds(image, watched);
                    runningDrift = hasRunningImageDrift(localInfo.imageId, runningIds);
                } catch (error) {
                    // Ne pas inventer un état « à jour » si l'inspection est impossible.
                    status.error = `Impossible de vérifier les conteneurs de ${stack}: ${error instanceof Error ? error.message : String(error)}`;
                    return status;
                }
            }
            // RepoDigests peut contenir le manifest plateforme ou l'index multi-arch.
            status.hasUpdate = (comparableLocalDigests.length > 0 && !localMatchesRemote) || runningDrift;
        } catch (e: unknown) {
            status.error = e instanceof Error ? e.message : String(e);
            console.warn(`[ImageWatcher] ${stack}/${image}: ${status.error}`);
        }
        return status;
    }

    private async notify(
        updates: ImageStatus[],
        totalChecked: number,
        autoUpdated: ImageStatus[] = [],
        cfg: Record<string, AutoUpdateEntry> = {},
        globalWindow: AutomaticImageUpdateWindow | null = null,
    ): Promise<void> {
        const discordNotifier =
            this.settings.discordWebhooks.length > 0
                ? new DiscordNotifier(this.settings.discordWebhooks)
                : null;
        const appriseNotifier = this.settings.appriseServerUrl
            ? new AppriseNotifier(
                this.settings.appriseServerUrl,
                this.settings.appriseUrls,
            )
            : null;
        const uiUrl = this.baseUrl || null;
        const lang = await getNotificationLang();
        const locale = getNotificationLocale(lang);
        const t = (fr: string, en: string, es: string, zhCN: string) => notificationText(lang, fr, en, es, zhCN);
        const hostname: string = (await Settings.get("primaryHostname")) || "";
        const hostnamePrefix = hostname ? `[${hostname}] ` : "";
        const footerHost = hostname ? ` · ${hostname}` : "";

        const autoUpdatedKeys = new Set(
            autoUpdated.map((u) => `${u.stack}::${u.image}`),
        );
        const notAuto = updates.filter(
            (u) => !autoUpdatedKeys.has(`${u.stack}::${u.image}`),
        );
        const scheduledKeys = new Set(notAuto
            .filter((u) => (this.settings.pendingAutoUpdates ?? []).includes(`${u.stack}::${u.image}`)
        || cfg[`${u.stack}::${u.image}`]?.mode === "scheduled")
            .map((u) => `${u.stack}::${u.image}`));
        const scheduled = notAuto.filter((u) => scheduledKeys.has(`${u.stack}::${u.image}`));
        const manual = notAuto.filter(
            (u) => !scheduledKeys.has(`${u.stack}::${u.image}`),
        );

        // Titre selon ce qui s'est passé
        let title: string;
        if (autoUpdated.length > 0 && notAuto.length === 0) {
            title = `${hostnamePrefix}${t(
        `✅ ${autoUpdated.length} image(s) mise(s) à jour automatiquement`,
        `✅ ${autoUpdated.length} image(s) auto-updated`,
        `✅ ${autoUpdated.length} imagen(es) actualizada(s) automáticamente`,
        `✅ ${autoUpdated.length} 个镜像已自动更新`,
            )}`;
        } else if (autoUpdated.length > 0) {
            const parts = [
                autoUpdated.length > 0
                    ? `${autoUpdated.length} ${t("auto", "auto", "auto", "自动")}`
                    : "",
                scheduled.length > 0
                    ? `${scheduled.length} ${t("planifiée(s)", "scheduled", "programada(s)", "计划")}`
                    : "",
                manual.length > 0
                    ? `${manual.length} ${t("manuelle(s)", "manual", "manual(es)", "手动")}`
                    : "",
            ]
                .filter(Boolean)
                .join(", ");
            title = `${hostnamePrefix}${t(
        `🐳 ${updates.length} mise(s) à jour — ${parts}`,
        `🐳 ${updates.length} update(s) — ${parts}`,
        `🐳 ${updates.length} actualización(es) — ${parts}`,
        `🐳 ${updates.length} 个更新 — ${parts}`,
            )}`;
        } else {
            title = `${hostnamePrefix}${t(
        `🐳 ${updates.length} mise(s) à jour disponible(s)`,
        `🐳 ${updates.length} update(s) available`,
        `🐳 ${updates.length} actualización(es) disponible(s)`,
        `🐳 ${updates.length} 个更新可用`,
            )}`;
        }

        const makeField = (u: ImageStatus, wasAutoUpdated: boolean) => {
            const key = `${u.stack}::${u.image}`;
            const entry = cfg[key];
            const isPending = (this.settings.pendingAutoUpdates ?? []).includes(key);
            const isSched = !wasAutoUpdated && (isPending || entry?.mode === "scheduled");
            return {
                name: wasAutoUpdated
                    ? `✅ \`${u.image}\``
                    : isSched
                        ? `🕐 \`${u.image}\``
                        : `🔄 \`${u.image}\``,
                value:
          `${t("Stack", "Stack", "Stack", "堆栈")} : **${u.stack}**\n` +
          (wasAutoUpdated
              ? t("Mise à jour immédiate effectuée.", "Immediate update applied.", "Actualización inmediata aplicada.", "已执行即时更新。")
              : isSched
                  ? globalWindow
                      ? t(
                    `Mise à jour mise en attente du créneau global **${globalWindow.start}–${globalWindow.end}**.`,
                    `Update queued for the global **${globalWindow.start}–${globalWindow.end}** window.`,
                    `Actualización en espera de la ventana global **${globalWindow.start}–${globalWindow.end}**.`,
                    `更新已排队，等待全局时段 **${globalWindow.start}–${globalWindow.end}**。`,
                      )
                      : t(
                    `Mise à jour planifiée à **${entry!.time}**.`,
                    `Scheduled update at **${entry!.time}**.`,
                    `Actualización programada a las **${entry!.time}**.`,
                    `计划于 **${entry!.time}** 更新。`,
                      )
                  : `${t("Distant", "Remote", "Remoto", "远程")} : \`${u.remoteDigest.slice(0, 19)}…\`\n` +
                (u.localDigest
                    ? `${t("Local", "Local", "Local", "本地")}   : \`${u.localDigest.slice(0, 19)}…\``
                    : t(
                        "⚠️ Image non présente localement",
                        "⚠️ Image not present locally",
                        "⚠️ La imagen no está disponible localmente",
                        "⚠️ 本地不存在该镜像",
                    ))),
                inline: false,
            };
        };

        const description =
      `${totalChecked} ${t("image(s) vérifiée(s)", "image(s) checked", "imagen(es) comprobada(s)", "个镜像已检查")} · ${new Date().toLocaleString(locale)}\n` +
      (notAuto.length > 0
          ? uiUrl
              ? `[${t("Ouvrir Dockge", "Open Dockge", "Abrir Dockge", "打开 Dockge")}](${uiUrl}) ${t("pour décider des mises à jour en attente.", "to review pending updates.", "para revisar las actualizaciones pendientes.", "以查看待处理更新。")}`
              : t(
                  "Connectez-vous à **Dockge** pour décider des mises à jour en attente.",
                  "Log in to **Dockge** to review pending updates.",
                  "Inicia sesión en **Dockge** para revisar las actualizaciones pendientes.",
                  "登录 **Dockge** 以查看待处理更新。",
              )
          : "");

        const fields = [
            ...autoUpdated.map((u) => makeField(u, true)),
            ...notAuto.map((u) => makeField(u, false)),
        ];

        if (discordNotifier) {
            await discordNotifier.sendEmbed({
                title,
                color:
          autoUpdated.length > 0 && notAuto.length === 0 ? 0x22c55e : 0xf59e0b,
                url: uiUrl ?? undefined,
                description,
                fields,
                footer: `Dockge Enhanced — Image Watcher${footerHost}`,
            });
        }

        if (appriseNotifier) {
            const imageLines = fields
                .map((f) => `**${f.name}**\n${f.value}`)
                .join("\n\n");
            await appriseNotifier.send({
                title,
                body: `${description}\n\n${imageLines}`.trim(),
                type:
          autoUpdated.length > 0 && notAuto.length === 0
              ? "success"
              : "warning",
            });
        }
    }
}
