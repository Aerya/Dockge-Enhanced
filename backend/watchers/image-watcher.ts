/**
 * ImageWatcher — Lit les compose.yaml de chaque stack active, compare les digests
 * distants via API Registry v2 (sans pull), notifie Discord.
 * Fichier : backend/watchers/image-watcher.ts
 */

import * as cron from "node-cron";
import { exec } from "child_process";
import { promisify } from "util";
import * as fs from "fs/promises";
import * as fsSync from "fs";
import * as path from "path";
import * as yaml from "js-yaml";
import axios from "axios";
import { DiscordNotifier } from "../notification/discord";

const execAsync = promisify(exec);

const STACKS_DIR    = process.env.DOCKGE_STACKS_DIR ?? "/opt/stacks";
const DATA_DIR      = process.env.DOCKGE_DATA_DIR   ?? "/opt/dockge/data";
const SETTINGS_PATH = path.join(DATA_DIR, "watcher-settings.json");

// ─── Types ────────────────────────────────────────────────────────

export interface RegistryCredential {
    registry: string;   // "ghcr.io", "registry.example.com"
    username: string;
    token: string;      // PAT GitHub ou password
}

export interface WatcherSettings {
    enabled: boolean;
    intervalHours: number;
    discordWebhooks: string[];   // liste de webhooks (migration auto depuis discordWebhook)
    credentials: RegistryCredential[];
}

export interface ImageStatus {
    image: string;          // ex: "nginx:latest"
    stack: string;          // nom du dossier stack
    localDigest: string;
    remoteDigest: string;
    hasUpdate: boolean;
    lastChecked: string;    // ISO date
    error?: string;
}

// Store partagé — lu par le router pour le polling frontend
export const imageStatusStore = new Map<string, ImageStatus>();

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

/**
 * Résout un challenge WWW-Authenticate Bearer en récupérant un token
 * depuis le realm indiqué. Fonctionne pour tout registry v2 conforme
 * (Docker Hub, ghcr.io, lscr.io, quay.io, etc.)
 */
async function resolveChallenge(
    wwwAuthenticate: string,
    credentials: RegistryCredential[],
    registry: string
): Promise<string> {
    const realmM   = wwwAuthenticate.match(/realm="([^"]+)"/);
    const serviceM = wwwAuthenticate.match(/service="([^"]+)"/);
    const scopeM   = wwwAuthenticate.match(/scope="([^"]+)"/);
    if (!realmM) return "";

    const params = new URLSearchParams();
    if (serviceM) params.set("service", serviceM[1]);
    if (scopeM)   params.set("scope",   scopeM[1]);
    const tokenUrl = `${realmM[1]}?${params.toString()}`;

    // Utilise les credentials si disponibles (registry exact ou domaine du realm)
    const cred = credentials.find(c =>
        c.registry === registry || realmM[1].includes(c.registry)
    );

    try {
        const res = cred
            ? await axios.get(tokenUrl, {
                auth: { username: cred.username, password: cred.token },
                timeout: 10000,
              })
            : await axios.get(tokenUrl, { timeout: 10000 });
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
    credentials: RegistryCredential[]
): Promise<string> {
    // Credentials explicites → Basic auth (fonctionne pour ghcr.io, registries privés, etc.)
    const cred = credentials.find(c => c.registry === registry);
    if (cred) {
        return `Basic ${Buffer.from(`${cred.username}:${cred.token}`).toString("base64")}`;
    }

    // Docker Hub → token anonyme via auth.docker.io
    if (registry === "registry-1.docker.io") {
        try {
            const res = await axios.get(
                `https://auth.docker.io/token?service=registry.docker.io&scope=repository:${name}:pull`,
                { timeout: 10000 }
            );
            return `Bearer ${res.data.token}`;
        } catch { return ""; }
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
    credentials: RegistryCredential[]
): Promise<string> {
    const { registry, name, tag } = normalizeImage(image);

    // Image épinglée sur un digest → pas de mise à jour possible
    if (tag.startsWith("sha256:")) return tag;

    const baseUrl = registry === "registry-1.docker.io"
        ? "https://registry-1.docker.io"
        : `https://${registry}`;

    const manifestUrl = `${baseUrl}/v2/${name}/manifests/${tag}`;

    let auth = await getInitialAuth(registry, name, credentials);

    const makeHeaders = (): Record<string, string> => {
        const h: Record<string, string> = { Accept: MANIFEST_ACCEPT };
        if (auth) h["Authorization"] = auth;
        return h;
    };

    // Tentative HEAD
    try {
        const res = await axios.head(manifestUrl, { headers: makeHeaders(), timeout: 15000 });
        const digest = res.headers["docker-content-digest"];
        if (digest) return digest as string;
    } catch (err: any) {
        if (err.response?.status === 401) {
            // Résout le challenge Bearer pour obtenir un token anonyme ou authentifié
            const challenge = err.response.headers["www-authenticate"] as string ?? "";
            if (challenge) {
                auth = await resolveChallenge(challenge, credentials, registry);
            }
        }
    }

    // Tentative HEAD après auth (ou fallback GET)
    try {
        const res = await axios.head(manifestUrl, { headers: makeHeaders(), timeout: 15000 });
        const digest = res.headers["docker-content-digest"];
        if (digest) return digest as string;
    } catch { /* fallback GET */ }

    // GET final
    const res = await axios.get(manifestUrl, { headers: makeHeaders(), timeout: 15000 });
    const digest = res.headers["docker-content-digest"];
    if (!digest) throw new Error("Header Docker-Content-Digest absent dans la réponse");
    return digest as string;
}

/** Digest de l'image actuellement présente localement */
async function getLocalDigest(image: string): Promise<string> {
    try {
        const { stdout } = await execAsync(
            `docker image inspect --format '{{index .RepoDigests 0}}' ${image} 2>/dev/null`
        );
        const raw = stdout.trim();
        const match = raw.match(/sha256:[a-f0-9]{64}/);
        return match ? match[0] : "";
    } catch {
        return "";
    }
}

/** Lit un compose.yaml et retourne les noms d'images déclarées dans `services.*.image` */
function extractImagesFromCompose(composePath: string): string[] {
    try {
        const raw = fsSync.readFileSync(composePath, "utf8");
        const doc = yaml.load(raw) as Record<string, unknown>;
        if (!doc?.services) return [];
        const images: string[] = [];
        for (const svc of Object.values(
            doc.services as Record<string, { image?: string }>
        )) {
            if (svc?.image) images.push(svc.image.trim());
        }
        return [...new Set(images)];
    } catch {
        return [];
    }
}

// ─── Classe principale ────────────────────────────────────────────

export class ImageWatcher {
    private static _instance: ImageWatcher;
    private cronJob: cron.ScheduledTask | null = null;
    private baseUrl: string = "";

    setBaseUrl(url: string): void { this.baseUrl = url; }

    settings: WatcherSettings = {
        enabled: false,
        intervalHours: 6,
        discordWebhooks: [],
        credentials: [],
    };

    static getInstance(): ImageWatcher {
        if (!ImageWatcher._instance) ImageWatcher._instance = new ImageWatcher();
        return ImageWatcher._instance;
    }

    // ── Persistance ───────────────────────────────────────────────

    async loadSettings(): Promise<void> {
        try {
            const raw  = await fs.readFile(SETTINGS_PATH, "utf8");
            const data = JSON.parse(raw) as Record<string, unknown>;
            // Migration : ancien champ discordWebhook (string) → discordWebhooks (string[])
            if (typeof data.discordWebhook === "string" && !data.discordWebhooks) {
                data.discordWebhooks = data.discordWebhook ? [data.discordWebhook] : [];
                delete data.discordWebhook;
            }
            this.settings = { ...this.settings, ...data as Partial<WatcherSettings> };
        } catch { /* première utilisation */ }
    }

    async saveSettings(partial: Partial<WatcherSettings>): Promise<void> {
        this.settings = { ...this.settings, ...partial };
        await fs.mkdir(DATA_DIR, { recursive: true });
        await fs.writeFile(SETTINGS_PATH, JSON.stringify(this.settings, null, 2));
        this.restart();
    }

    getSettingsSafe(): WatcherSettings {
        return {
            ...this.settings,
            discordWebhooks: this.settings.discordWebhooks.map(w =>
                w.replace(/\/\w{6}\w+$/, "/***")
            ),
            credentials: this.settings.credentials.map(c => ({ ...c, token: "***" })),
        };
    }

    // ── Cycle de vie ──────────────────────────────────────────────

    async startIfEnabled(): Promise<void> {
        await this.loadSettings();
        if (this.settings.enabled) this.start();
    }

    start(): void {
        this.stop();
        const expr = `0 */${this.settings.intervalHours} * * *`;
        console.log(`[ImageWatcher] Démarrage — vérification toutes les ${this.settings.intervalHours}h`);
        this.cronJob = cron.schedule(expr, () => this.runCheck());
        // Check immédiat au démarrage
        this.runCheck().catch(console.error);
    }

    stop(): void {
        this.cronJob?.stop();
        this.cronJob = null;
    }

    restart(): void {
        this.settings.enabled ? this.start() : this.stop();
    }

    // ── Check principal ───────────────────────────────────────────

    async runCheck(): Promise<ImageStatus[]> {
        console.log("[ImageWatcher] Vérification des images...");
        const results: ImageStatus[] = [];

        let entries: string[];
        try {
            entries = await fs.readdir(STACKS_DIR);
        } catch {
            console.error(`[ImageWatcher] Impossible de lire ${STACKS_DIR}`);
            return [];
        }

        for (const stack of entries) {
            // Cherche compose.yaml ou docker-compose.yml
            const candidates = [
                path.join(STACKS_DIR, stack, "compose.yaml"),
                path.join(STACKS_DIR, stack, "docker-compose.yml"),
                path.join(STACKS_DIR, stack, "docker-compose.yaml"),
            ];

            let composePath = "";
            for (const c of candidates) {
                try { await fs.access(c); composePath = c; break; } catch { /* next */ }
            }
            if (!composePath) continue;

            const images = extractImagesFromCompose(composePath);
            for (const image of images) {
                const status = await this.checkOneImage(image, stack);
                results.push(status);
                imageStatusStore.set(`${stack}::${image}`, status);
            }
        }

        const updates = results.filter(r => r.hasUpdate && !r.error);
        if (updates.length > 0 && this.settings.discordWebhooks.length > 0) {
            await this.notify(updates, results.length);
        }

        console.log(
            `[ImageWatcher] ${results.length} image(s) vérifiée(s), ` +
            `${updates.length} mise(s) à jour disponible(s)`
        );
        return results;
    }

    private async checkOneImage(image: string, stack: string): Promise<ImageStatus> {
        const status: ImageStatus = {
            image, stack,
            localDigest: "", remoteDigest: "",
            hasUpdate: false,
            lastChecked: new Date().toISOString(),
        };
        try {
            const [local, remote] = await Promise.all([
                getLocalDigest(image),
                getRemoteDigest(image, this.settings.credentials),
            ]);
            status.localDigest  = local;
            status.remoteDigest = remote;
            // Normalise avant comparaison
            const norm = (d: string) => d.replace(/^[^:]+:/, "");
            status.hasUpdate = !local || norm(local) !== norm(remote);
        } catch (e: unknown) {
            status.error = e instanceof Error ? e.message : String(e);
            console.warn(`[ImageWatcher] ${stack}/${image}: ${status.error}`);
        }
        return status;
    }

    private async notify(updates: ImageStatus[], totalChecked: number): Promise<void> {
        const notifier  = new DiscordNotifier(this.settings.discordWebhooks);
        const uiUrl     = this.baseUrl || null;

        await notifier.sendEmbed({
            title: `🐳 ${updates.length} mise(s) à jour disponible(s)`,
            color: 0xf59e0b,
            url:   uiUrl ?? undefined,
            description:
                `${totalChecked} image(s) vérifiée(s) · ${new Date().toLocaleString("fr-FR")}\n` +
                (uiUrl
                    ? `👉 [Ouvrir Dockge](${uiUrl}) pour décider des mises à jour.`
                    : `Connectez-vous à **Dockge** pour décider des mises à jour.`),
            fields: updates.map(u => ({
                name: `🔄 \`${u.image}\``,
                value:
                    `Stack : **${u.stack}**\n` +
                    `Distant : \`${u.remoteDigest.slice(0, 19)}…\`\n` +
                    (u.localDigest ? `Local   : \`${u.localDigest.slice(0, 19)}…\`` : "⚠️ Image non présente localement"),
                inline: false,
            })),
            footer: "Dockge Enhanced — Image Watcher",
        });
    }
}
