/**
 * SelfUpdateChecker — Vérifie si une nouvelle image de Dockge-Enhanced
 * est disponible sur GHCR et notifie via la WebUI + Discord.
 *
 * Fréquence : au démarrage (après 30s) puis toutes les 6h.
 * Notification Discord : une seule fois par digest distant (pas de spam).
 */

import * as http from "http";
import * as fs from "fs/promises";
import * as path from "path";
import axios from "axios";
import { DiscordNotifier } from "../notification/discord";
import { AppriseNotifier } from "../notification/apprise";
import { Settings } from "../settings";

const SELF_REPO = "aerya/dockge-enhanced";
const SELF_TAG = "latest";
const DATA_DIR = process.env.DOCKGE_DATA_DIR ?? "/opt/dockge/data";
const SETTINGS_PATH = path.join(DATA_DIR, "watcher-settings.json");
const DIGEST_CACHE = path.join(DATA_DIR, "self-update-digest.json");
const DOCKER_SOCKET =
  process.env.DOCKGE_DOCKER_SOCKET ?? "/var/run/docker.sock";
const CHECK_INTERVAL = 6 * 60 * 60 * 1000; // 6h
const STARTUP_DELAY = 30_000; // 30s après démarrage

interface ImagePlatform {
  os: string;
  architecture: string;
  variant?: string;
}

interface RemoteDigestInfo {
  platformDigest: string;
  indexDigest: string;
  platform: ImagePlatform;
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

function platformMatches(candidate: any, wanted: ImagePlatform): boolean {
  if (!candidate) return false;
  if (candidate.os !== wanted.os) return false;
  if (candidate.architecture !== wanted.architecture) return false;
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

// ─── Helpers ──────────────────────────────────────────────────────

async function fetchRemoteDigest(
  preferredPlatform = "",
): Promise<RemoteDigestInfo> {
  // GHCR_TOKEN = GitHub PAT avec scope read:packages (requis si repo privé)
  const ghcrToken = process.env.GHCR_TOKEN?.trim() ?? "";
  const platform = getCurrentPlatform(preferredPlatform);

  let token = "";
  try {
    const res = await axios.get(
      `https://ghcr.io/token?scope=repository:${SELF_REPO}:pull`,
      {
        timeout: 10000,
        ...(ghcrToken
          ? { auth: { username: "token", password: ghcrToken } }
          : {}),
      },
    );
    token = res.data.token ?? "";
  } catch {
    /* continue sans token si repo public */
  }

  const headers: Record<string, string> = {
    Accept: [
      "application/vnd.docker.distribution.manifest.list.v2+json",
      "application/vnd.docker.distribution.manifest.v2+json",
      "application/vnd.oci.image.index.v1+json",
      "application/vnd.oci.image.manifest.v1+json",
    ].join(", "),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const url = `https://ghcr.io/v2/${SELF_REPO}/manifests/${SELF_TAG}`;
  const res = await axios.get(url, { headers, timeout: 15000 });

  const indexDigest = String(res.headers["docker-content-digest"] ?? "");
  const manifests = Array.isArray(res.data?.manifests)
    ? res.data.manifests
    : [];

  if (manifests.length === 0) {
    if (!indexDigest)
      throw new Error(
        "Header docker-content-digest absent dans la réponse GHCR",
      );
    return { platformDigest: indexDigest, indexDigest: "", platform };
  }

  const match = manifests.find((m: any) =>
    platformMatches(m.platform, platform),
  );
  if (!match?.digest) {
    const available = manifests
      .map((m: any) => (m.platform ? platformToString(m.platform) : ""))
      .filter(Boolean)
      .join(", ");

    throw new Error(
      `Aucun manifest distant Dockge-Enhanced pour ${platformToString(platform)}` +
        (available ? `. Plateformes disponibles: ${available}` : ""),
    );
  }

  return {
    platformDigest: String(match.digest),
    indexDigest,
    platform,
  };
}

/** Appel HTTP via le socket Docker (sans CLI). */
function dockerSocketGet(apiPath: string): Promise<any> {
  return new Promise((resolve) => {
    const req = http.request(
      { socketPath: DOCKER_SOCKET, path: apiPath, method: "GET" },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          try {
            resolve(JSON.parse(data));
          } catch {
            resolve(null);
          }
        });
      },
    );
    req.on("error", () => resolve(null));
    req.end();
  });
}

async function fetchLocalImageInfo(): Promise<{
  digest: string;
  comparable: boolean;
  source: "repoDigest" | "none";
  platform?: ImagePlatform;
}> {
  try {
    // HOSTNAME = ID court du conteneur dans Docker
    const id = process.env.HOSTNAME ?? "";
    if (!id) return { digest: "" };
    const container = await dockerSocketGet(`/containers/${id}/json`);
    const imageId: string = container?.Image ?? "";
    if (!imageId) return { digest: "" };
    const image = await dockerSocketGet(`/images/${imageId}/json`);
    const repoDigests: string[] = Array.isArray(image?.RepoDigests)
      ? image.RepoDigests
      : [];
    const digest =
      repoDigests.find(
        (d) =>
          typeof d === "string" &&
          d.includes("dockge-enhanced") &&
          d.includes("@sha256:"),
      ) ?? "";
    const os = typeof image?.Os === "string" ? image.Os : "";
    const architecture =
      typeof image?.Architecture === "string" ? image.Architecture : "";
    const variant =
      typeof image?.Variant === "string" ? image.Variant : undefined;

    return {
      digest: extractShaDigest(digest),
      comparable: !!digest,
      source: digest ? "repoDigest" : "none",
      platform:
        os && architecture
          ? { os, architecture: normalizeArch(architecture), variant }
          : undefined,
    };
  } catch {
    return { digest: "", comparable: false, source: "none" };
  }
}

/** Récupère le nom du conteneur courant via le socket Docker (sans CLI). */
async function fetchContainerName(): Promise<string> {
  try {
    const id = process.env.HOSTNAME ?? "";
    if (!id) return "dockge-enhanced";
    const container = await dockerSocketGet(`/containers/${id}/json`);
    return (container?.Name ?? "").replace(/^\//, "") || "dockge-enhanced";
  } catch {
    return "dockge-enhanced";
  }
}

/** Lit les webhooks Discord depuis les settings du watcher images. */
async function loadWebhooks(): Promise<string[]> {
  // Essaie successivement watcher-settings.json (image-watcher) puis trivy-settings.json
  const candidates = [
    path.join(DATA_DIR, "watcher-settings.json"),
    path.join(DATA_DIR, "trivy-settings.json"),
    path.join(DATA_DIR, "backup-settings.json"),
  ];
  for (const p of candidates) {
    try {
      const raw = await fs.readFile(p, "utf8");
      const data = JSON.parse(raw) as Record<string, unknown>;
      const webhooks = data?.discordWebhooks;
      if (Array.isArray(webhooks) && webhooks.length > 0)
        return webhooks as string[];
    } catch {
      /* fichier absent, on essaie le suivant */
    }
  }
  return [];
}

// ─── Types exposés au router ──────────────────────────────────────

export interface SelfUpdateStatus {
  updateAvailable: boolean;
  localDigest: string;
  remoteDigest: string;
  containerName: string;
  checkedAt: string | null;
  error: string | null;
}

// ─── Singleton ────────────────────────────────────────────────────

export class SelfUpdateChecker {
  private static _instance: SelfUpdateChecker;

  private _status: SelfUpdateStatus = {
    updateAvailable: false,
    localDigest: "",
    remoteDigest: "",
    containerName: "dockge-enhanced",
    checkedAt: null,
    error: null,
  };

  /** Digest distant pour lequel on a déjà envoyé la notif "dispo" (évite le spam) */
  private _notifiedRemoteDigest = "";
  /** Dernier digest local connu, persisté sur disque pour survivre aux redémarrages */
  private _lastKnownLocalDigest = "";

  private _startupTimer: ReturnType<typeof setTimeout> | null = null;
  private _intervalTimer: ReturnType<typeof setInterval> | null = null;

  static getInstance(): SelfUpdateChecker {
    if (!this._instance) this._instance = new SelfUpdateChecker();
    return this._instance;
  }

  getStatus(): SelfUpdateStatus {
    return { ...this._status };
  }

  start(): void {
    this._loadDigestCache().then(() => {
      this._startupTimer = setTimeout(() => this.check(), STARTUP_DELAY);
      this._intervalTimer = setInterval(() => this.check(), CHECK_INTERVAL);
    });
  }

  private async _loadDigestCache(): Promise<void> {
    try {
      const raw = await fs.readFile(DIGEST_CACHE, "utf8");
      const data = JSON.parse(raw) as Record<string, unknown>;
      this._lastKnownLocalDigest =
        typeof data.localDigest === "string" ? data.localDigest : "";
    } catch {
      /* premier démarrage */
    }
  }

  private async _saveDigestCache(localDigest: string): Promise<void> {
    try {
      await fs.mkdir(DATA_DIR, { recursive: true });
      await fs.writeFile(DIGEST_CACHE, JSON.stringify({ localDigest }));
    } catch {
      /* non bloquant */
    }
  }

  stop(): void {
    if (this._startupTimer) clearTimeout(this._startupTimer);
    if (this._intervalTimer) clearInterval(this._intervalTimer);
  }

  async check(): Promise<void> {
    try {
      const [localInfo, containerName] = await Promise.all([
        fetchLocalImageInfo(),
        fetchContainerName(),
      ]);
      const preferredPlatform = localInfo.platform
        ? platformToString(localInfo.platform)
        : "";
      const remoteInfo = await fetchRemoteDigest(preferredPlatform);
      const localDigest = localInfo.digest;
      const remoteDigest = remoteInfo.platformDigest;

      // Docker/Podman peuvent exposer dans RepoDigests soit le digest du manifest plateforme,
      // soit celui de l'index multi-arch. On accepte les deux pour éviter les faux positifs ARM64.
      const updateAvailable = !!(
        localInfo.comparable &&
        localDigest &&
        remoteDigest &&
        !digestEquals(localDigest, remoteInfo.platformDigest) &&
        !digestEquals(localDigest, remoteInfo.indexDigest)
      );

      // Détecte une mise à jour appliquée automatiquement (digest local a changé)
      const wasUpdated = !!(
        localDigest &&
        this._lastKnownLocalDigest &&
        localDigest !== this._lastKnownLocalDigest
      );

      if (localDigest && localDigest !== this._lastKnownLocalDigest) {
        this._lastKnownLocalDigest = localDigest;
        await this._saveDigestCache(localDigest);
      }

      this._status = {
        updateAvailable,
        localDigest,
        remoteDigest,
        containerName,
        checkedAt: new Date().toISOString(),
        error: localInfo.comparable
          ? null
          : "Digest local registry indisponible",
      };

      // Notif "mise à jour appliquée" — le digest local a changé depuis le dernier check
      if (wasUpdated) {
        await this._notifyApplied(containerName, localDigest);
      }

      // Notif "mise à jour disponible" — une seule fois par digest distant
      if (updateAvailable && this._notifiedRemoteDigest !== remoteDigest) {
        this._notifiedRemoteDigest = remoteDigest;
        await this._notifyAvailable(containerName);
      }
    } catch (e: any) {
      this._status = {
        ...this._status,
        checkedAt: new Date().toISOString(),
        error: e?.message ?? "Erreur inconnue",
      };
    }
  }

  private async _notifyAvailable(containerName: string): Promise<void> {
    const webhooks = await loadWebhooks();
    const apprise = await this._loadApprise();
    if (webhooks.length === 0 && !apprise) return;

    const hostname = (await Settings.get("primaryHostname")) || "";
    const hostnamePrefix = hostname ? `[${hostname}] ` : "";
    const footerHost = hostname ? ` · ${hostname}` : "";

    const title = `${hostnamePrefix}🔔 Mise à jour Dockge-Enhanced disponible`;
    const body = [
      "Une nouvelle image est disponible sur GHCR.",
      "",
      "**Pour mettre à jour :**",
      "```bash",
      `docker pull ghcr.io/${SELF_REPO}:${SELF_TAG}`,
      `docker compose up -d`,
      "```",
      "_Exécuter depuis le dossier contenant votre compose.yaml_",
    ].join("\n");

    if (webhooks.length > 0) {
      await new DiscordNotifier(webhooks).sendEmbed({
        title,
        color: 0xf59e0b,
        description: body,
        footer: `Dockge Enhanced${footerHost}`,
      });
    }
    if (apprise) {
      await apprise.send({ title, body, type: "warning" });
    }
  }

  private async _notifyApplied(
    containerName: string,
    newDigest: string,
  ): Promise<void> {
    const webhooks = await loadWebhooks();
    const apprise = await this._loadApprise();
    if (webhooks.length === 0 && !apprise) return;

    const hostname = (await Settings.get("primaryHostname")) || "";
    const hostnamePrefix = hostname ? `[${hostname}] ` : "";
    const footerHost = hostname ? ` · ${hostname}` : "";

    const title = `${hostnamePrefix}✅ Dockge-Enhanced mis à jour`;
    const body = [
      `Le conteneur **${containerName}** a été mis à jour automatiquement.`,
      `Nouveau digest : \`${newDigest.slice(7, 19)}\``,
    ].join("\n");

    if (webhooks.length > 0) {
      await new DiscordNotifier(webhooks).sendEmbed({
        title,
        color: 0x22c55e,
        description: body,
        footer: `Dockge Enhanced${footerHost}`,
      });
    }
    if (apprise) {
      await apprise.send({ title, body, type: "success" });
    }
  }

  private async _loadApprise(): Promise<AppriseNotifier | null> {
    try {
      const raw = await fs.readFile(SETTINGS_PATH, "utf8");
      const data = JSON.parse(raw) as Record<string, unknown>;
      const serverUrl =
        typeof data.appriseServerUrl === "string" ? data.appriseServerUrl : "";
      const urls = Array.isArray(data.appriseUrls)
        ? (data.appriseUrls as string[])
        : [];
      if (!serverUrl) return null;
      return new AppriseNotifier(serverUrl, urls);
    } catch {
      return null;
    }
  }
}
