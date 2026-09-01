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
import { getNotificationLang, notificationText } from "../notification/notification-lang";
import { Settings } from "../settings";
import { SelfUpdateManager } from "../self-update/manager";
import { atomicWriteJson } from "../self-update/state-file";

const SELF_REPO = "aerya/dockge-enhanced";
const SELF_TAG = "latest";
// Surcharge explicite du dépôt suivi (ex. un fork : "owner/dockge-enhanced")
const SELF_REPO_OVERRIDE = process.env.DOCKGE_SELF_REPO?.trim() ?? "";
const DATA_DIR = process.env.DOCKGE_DATA_DIR ?? "/opt/dockge/data";
const SETTINGS_PATH = path.join(DATA_DIR, "watcher-settings.json");
const DIGEST_CACHE = path.join(DATA_DIR, "self-update-digest.json");
const DOCKER_SOCKET =
  process.env.DOCKGE_DOCKER_SOCKET ?? "/var/run/docker.sock";
const CHECK_INTERVAL = 10 * 60 * 1000; // 10 min
const CHECK_JITTER = 2 * 60 * 1000; // ±2 min pour étaler les requêtes GHCR
const STARTUP_DELAY = 30_000; // 30s après démarrage

interface ImagePlatform {
  os: string;
  architecture: string;
  variant?: string;
}

export interface BuildMetadata {
  revision: string;
  created: string;
}

interface RemoteDigestInfo {
  platformDigest: string;
  indexDigest: string;
  platform: ImagePlatform;
  build: BuildMetadata;
}

function emptyBuildMetadata(): BuildMetadata {
  return { revision: "", created: "" };
}

function buildMetadataFromConfig(config: any): BuildMetadata {
  const labels = config?.config?.Labels ?? config?.Config?.Labels ?? {};
  return {
    revision: typeof labels["org.opencontainers.image.revision"] === "string" ? labels["org.opencontainers.image.revision"] : "",
    created: typeof labels["org.opencontainers.image.created"] === "string" ? labels["org.opencontainers.image.created"] : "",
  };
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
  repo: string,
  preferredPlatform = "",
): Promise<RemoteDigestInfo> {
  // GHCR_TOKEN = GitHub PAT avec scope read:packages (requis si repo privé)
  const ghcrToken = process.env.GHCR_TOKEN?.trim() ?? "";
  const platform = getCurrentPlatform(preferredPlatform);

  let token = "";
  try {
    const res = await axios.get(
      `https://ghcr.io/token?scope=repository:${repo}:pull`,
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

  const baseUrl = `https://ghcr.io/v2/${repo}`;
  const res = await axios.get(`${baseUrl}/manifests/${SELF_TAG}`, { headers, timeout: 15000 });

  const indexDigest = String(res.headers["docker-content-digest"] ?? "");
  const manifests = Array.isArray(res.data?.manifests)
    ? res.data.manifests
    : [];

  let platformDigest = indexDigest;
  if (manifests.length > 0) {
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
    platformDigest = String(match.digest);
  }

  if (!platformDigest) {
    throw new Error("Header docker-content-digest absent dans la réponse GHCR");
  }

  let build = emptyBuildMetadata();
  try {
    const manifest = manifests.length > 0
      ? await axios.get(`${baseUrl}/manifests/${platformDigest}`, { headers, timeout: 15000 })
      : res;
    const configDigest = typeof manifest.data?.config?.digest === "string" ? manifest.data.config.digest : "";
    if (configDigest) {
      const config = await axios.get(`${baseUrl}/blobs/${configDigest}`, { headers, timeout: 15000 });
      build = buildMetadataFromConfig(config.data);
    }
  } catch {
    // Les anciennes images peuvent ne pas exposer les labels OCI. Le digest reste la référence.
  }

  return {
    platformDigest,
    indexDigest: manifests.length > 0 ? indexDigest : "",
    platform,
    build,
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
  repo: string;
  build: BuildMetadata;
  platform?: ImagePlatform;
}> {
  try {
    // HOSTNAME = ID court du conteneur dans Docker
    const id = process.env.HOSTNAME ?? "";
    if (!id) return { digest: "", comparable: false, source: "none", repo: "", build: emptyBuildMetadata() };
    const container = await dockerSocketGet(`/containers/${id}/json`);
    const imageId: string = container?.Image ?? "";
    if (!imageId)
      return { digest: "", comparable: false, source: "none", repo: "", build: emptyBuildMetadata() };
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
    // Dépôt d'origine de l'image (ex. "owner/dockge-enhanced" pour GHCR) :
    // permet à un fork de suivre son propre dépôt plutôt que celui d'Aerya.
    const fullRepo = digest.split("@")[0] ?? "";
    const repo = fullRepo.startsWith("ghcr.io/")
      ? fullRepo.slice("ghcr.io/".length)
      : "";
    const os = typeof image?.Os === "string" ? image.Os : "";
    const architecture =
      typeof image?.Architecture === "string" ? image.Architecture : "";
    const variant =
      typeof image?.Variant === "string" ? image.Variant : undefined;

    return {
      digest: extractShaDigest(digest),
      comparable: !!digest,
      source: digest ? "repoDigest" : "none",
      repo,
      build: buildMetadataFromConfig(image),
      platform:
        os && architecture
          ? { os, architecture: normalizeArch(architecture), variant }
          : undefined,
    };
  } catch {
    return { digest: "", comparable: false, source: "none", repo: "", build: emptyBuildMetadata() };
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
  localBuild: BuildMetadata;
  remoteBuild: BuildMetadata;
  containerName: string;
  repo: string;
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
    localBuild: emptyBuildMetadata(),
    remoteBuild: emptyBuildMetadata(),
    containerName: "dockge-enhanced",
    repo: SELF_REPO_OVERRIDE || SELF_REPO,
    checkedAt: null,
    error: null,
  };

  /** Digest distant pour lequel on a déjà envoyé la notif "dispo" (évite le spam) */
  private _notifiedRemoteDigest = "";
  /** Dernier digest local connu, persisté sur disque pour survivre aux redémarrages */
  private _lastKnownLocalDigest = "";

  private _startupTimer: ReturnType<typeof setTimeout> | null = null;
  private _intervalTimer: ReturnType<typeof setTimeout> | null = null;

  static getInstance(): SelfUpdateChecker {
    if (!this._instance) this._instance = new SelfUpdateChecker();
    return this._instance;
  }

  getStatus(): SelfUpdateStatus {
    return { ...this._status };
  }

  start(): void {
    this._loadDigestCache().then(() => {
      this._startupTimer = setTimeout(async () => {
        await this.check();
        this._scheduleNextCheck();
      }, STARTUP_DELAY);
    });
  }

  private _scheduleNextCheck(): void {
    const jitter = (Math.random() * 2 - 1) * CHECK_JITTER;
    const delay = Math.max(1_000, Math.round(CHECK_INTERVAL + jitter));

    this._intervalTimer = setTimeout(async () => {
      try {
        await this.check();
      } finally {
        this._scheduleNextCheck();
      }
    }, delay);
  }

  private async _loadDigestCache(): Promise<void> {
    try {
      const raw = await fs.readFile(DIGEST_CACHE, "utf8");
      const data = JSON.parse(raw) as Record<string, unknown>;
      this._lastKnownLocalDigest =
        typeof data.localDigest === "string" ? data.localDigest : "";
      this._notifiedRemoteDigest =
        typeof data.notifiedRemoteDigest === "string" ? data.notifiedRemoteDigest : "";
    } catch {
      /* premier démarrage */
    }
  }

  private async _saveDigestCache(localDigest = this._lastKnownLocalDigest): Promise<void> {
    try {
      await atomicWriteJson(DIGEST_CACHE, {
        localDigest,
        notifiedRemoteDigest: this._notifiedRemoteDigest,
      });
    } catch {
      /* non bloquant */
    }
  }

  stop(): void {
    if (this._startupTimer) clearTimeout(this._startupTimer);
    if (this._intervalTimer) clearTimeout(this._intervalTimer);
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
      // Dépôt suivi : surcharge env > dépôt d'origine de l'image > défaut
      const repo = SELF_REPO_OVERRIDE || localInfo.repo || SELF_REPO;
      const remoteInfo = await fetchRemoteDigest(repo, preferredPlatform);
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
        localBuild: localInfo.build,
        remoteBuild: remoteInfo.build,
        containerName,
        repo,
        checkedAt: new Date().toISOString(),
        error: localInfo.comparable
          ? null
          : "Digest local registry indisponible",
      };

      // Notif "mise à jour appliquée" — le digest local a changé depuis le dernier check
      if (wasUpdated && !SelfUpdateManager.getInstance().wasSuccessfulTargetNotified(localDigest)) {
        await this._notifyApplied(containerName, localDigest);
      }

      // Notif "mise à jour disponible" — une seule fois par digest distant
      const automaticMode = SelfUpdateManager.getInstance().isAutomaticMode();
      if (updateAvailable && this._notifiedRemoteDigest !== remoteDigest) {
        this._notifiedRemoteDigest = remoteDigest;
        // Persist before notifying: if an immediate automatic update restarts
        // Dockge-Enhanced, the new process must not announce the same digest again.
        await this._saveDigestCache();
        await this._notifyAvailable(containerName, repo, automaticMode);
      }

      if (updateAvailable && SelfUpdateManager.getInstance().canAutoUpdate()) {
        await SelfUpdateManager.getInstance().requestSidecarUpdate(`ghcr.io/${repo}@${remoteDigest}`, true);
      }
    } catch (e: any) {
      this._status = {
        ...this._status,
        checkedAt: new Date().toISOString(),
        error: e?.message ?? "Erreur inconnue",
      };
    }
  }

  private async _notifyAvailable(
    containerName: string,
    repo: string,
    automaticMode: boolean,
  ): Promise<void> {
    const webhooks = await loadWebhooks();
    const apprise = await this._loadApprise();
    if (webhooks.length === 0 && !apprise) return;

    const lang = await getNotificationLang();
    const t = (fr: string, en: string, es: string, zhCN: string) => notificationText(lang, fr, en, es, zhCN);
    const hostname = (await Settings.get("primaryHostname")) || "";
    const hostnamePrefix = hostname ? `[${hostname}] ` : "";
    const footerHost = hostname ? ` · ${hostname}` : "";

    const title = `${hostnamePrefix}${t(
      "🔔 Mise à jour Dockge-Enhanced disponible",
      "🔔 Dockge-Enhanced update available",
      "🔔 Actualización de Dockge-Enhanced disponible",
      "🔔 Dockge-Enhanced 有可用更新",
    )}`;
    const releaseNotes = [
      t("**Nouveautés :**", "**What’s new:**", "**Novedades:**", "**更新内容：**"),
      t(
        "• Les auto-mises à jour Dockge-Enhanced utilisent le digest exact détecté, conservent le contexte Compose et les bind mounts relatifs, attendent une application réellement prête et gardent un snapshot de récupération Restic.",
        "• Automatic Dockge-Enhanced updates now use the exact detected digest, preserve Compose/relative bind-mount context, wait for real application readiness and keep a Restic recovery snapshot.",
        "• Las actualizaciones automáticas de Dockge-Enhanced usan el digest exacto detectado, conservan el contexto Compose y los bind mounts relativos, esperan a que la aplicación esté realmente lista y mantienen una instantánea de recuperación Restic.",
        "• Dockge-Enhanced 自动更新现在使用检测到的精确摘要，保留 Compose 上下文和相对绑定挂载，等待应用真正就绪，并保留 Restic 恢复快照。",
      ),
      t(
        "• L’onglet Mises à jour permet de planifier ou suspendre les mises à jour automatiques, avec backup/vérification Restic obligatoires et rollback si le healthcheck échoue.",
        "• The Updates tab can schedule or pause image and Dockge-Enhanced automatic updates, with mandatory Restic backup/verification and rollback on failed health checks.",
        "• La pestaña Actualizaciones permite programar o pausar las actualizaciones automáticas, con copia/verificación Restic obligatorias y rollback si falla el healthcheck.",
        "• “更新”标签页可安排或暂停自动更新，并要求 Restic 备份/验证；健康检查失败时会自动回滚。",
      ),
      t(
        `Lire le changelog complet : https://github.com/${repo}`,
        `Read the full changelog: https://github.com/${repo}`,
        `Leer el registro de cambios completo: https://github.com/${repo}`,
        `查看完整更新日志：https://github.com/${repo}`,
      ),
    ];

    const body = automaticMode
      ? [
          t(
            "Une nouvelle image est disponible sur GHCR. La mise à jour automatique par sidecar est configurée.",
            "A new image is available on GHCR. Automatic Sidecar update is configured.",
            "Hay una nueva imagen disponible en GHCR. La actualización automática mediante Sidecar está configurada.",
            "GHCR 上有新镜像可用，并已配置 Sidecar 自动更新。",
          ),
          "",
          ...releaseNotes,
        ].join("\n")
      : [
          t(
            "Une nouvelle image est disponible sur GHCR.",
            "A new image is available on GHCR.",
            "Hay una nueva imagen disponible en GHCR.",
            "GHCR 上有新镜像可用。",
          ),
          "",
          ...releaseNotes,
          "",
          t("**Pour mettre à jour :**", "**To update:**", "**Para actualizar:**", "**更新方法：**"),
          "```bash",
          `docker pull ghcr.io/${repo}:${SELF_TAG}`,
          `docker compose up -d`,
          "```",
          t(
            "_Exécuter depuis le dossier contenant votre compose.yaml_",
            "_Run from the folder containing your compose.yaml_",
            "_Ejecutar desde la carpeta que contiene compose.yaml_",
            "_请在包含 compose.yaml 的目录中执行_",
          ),
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

    const lang = await getNotificationLang();
    const t = (fr: string, en: string, es: string, zhCN: string) => notificationText(lang, fr, en, es, zhCN);
    const hostname = (await Settings.get("primaryHostname")) || "";
    const hostnamePrefix = hostname ? `[${hostname}] ` : "";
    const footerHost = hostname ? ` · ${hostname}` : "";

    const title = `${hostnamePrefix}${t(
      "✅ Dockge-Enhanced mis à jour",
      "✅ Dockge-Enhanced updated",
      "✅ Dockge-Enhanced actualizado",
      "✅ Dockge-Enhanced 已更新",
    )}`;
    const body = [
      t(
        `Le conteneur **${containerName}** utilise désormais une nouvelle image.`,
        `The container **${containerName}** is now running a new image.`,
        `El contenedor **${containerName}** utiliza ahora una nueva imagen.`,
        `容器 **${containerName}** 现在正在运行新镜像。`,
      ),
      t(
        `Nouveau digest : \`${newDigest.slice(7, 19)}\``,
        `New digest: \`${newDigest.slice(7, 19)}\``,
        `Nuevo digest: \`${newDigest.slice(7, 19)}\``,
        `新摘要：\`${newDigest.slice(7, 19)}\``,
      ),
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
