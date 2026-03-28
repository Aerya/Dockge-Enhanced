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

const SELF_REPO        = "aerya/dockge-enhanced";
const SELF_TAG         = "latest";
const DATA_DIR         = process.env.DOCKGE_DATA_DIR ?? "/opt/dockge/data";
const SETTINGS_PATH    = path.join(DATA_DIR, "watcher-settings.json");
const CHECK_INTERVAL   = 6 * 60 * 60 * 1000; // 6h
const STARTUP_DELAY    = 30_000;              // 30s après démarrage

// ─── Helpers ──────────────────────────────────────────────────────

async function fetchRemoteDigest(): Promise<string> {
    // GHCR_TOKEN = GitHub PAT avec scope read:packages (requis si repo privé)
    const ghcrToken = process.env.GHCR_TOKEN?.trim() ?? "";

    let token = "";
    try {
        const res = await axios.get(
            `https://ghcr.io/token?scope=repository:${SELF_REPO}:pull`,
            {
                timeout: 10000,
                ...(ghcrToken
                    ? { auth: { username: "token", password: ghcrToken } }
                    : {}),
            }
        );
        token = res.data.token ?? "";
    } catch { /* continue sans token si repo public */ }

    const headers: Record<string, string> = {
        Accept: [
            "application/vnd.docker.distribution.manifest.list.v2+json",
            "application/vnd.oci.image.index.v1+json",
        ].join(", "),
    };
    if (token) headers["Authorization"] = `Bearer ${token}`;

    const url = `https://ghcr.io/v2/${SELF_REPO}/manifests/${SELF_TAG}`;
    const res = await axios.get(url, { headers, timeout: 15000 });
    const manifestList = res.data;

    // Trouve le manifest de la plateforme courante (amd64 ou arm64)
    // pour comparer le même digest que ce que Docker stocke en local
    const arch = process.arch === "arm64" ? "arm64" : "amd64";
    const entry = (manifestList.manifests ?? []).find(
        (m: any) => m.platform?.os === "linux" && m.platform?.architecture === arch
    );
    if (entry?.digest) return entry.digest as string;

    // Fallback : digest du manifest list lui-même
    const d = res.headers["docker-content-digest"];
    if (d) return String(d);
    throw new Error("Digest absent dans la réponse GHCR");
}

/** Appel HTTP via le socket Docker (sans CLI). */
function dockerSocketGet(apiPath: string): Promise<any> {
    return new Promise((resolve) => {
        const req = http.request(
            { socketPath: "/var/run/docker.sock", path: apiPath, method: "GET" },
            (res) => {
                let data = "";
                res.on("data", (chunk) => (data += chunk));
                res.on("end", () => {
                    try { resolve(JSON.parse(data)); } catch { resolve(null); }
                });
            }
        );
        req.on("error", () => resolve(null));
        req.end();
    });
}

async function fetchLocalDigest(): Promise<string> {
    try {
        // HOSTNAME = ID court du conteneur dans Docker
        const id = process.env.HOSTNAME ?? "";
        if (!id) return "";
        const container = await dockerSocketGet(`/containers/${id}/json`);
        const imageId: string = container?.Image ?? "";
        if (!imageId) return "";
        const image = await dockerSocketGet(`/images/${imageId}/json`);
        const repoDigests: string[] = image?.RepoDigests ?? [];
        const digest = repoDigests.find((d) => d.includes("dockge-enhanced"));
        if (!digest) return "";
        const m = digest.match(/sha256:[a-f0-9]{64}/);
        return m ? m[0] : "";
    } catch {
        return "";
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
            const raw  = await fs.readFile(p, "utf8");
            const data = JSON.parse(raw) as Record<string, unknown>;
            const webhooks = data?.discordWebhooks;
            if (Array.isArray(webhooks) && webhooks.length > 0) return webhooks as string[];
        } catch { /* fichier absent, on essaie le suivant */ }
    }
    return [];
}

// ─── Types exposés au router ──────────────────────────────────────

export interface SelfUpdateStatus {
    updateAvailable: boolean;
    localDigest:     string;
    remoteDigest:    string;
    containerName:   string;
    checkedAt:       string | null;
    error:           string | null;
}

// ─── Singleton ────────────────────────────────────────────────────

export class SelfUpdateChecker {
    private static _instance: SelfUpdateChecker;

    private _status: SelfUpdateStatus = {
        updateAvailable: false,
        localDigest:     "",
        remoteDigest:    "",
        containerName:   "dockge-enhanced",
        checkedAt:       null,
        error:           null,
    };

    /** Digest pour lequel on a déjà envoyé la notif Discord (évite le spam) */
    private _notifiedDigest = "";

    private _startupTimer:   ReturnType<typeof setTimeout>  | null = null;
    private _intervalTimer:  ReturnType<typeof setInterval> | null = null;

    static getInstance(): SelfUpdateChecker {
        if (!this._instance) this._instance = new SelfUpdateChecker();
        return this._instance;
    }

    getStatus(): SelfUpdateStatus {
        return { ...this._status };
    }

    start(): void {
        this._startupTimer  = setTimeout(() => this.check(), STARTUP_DELAY);
        this._intervalTimer = setInterval(() => this.check(), CHECK_INTERVAL);
    }

    stop(): void {
        if (this._startupTimer)  clearTimeout(this._startupTimer);
        if (this._intervalTimer) clearInterval(this._intervalTimer);
    }

    async check(): Promise<void> {
        try {
            const [localDigest, remoteDigest, containerName] = await Promise.all([
                fetchLocalDigest(),
                fetchRemoteDigest(),
                fetchContainerName(),
            ]);

            const updateAvailable = !!(localDigest && remoteDigest && localDigest !== remoteDigest);

            this._status = {
                updateAvailable,
                localDigest,
                remoteDigest,
                containerName,
                checkedAt: new Date().toISOString(),
                error: null,
            };

            // Notification Discord — une seule fois par digest distant
            if (updateAvailable && this._notifiedDigest !== remoteDigest) {
                this._notifiedDigest = remoteDigest;
                await this._notifyDiscord(containerName);
            }
        } catch (e: any) {
            this._status = {
                ...this._status,
                checkedAt: new Date().toISOString(),
                error: e?.message ?? "Erreur inconnue",
            };
        }
    }

    private async _notifyDiscord(containerName: string): Promise<void> {
        const webhooks = await loadWebhooks();
        if (webhooks.length === 0) return;

        const notifier = new DiscordNotifier(webhooks);
        await notifier.sendEmbed({
            title:       "🔔 Mise à jour Dockge-Enhanced disponible",
            color:       0xF59E0B,
            description: [
                "Une nouvelle image est disponible sur GHCR.",
                "",
                "**Pour mettre à jour :**",
                "```bash",
                `docker pull ghcr.io/${SELF_REPO}:${SELF_TAG}`,
                `docker restart ${containerName}`,
                "```",
            ].join("\n"),
        });
    }
}
