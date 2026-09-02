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
import {
  acceptedComposeFileNames,
  envsubstYAML,
} from "../../common/util-common";
import {
  DockerRegistryCredential,
  normalizeRegistryHost,
  syncDockerRegistryCredentials,
} from "../registry-auth";
import { isUpdatePaused, normalizeUpdatePause, UpdatePause } from "./update-policy";

const execFileAsync = promisify(execFile);

const STACKS_DIR = process.env.DOCKGE_STACKS_DIR ?? "/opt/stacks";
const DATA_DIR = process.env.DOCKGE_DATA_DIR ?? "/opt/dockge/data";
const SETTINGS_PATH = path.join(DATA_DIR, "watcher-settings.json");
const ROLLBACK_PATH = path.join(DATA_DIR, "rollback-registry.json");
const UPDATE_HISTORY_PATH = path.join(DATA_DIR, "update-history.json");

const ROLLBACK_WINDOW_MS = 24 * 3_600_000; // 24 heures
const UPDATE_HISTORY_MAX = 100;
const MANAGED_DOZZLE_STACK = "dozzle-dockge-enhanced";
const MANAGED_DOZZLE_IMAGE = "amir20/dozzle:latest";

export function isMandatoryManagedUpdate(status: Pick<ImageStatus, "stack" | "image">): boolean {
  return status.stack === MANAGED_DOZZLE_STACK && status.image === MANAGED_DOZZLE_IMAGE;
}

// Génère un tag Docker local qui protège l'ancienne image des `docker image prune`
function rollbackTag(key: string): string {
  const safe = key
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, "-")
    .slice(0, 80);
  return `dockge-rollback-${safe}:keep`;
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
  service: string | null; // nom du service docker compose
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
  mode: "immediate" | "scheduled";
  success: boolean;
  error?: string;
}

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
    const [n, d] = name.split("@");
    return { registry, name: n, tag: d };
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

  return { registry, name, tag };
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
    if (!/^[a-z0-9][a-z0-9._-]*$/i.test(segment)) throw new Error("Nom d’image invalide");
    return encodeURIComponent(segment);
  }).join("/");
  if (!/^[a-z0-9_][a-z0-9_.-]{0,127}$/i.test(tag)) throw new Error("Tag d’image invalide");
  return `https://${safeRegistry}/v2/${safeName}/manifests/${encodeURIComponent(tag)}`;
}

interface LocalImageInfo {
  digest: string;
  repoDigests: string[];
  comparable: boolean;
  source: "repoDigest" | "digest" | "none";
  platform?: ImagePlatform;
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
  if (!raw) return null;
  const [os, architecture, variant] = raw
    .split("/")
    .map((v) => v.trim())
    .filter(Boolean);
  if (!os || !architecture) return null;
  return { os, architecture: normalizeArch(architecture), variant };
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
  if (!candidate) return false;
  if (candidate.os !== wanted.os) return false;
  if (candidate.architecture !== wanted.architecture) return false;

  // Si une variante est explicitement demandée, elle doit matcher quand le manifest la précise.
  if (
    wanted.variant &&
    candidate.variant &&
    candidate.variant !== wanted.variant
  )
    return false;

  return true;
}

function digestEquals(a: string, b: string): boolean {
  if (!a || !b) return false;
  const norm = (d: string) => d.replace(/^[^:]+:/, "");
  return norm(a) === norm(b);
}

function extractShaDigest(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.match(/sha256:[a-f0-9]{64}/)?.[0] ?? "";
}

function normalizeRepoName(value: string): string {
  let repo = value.trim().toLowerCase();
  if (!repo) return "";
  if (repo.includes("@")) repo = repo.split("@")[0];
  if (repo.includes(":") && repo.lastIndexOf(":") > repo.lastIndexOf("/")) {
    repo = repo.slice(0, repo.lastIndexOf(":"));
  }
  if (repo.startsWith("docker.io/")) repo = repo.slice("docker.io/".length);
  if (repo.startsWith("registry-1.docker.io/")) {
    repo = repo.slice("registry-1.docker.io/".length);
  }
  if (!repo.includes("/")) repo = `library/${repo}`;
  return repo;
}

function findRepoDigestsForImage(image: string, repoDigests: unknown): string[] {
  if (!Array.isArray(repoDigests)) return [];
  const digests = repoDigests.filter(
    (digest): digest is string =>
      typeof digest === "string" && digest.includes("@sha256:"),
  );
  if (digests.length === 0) return [];

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
  if (!realmM) return "";

  const params = new URLSearchParams();
  if (serviceM) params.set("service", serviceM[1]);
  if (scopeM) params.set("scope", scopeM[1]);
  const realm = new URL(realmM[1]);
  if (realm.protocol !== "https:" || realm.username || realm.password || realm.hash) return "";
  realm.search = params.toString();
  const tokenUrl = realm.toString();

  // Utilise les credentials si disponibles (registry exact ou domaine du realm)
  const cred = credentials.find(
    (c) => c.registry === registry || assertRegistryHost(c.registry) === realm.host,
  );

  try {
    const res = cred
      ? await axios.get(tokenUrl, {
          auth: { username: cred.username, password: cred.token },
          timeout: 10000,
          maxRedirects: 0,
        })
      : await axios.get(tokenUrl, { timeout: 10000, maxRedirects: 0 });
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
    return { digest: tag, platformDigest: tag, indexDigest: "", platform };
  }

  const manifestUrl = buildManifestUrl(registry, name, tag);

  let auth = await getInitialAuth(registry, name, credentials);

  const makeHeaders = (): Record<string, string> => {
    const h: Record<string, string> = { Accept: MANIFEST_ACCEPT };
    if (auth) h["Authorization"] = auth;
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

  const res = await fetchManifest();
  const contentType = String(res.headers["content-type"] ?? "");
  const indexDigest = String(res.headers["docker-content-digest"] ?? "");

  if (!isManifestList(contentType)) {
    if (!indexDigest)
      throw new Error("Header Docker-Content-Digest absent dans la réponse");
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
  if (image.includes("@")) return image;
  const colonIdx = image.lastIndexOf(":");
  if (colonIdx > image.lastIndexOf("/")) return image;
  return `${image}:latest`;
}

export function composeExecInvocation(
  composePath: string,
  args: string[],
): { args: string[]; cwd: string } {
  const composeDir = path.dirname(composePath);
  const composeFile = path.basename(composePath);
  return {
    args: [ "compose", "-f", composeFile, ...args ],
    cwd: composeDir,
  };
}

async function docker(args: string[], options: { cwd?: string; timeout: number }): Promise<string> {
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
  if (!Number.isFinite(interval)) return fallback;
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
      repoDigests,
      comparable: repoDigests.length > 0,
      source: repoDigests.length > 0 ? "repoDigest" : looseDigest ? "digest" : "none",
      platform:
        os && architecture
          ? { os, architecture: normalizeArch(architecture), variant }
          : undefined,
    };
  } catch {
    return { digest: "", repoDigests: [], comparable: false, source: "none" };
  }
}

/** Lit le YAML brut en repli lorsque Docker Compose ne peut pas résoudre la stack. */
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
    raw = envsubstYAML(raw, { ...fileEnv, ...shellEnv });
    const doc = yaml.load(raw) as Record<string, unknown>;
    if (!doc?.services) return [];
    const images: string[] = [];
    for (const svc of Object.values(doc.services as Record<string, unknown>)) {
      if (!svc || typeof svc !== "object") continue;
      const service = svc as Record<string, unknown>;
      // Champ image direct
      if (typeof service.image === "string" && service.image) {
        images.push(service.image.trim());
        continue;
      }
      // js-yaml v4 ne résout pas les ancres <<: (YAML merge keys) — elles apparaissent
      // comme une clé littérale "<<" pointant vers l'objet fusionné. On inspecte ce niveau.
      const mergeVal = service["<<"];
      if (mergeVal && typeof mergeVal === "object") {
        const merged = mergeVal as Record<string, unknown>;
        if (typeof merged.image === "string" && merged.image) {
          images.push(merged.image.trim());
        }
      }
    }
    return [...new Set(images)];
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
 * `config --images` prend en charge les variables, ancres, extends et includes.
 */
async function extractImagesFromCompose(composePath: string): Promise<string[]> {
  const configCommand = composeExecInvocation(composePath, [ "config", "--images" ]);
  try {
    const stdout = await docker(configCommand.args, {
      cwd: configCommand.cwd,
      timeout: 30000,
    });
    return [
      ...new Set(
        stdout
          .split(/\r?\n/)
          .map((image) => image.trim())
          .filter(Boolean),
      ),
    ];
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

// ─── Classe principale ────────────────────────────────────────────

export class ImageWatcher {
  private static _instance: ImageWatcher;
  private cronJob: cron.ScheduledTask | null = null;
  private minuteCron: cron.ScheduledTask | null = null;
  private cleanupCron: cron.ScheduledTask | null = null;
  private baseUrl: string = "";
  private _checkRunning = false;
  private _updatingImages = new Set<string>();

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
    globalUpdatePause: { enabled: false, until: null },
  };

  static getInstance(): ImageWatcher {
    if (!ImageWatcher._instance) ImageWatcher._instance = new ImageWatcher();
    return ImageWatcher._instance;
  }

  // ── Persistance ───────────────────────────────────────────────

  async loadSettings(): Promise<void> {
    try {
      const raw = await fs.readFile(SETTINGS_PATH, "utf8");
      const data = JSON.parse(raw) as Record<string, unknown>;
      // Migration : ancien champ discordWebhook (string) → discordWebhooks (string[])
      if (typeof data.discordWebhook === "string" && !data.discordWebhooks) {
        data.discordWebhooks = data.discordWebhook ? [data.discordWebhook] : [];
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
          if (value && typeof value === "object") value.pause = normalizeUpdatePause(value.pause);
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

  async saveSettings(partial: Partial<WatcherSettings>): Promise<void> {
    this.settings = { ...this.settings, ...partial };
    this.settings.credentials = this.settings.credentials.map((credential) => ({
      ...credential,
      registry: normalizeRegistryHost(credential.registry),
    }));
    await this.persistToFile();
    await syncDockerRegistryCredentials(this.settings.credentials);
    this.restart();
  }

  /** Écrit les settings sur disque SANS redémarrer le watcher (usage interne) */
  private async persistToFile(): Promise<void> {
    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.writeFile(SETTINGS_PATH, JSON.stringify(this.settings, null, 2), { mode: 0o600 });
    await fs.chmod(SETTINGS_PATH, 0o600).catch(() => {});
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
    return [...new Set(this.settings.credentials.map((credential) => normalizeRegistryHost(credential.registry)).filter(Boolean))];
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
      updatingImages: [...this._updatingImages],
      globalUpdatePause: normalizeUpdatePause(this.settings.globalUpdatePause),
    };
  }

  isBusy(): boolean {
    return this._checkRunning || this._updatingImages.size > 0;
  }

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
    if (this.settings.enabled) this.start();
  }

  private async _loadUpdateHistory(): Promise<void> {
    try {
      const raw = await fs.readFile(UPDATE_HISTORY_PATH, "utf8");
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
      await fs.unlink(UPDATE_HISTORY_PATH);
    } catch {
      /* ignore */
    }
  }

  start(): void {
    this.stop();
    const intervalHours = sanitizeIntervalHours(this.settings.intervalHours);
    this.settings.intervalHours = intervalHours;
    const expr = `0 */${intervalHours} * * *`;
    console.log(
      `[ImageWatcher] Démarrage — vérification toutes les ${intervalHours}h`,
    );
    this.cronJob = cron.schedule(expr, () => this.runCheck());
    // Cron minutaire pour appliquer les màj planifiées
    this.minuteCron = cron.schedule("* * * * *", () =>
      this.applyPendingUpdates().catch(console.error),
    );
    // Cron horaire pour supprimer les anciennes images dont le rollback a expiré
    this.cleanupCron = cron.schedule("0 * * * *", () =>
      this.cleanExpiredRollbacks().catch(console.error),
    );
    // Check immédiat au démarrage
    this.runCheck().catch(console.error);
  }

  stop(): void {
    this.cronJob?.stop();
    this.cronJob = null;
    this.minuteCron?.stop();
    this.minuteCron = null;
    this.cleanupCron?.stop();
    this.cleanupCron = null;
  }

  restart(): void {
    this.settings.enabled ? this.start() : this.stop();
  }

  // ── Check principal ───────────────────────────────────────────

  async runCheck(): Promise<ImageStatus[]> {
    if (this._checkRunning) {
      console.log("[ImageWatcher] Check déjà en cours, ignoré.");
      return [];
    }
    this._checkRunning = true;
    log.info("image-watcher", "Vérification des images démarrée");
    const results: ImageStatus[] = [];

    let entries: string[];
    try {
      entries = await fs.readdir(STACKS_DIR);
    } catch {
      console.error(`[ImageWatcher] Impossible de lire ${STACKS_DIR}`);
      this._checkRunning = false;
      return [];
    }

    // Collecte les clés traitées ce cycle pour purger les entrées obsolètes
    const processedKeys = new Set<string>();
    // Map stack → composePath pour l'auto-update
    const composePathByStack = new Map<string, string>();

    for (const stack of entries) {
      try {
        const composePath = await findComposePath(path.join(STACKS_DIR, stack));
        if (!composePath) continue;
        composePathByStack.set(stack, composePath);

        const images = await extractImagesFromCompose(composePath);
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
              ? { ...prev, ignored: true, hasUpdate: false }
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
          const status = await this.checkOneImage(image, stack);
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

    const toImmediate: ImageStatus[] = [];
    const newlyPending: string[] = [];

    const globalPaused = isUpdatePaused(this.settings.globalUpdatePause);
    for (const r of updates) {
      const key = `${r.stack}::${r.image}`;
      const cfg = autoUpdateConfig[key];
      if (globalPaused || isUpdatePaused(cfg?.pause)) continue;
      if (isMandatoryManagedUpdate(r)) {
        toImmediate.push(r);
        continue;
      }
      if (!cfg) continue;
      if (cfg.mode === "immediate") {
        toImmediate.push(r);
      } else if (cfg.mode === "scheduled" && !currentPending.has(key)) {
        newlyPending.push(key);
      }
    }

    // Enregistre les nouvelles màj en attente (sans restart — watcher déjà actif)
    if (newlyPending.length > 0) {
      const merged = [...currentPending, ...newlyPending];
      this.settings.pendingAutoUpdates = merged;
      await this.persistToFile();
      console.log(
        `[ImageWatcher] ${newlyPending.length} image(s) mise(s) en attente de màj planifiée`,
      );
    }

    // Applique les màj immédiates
    const autoUpdated: ImageStatus[] = [];
    for (const item of toImmediate) {
      const composePath = composePathByStack.get(item.stack);
      if (composePath) {
        const success = await this.performAutoUpdate(
          item,
          composePath,
          "immediate",
        );
        if (success) autoUpdated.push(item);
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
    const pending = this.settings.pendingAutoUpdates ?? [];
    if (pending.length === 0) return;

    const now = new Date();
    const currentTime = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;

    if (isUpdatePaused(this.settings.globalUpdatePause)) return;

    const toApply = pending.filter((key) => {
      const cfg = this.settings.autoUpdateConfig?.[key];
      return cfg?.mode === "scheduled" && cfg.time === currentTime && !isUpdatePaused(cfg.pause);
    });
    if (toApply.length === 0) return;

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
    for (const key of toApply) {
      const sepIdx = key.indexOf("::");
      if (sepIdx === -1) continue;
      const stack = key.slice(0, sepIdx);
      const image = key.slice(sepIdx + 2);

      // Trouve le fichier compose
      const composePath = await findComposePath(path.join(STACKS_DIR, stack));
      if (!composePath) continue;

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
        composePath,
        "scheduled",
      );
      if (success) applied.push(status);
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

  /** Trouve le nom du service docker compose qui utilise une image donnée */
  private findServiceForImage(
    composePath: string,
    image: string,
  ): string | null {
    try {
      const raw = fsSync.readFileSync(composePath, "utf8");
      const doc = yaml.load(raw) as Record<string, unknown>;
      if (!doc?.services) return null;
      const services = doc.services as Record<string, { image?: string }>;
      for (const [name, svc] of Object.entries(services)) {
        if (svc?.image?.trim() === image.trim()) return name;
      }
    } catch {
      /* ignore */
    }
    return null;
  }

  /** Tire et redémarre une image via docker compose. Retourne true si succès. */
  private async performAutoUpdate(
    status: ImageStatus,
    composePath: string,
    mode: "immediate" | "scheduled" = "immediate",
  ): Promise<boolean> {
    const key = `${status.stack}::${status.image}`;
    if (this._updatingImages.has(key)) {
      console.log(`[ImageWatcher] Auto-update ${key} déjà en cours, ignorée.`);
      return false;
    }
    this._updatingImages.add(key);
    const service = this.findServiceForImage(composePath, status.image);
    const services = service ? [ service ] : [];
    console.log(
      `[ImageWatcher] Auto-update: ${status.stack}/${status.image}${service ? ` (service: ${service})` : ""}`,
    );
    const oldDigest = status.localDigest ?? "";
    try {
      // ── Capture l'ID de l'image actuelle avant le pull (pour rollback) ──
      let oldImageId = "";
      try {
        const ref = withExplicitTag(status.image);
        const stdout = await docker([ "image", "inspect", "--format", "{{.Id}}", ref ], { timeout: 10000 });
        oldImageId = stdout.trim();
      } catch {
        /* image absente localement, rollback impossible */
      }

      const pullCommand = composeExecInvocation(composePath, [ "pull", ...services ]);
      await docker(pullCommand.args, {
        cwd: pullCommand.cwd,
        timeout: 600000,
      });
      const upCommand = composeExecInvocation(composePath, [ "up", "-d", ...services ]);
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
          service: service ?? null,
          oldImageId,
          updatedAt: now.toISOString(),
          expiresAt: new Date(now.getTime() + ROLLBACK_WINDOW_MS).toISOString(),
        });
      }

      // Recheck pour mettre à jour le digest dans le store
      const newStatus = await this.checkOneImage(status.image, status.stack);
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
    if (updateHistoryStore.length > UPDATE_HISTORY_MAX)
      updateHistoryStore.splice(UPDATE_HISTORY_MAX);
    try {
      await fs.mkdir(DATA_DIR, { recursive: true });
      await fs.writeFile(
        UPDATE_HISTORY_PATH,
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
    if (!existing.includes(digest)) existing.push(digest);
    ignoredDigests[key] = existing;
    // Mise à jour du store immédiatement sans redémarrer le watcher
    this.settings = { ...this.settings, ignoredDigests };
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
    this.settings = { ...this.settings, ignoredDigests };
    const current = imageStatusStore.get(key);
    if (current?.ignoredDigest) {
      const [stack, image] = key.split("::");
      if (stack && image) {
        imageStatusStore.set(key, await this.checkOneImage(image, stack));
      } else {
        const { ignoredDigest: _, ...rest } = current;
        imageStatusStore.set(key, { ...rest, hasUpdate: false });
      }
    }
    await this.persistToFile();
  }

  // ── Rollback ──────────────────────────────────────────────────────

  private async loadRollbackRegistry(): Promise<void> {
    try {
      const raw = await fs.readFile(ROLLBACK_PATH, "utf8");
      const entries = JSON.parse(raw) as RollbackEntry[];
      rollbackStore.clear();
      const now = new Date();
      for (const e of entries) {
        if (new Date(e.expiresAt) > now) rollbackStore.set(e.key, e);
      }
      console.log(
        `[ImageWatcher] Registre rollback chargé — ${rollbackStore.size} entrée(s) active(s)`,
      );
    } catch {
      /* première utilisation */
    }
  }

  private async saveRollbackRegistry(): Promise<void> {
    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.writeFile(
      ROLLBACK_PATH,
      JSON.stringify([...rollbackStore.values()], null, 2),
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
    const now = new Date();
    let changed = false;
    for (const [key, entry] of rollbackStore) {
      if (new Date(entry.expiresAt) <= now) {
        console.log(
          `[ImageWatcher] Expiration rollback — suppression image ${entry.oldImageId.slice(0, 19)}`,
        );
        try {
          await docker([ "rmi", rollbackTag(key) ], { timeout: 10000 });
        } catch {}
        try {
          await docker([ "rmi", entry.oldImageId ], { timeout: 30000 });
        } catch {
          /* peut déjà être supprimée ou utilisée ailleurs */
        }
        rollbackStore.delete(key);
        changed = true;
      }
    }
    if (changed) await this.saveRollbackRegistry();
  }

  async performRollback(key: string): Promise<void> {
    const entry = rollbackStore.get(key);
    if (!entry) throw new Error("Aucune entrée de rollback pour cette image");
    if (new Date() > new Date(entry.expiresAt)) {
      rollbackStore.delete(key);
      await this.saveRollbackRegistry();
      throw new Error("Fenêtre de rollback expirée (24h dépassées)");
    }

    const image = withExplicitTag(entry.image);
    const services = entry.service ? [ entry.service ] : [];
    console.log(
      `[ImageWatcher] Rollback: ${entry.stack}/${entry.image} → ${entry.oldImageId.slice(0, 19)}`,
    );

    // Re-tag l'ancienne image pour lui redonner son nom (détache la nouvelle)
    await docker([ "tag", entry.oldImageId, image ], { timeout: 30000 });
    // Retire le tag de protection — l'image est de nouveau la production active
    try {
      await docker([ "rmi", rollbackTag(entry.key) ], { timeout: 10000 });
    } catch {}
    // Redémarre le container avec l'ancienne image
    const upCommand = composeExecInvocation(entry.composePath, [ "up", "-d", ...services ]);
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
    if (!rollbackStore.has(key)) return;
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
      const remoteInfo = await getRemoteDigest(
        image,
        this.settings.credentials,
        preferredPlatform,
      );

      status.remoteDigest = remoteInfo.platformDigest || remoteInfo.digest;

      const comparableLocalDigests =
        localInfo.repoDigests.length > 0
          ? localInfo.repoDigests
          : localInfo.digest
            ? [localInfo.digest]
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

      // Selon Docker/Podman et le mode rootless, RepoDigests peut contenir soit le digest
      // du manifest plateforme, soit celui de l'index multi-arch. On accepte les deux.
      status.hasUpdate = comparableLocalDigests.length > 0 && !localMatchesRemote;
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
    const scheduled = notAuto.filter(
      (u) => cfg[`${u.stack}::${u.image}`]?.mode === "scheduled",
    );
    const manual = notAuto.filter(
      (u) => cfg[`${u.stack}::${u.image}`]?.mode !== "scheduled",
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
      const isSched = !wasAutoUpdated && entry?.mode === "scheduled";
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
              ? t(
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
