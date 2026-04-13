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
import { AppriseNotifier } from "../notification/apprise";

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

export interface AutoUpdateEntry {
    mode: "immediate" | "scheduled";
    time?: string;   // "HH:MM" — uniquement pour mode scheduled
}

export interface WatcherSettings {
    enabled: boolean;
    intervalHours: number;
    discordWebhooks: string[];   // liste de webhooks (migration auto depuis discordWebhook)
    credentials: RegistryCredential[];
    notificationLang: "fr" | "en";
    autoUpdateConfig: Record<string, AutoUpdateEntry>;  // clé "stack::image" → config màj auto
    pendingAutoUpdates: string[];                        // clés en attente de màj planifiée
    appriseServerUrl: string;    // URL du serveur Apprise (ex: "http://apprise:8000")
    appriseUrls: string[];       // URLs Apprise (ntfy://, tgram://, etc.)
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
            `docker image inspect --format '{{index .RepoDigests 0}}' ${image} 2>/dev/null`,
            { timeout: 15000 }
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
        console.warn(`[ImageWatcher] extractImagesFromCompose: erreur lecture ${composePath}:`, err);
        return [];
    }
}

// ─── Classe principale ────────────────────────────────────────────

export class ImageWatcher {
    private static _instance: ImageWatcher;
    private cronJob: cron.ScheduledTask | null = null;
    private minuteCron: cron.ScheduledTask | null = null;
    private baseUrl: string = "";

    setBaseUrl(url: string): void { this.baseUrl = url; }

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
            // Migration : autoUpdateImages (string[]) → autoUpdateConfig (Record)
            if (Array.isArray(data.autoUpdateImages) && !data.autoUpdateConfig) {
                data.autoUpdateConfig = {};
                for (const key of data.autoUpdateImages as string[]) {
                    (data.autoUpdateConfig as Record<string, AutoUpdateEntry>)[key] = { mode: "immediate" };
                }
                delete data.autoUpdateImages;
            }
            this.settings = { ...this.settings, ...data as Partial<WatcherSettings> };
        } catch { /* première utilisation */ }
    }

    async saveSettings(partial: Partial<WatcherSettings>): Promise<void> {
        this.settings = { ...this.settings, ...partial };
        await this.persistToFile();
        this.restart();
    }

    /** Écrit les settings sur disque SANS redémarrer le watcher (usage interne) */
    private async persistToFile(): Promise<void> {
        await fs.mkdir(DATA_DIR, { recursive: true });
        await fs.writeFile(SETTINGS_PATH, JSON.stringify(this.settings, null, 2));
    }

    getSettingsSafe(): WatcherSettings {
        return {
            ...this.settings,
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
        // Cron minutaire pour appliquer les màj planifiées
        this.minuteCron = cron.schedule("* * * * *", () => this.applyPendingUpdates().catch(console.error));
        // Check immédiat au démarrage
        this.runCheck().catch(console.error);
    }

    stop(): void {
        this.cronJob?.stop();
        this.cronJob = null;
        this.minuteCron?.stop();
        this.minuteCron = null;
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

        // Collecte les clés traitées ce cycle pour purger les entrées obsolètes
        const processedKeys = new Set<string>();
        // Map stack → composePath pour l'auto-update
        const composePathByStack = new Map<string, string>();

        for (const stack of entries) {
            try {
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
                composePathByStack.set(stack, composePath);

                const images = extractImagesFromCompose(composePath);
                if (images.length === 0) {
                    console.log(`[ImageWatcher] ${stack}: aucune image trouvée dans ${composePath}`);
                }
                for (const image of images) {
                    const key = `${stack}::${image}`;
                    processedKeys.add(key);
                    const status = await this.checkOneImage(image, stack);
                    results.push(status);
                    imageStatusStore.set(key, status);
                }
            } catch (err) {
                console.error(`[ImageWatcher] Erreur lors du traitement de la stack "${stack}":`, err);
            }
        }

        // Supprime les entrées du store qui ne correspondent plus à aucune image active
        for (const key of imageStatusStore.keys()) {
            if (!processedKeys.has(key)) {
                imageStatusStore.delete(key);
            }
        }

        const updates = results.filter(r => r.hasUpdate && !r.error);

        // ── Auto-update ───────────────────────────────────────────
        const autoUpdateConfig = this.settings.autoUpdateConfig ?? {};
        const currentPending   = new Set(this.settings.pendingAutoUpdates ?? []);

        const toImmediate:  ImageStatus[] = [];
        const newlyPending: string[]      = [];

        for (const r of updates) {
            const key = `${r.stack}::${r.image}`;
            const cfg = autoUpdateConfig[key];
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
            console.log(`[ImageWatcher] ${newlyPending.length} image(s) mise(s) en attente de màj planifiée`);
        }

        // Applique les màj immédiates
        const autoUpdated: ImageStatus[] = [];
        for (const item of toImmediate) {
            const composePath = composePathByStack.get(item.stack);
            if (composePath) {
                const success = await this.performAutoUpdate(item, composePath);
                if (success) autoUpdated.push(item);
            }
        }

        // Notifications après les màj auto, pour tout signaler en un seul embed
        if (updates.length > 0 && (this.settings.discordWebhooks.length > 0 || this.settings.appriseServerUrl)) {
            await this.notify(updates, results.length, autoUpdated, this.settings.autoUpdateConfig);
        }

        console.log(
            `[ImageWatcher] ${results.length} image(s) vérifiée(s), ` +
            `${updates.length} mise(s) à jour disponible(s)` +
            (autoUpdated.length ? `, ${autoUpdated.length} immédiate(s) effectuée(s)` : "") +
            (newlyPending.length ? `, ${newlyPending.length} planifiée(s) en attente` : "")
        );
        return results;
    }

    /** Applique les màj planifiées dont l'heure correspond à l'heure courante (appelé chaque minute) */
    private async applyPendingUpdates(): Promise<void> {
        const pending = this.settings.pendingAutoUpdates ?? [];
        if (pending.length === 0) return;

        const now = new Date();
        const currentTime = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;

        const toApply = pending.filter(key => {
            const cfg = this.settings.autoUpdateConfig?.[key];
            return cfg?.mode === "scheduled" && cfg.time === currentTime;
        });
        if (toApply.length === 0) return;

        // Retire les clés traitées du pending avant d'appliquer (évite double-tir si la màj est longue)
        // Pas de restart — le watcher tourne déjà, on veut juste persister l'état
        this.settings.pendingAutoUpdates = pending.filter(k => !toApply.includes(k));
        await this.persistToFile();

        console.log(`[ImageWatcher] Màj planifiée à ${currentTime} : ${toApply.length} image(s)`);

        const applied: ImageStatus[] = [];
        for (const key of toApply) {
            const sepIdx = key.indexOf("::");
            if (sepIdx === -1) continue;
            const stack = key.slice(0, sepIdx);
            const image = key.slice(sepIdx + 2);

            // Trouve le fichier compose
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

            // Récupère le statut connu ou fait un check rapide
            const status: ImageStatus = imageStatusStore.get(key) ?? {
                image, stack, localDigest: "", remoteDigest: "",
                hasUpdate: true, lastChecked: new Date().toISOString(),
            };

            const success = await this.performAutoUpdate(status, composePath);
            if (success) applied.push(status);
        }

        if (applied.length > 0 && (this.settings.discordWebhooks.length > 0 || this.settings.appriseServerUrl)) {
            await this.notify(applied, applied.length, applied, this.settings.autoUpdateConfig);
        }
    }

    /** Trouve le nom du service docker compose qui utilise une image donnée */
    private findServiceForImage(composePath: string, image: string): string | null {
        try {
            const raw = require("fs").readFileSync(composePath, "utf8");
            const doc = yaml.load(raw) as Record<string, unknown>;
            if (!doc?.services) return null;
            const services = doc.services as Record<string, { image?: string }>;
            for (const [name, svc] of Object.entries(services)) {
                if (svc?.image?.trim() === image.trim()) return name;
            }
        } catch { /* ignore */ }
        return null;
    }

    /** Tire et redémarre une image via docker compose. Retourne true si succès. */
    private async performAutoUpdate(status: ImageStatus, composePath: string): Promise<boolean> {
        const service = this.findServiceForImage(composePath, status.image);
        const serviceArg = service ? ` ${service}` : "";
        console.log(`[ImageWatcher] Auto-update: ${status.stack}/${status.image}${service ? ` (service: ${service})` : ""}`);
        try {
            await execAsync(`docker compose -f "${composePath}" pull${serviceArg}`, { timeout: 180000 });
            await execAsync(`docker compose -f "${composePath}" up -d${serviceArg}`, { timeout: 60000 });
            // Recheck pour mettre à jour le digest dans le store
            const newStatus = await this.checkOneImage(status.image, status.stack);
            imageStatusStore.set(`${status.stack}::${status.image}`, newStatus);
            console.log(`[ImageWatcher] Auto-update terminée: ${status.stack}/${status.image}`);
            return true;
        } catch (e) {
            console.error(`[ImageWatcher] Auto-update échouée: ${status.stack}/${status.image}:`, e);
            return false;
        }
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

    private async notify(
        updates: ImageStatus[],
        totalChecked: number,
        autoUpdated: ImageStatus[] = [],
        cfg: Record<string, AutoUpdateEntry> = {},
    ): Promise<void> {
        const discordNotifier = this.settings.discordWebhooks.length > 0
            ? new DiscordNotifier(this.settings.discordWebhooks)
            : null;
        const appriseNotifier = this.settings.appriseServerUrl
            ? new AppriseNotifier(this.settings.appriseServerUrl, this.settings.appriseUrls)
            : null;
        const uiUrl    = this.baseUrl || null;
        const en       = (this.settings.notificationLang ?? "fr") === "en";
        const locale   = en ? "en-GB" : "fr-FR";
        const t        = (fr: string, enStr: string) => en ? enStr : fr;

        const autoUpdatedKeys = new Set(autoUpdated.map(u => `${u.stack}::${u.image}`));
        const notAuto = updates.filter(u => !autoUpdatedKeys.has(`${u.stack}::${u.image}`));
        const scheduled = notAuto.filter(u => cfg[`${u.stack}::${u.image}`]?.mode === "scheduled");
        const manual    = notAuto.filter(u => cfg[`${u.stack}::${u.image}`]?.mode !== "scheduled");

        // Titre selon ce qui s'est passé
        let title: string;
        if (autoUpdated.length > 0 && notAuto.length === 0) {
            title = t(
                `✅ ${autoUpdated.length} image(s) mise(s) à jour automatiquement`,
                `✅ ${autoUpdated.length} image(s) auto-updated`
            );
        } else if (autoUpdated.length > 0) {
            const parts = [
                autoUpdated.length > 0 ? `${autoUpdated.length} ${t("auto", "auto")}` : "",
                scheduled.length > 0   ? `${scheduled.length} ${t("planifiée(s)", "scheduled")}` : "",
                manual.length > 0      ? `${manual.length} ${t("manuelle(s)", "manual")}` : "",
            ].filter(Boolean).join(", ");
            title = t(
                `🐳 ${updates.length} mise(s) à jour — ${parts}`,
                `🐳 ${updates.length} update(s) — ${parts}`
            );
        } else {
            title = t(
                `🐳 ${updates.length} mise(s) à jour disponible(s)`,
                `🐳 ${updates.length} update(s) available`
            );
        }

        const makeField = (u: ImageStatus, wasAutoUpdated: boolean) => {
            const key     = `${u.stack}::${u.image}`;
            const entry   = cfg[key];
            const isSched = !wasAutoUpdated && entry?.mode === "scheduled";
            return {
                name: wasAutoUpdated ? `✅ \`${u.image}\``
                    : isSched        ? `🕐 \`${u.image}\``
                    :                  `🔄 \`${u.image}\``,
                value:
                    `${t("Stack", "Stack")} : **${u.stack}**\n` +
                    (wasAutoUpdated
                        ? t("Mise à jour immédiate effectuée.", "Immediate update applied.")
                        : isSched
                            ? t(`Mise à jour planifiée à **${entry!.time}**.`,
                                `Scheduled update at **${entry!.time}**.`)
                            : `${t("Distant", "Remote")} : \`${u.remoteDigest.slice(0, 19)}…\`\n` +
                              (u.localDigest
                                  ? `${t("Local", "Local")}   : \`${u.localDigest.slice(0, 19)}…\``
                                  : t("⚠️ Image non présente localement", "⚠️ Image not present locally"))
                    ),
                inline: false,
            };
        };

        const description =
            `${totalChecked} ${t("image(s) vérifiée(s)", "image(s) checked")} · ${new Date().toLocaleString(locale)}\n` +
            (notAuto.length > 0
                ? (uiUrl
                    ? `[${t("Ouvrir Dockge", "Open Dockge")}](${uiUrl}) ${t("pour décider des mises à jour en attente.", "to review pending updates.")}`
                    : t("Connectez-vous à **Dockge** pour décider des mises à jour en attente.", "Log in to **Dockge** to review pending updates."))
                : "");

        const fields = [
            ...autoUpdated.map(u => makeField(u, true)),
            ...notAuto.map(u => makeField(u, false)),
        ];

        if (discordNotifier) {
            await discordNotifier.sendEmbed({
                title,
                color: autoUpdated.length > 0 && notAuto.length === 0 ? 0x22c55e : 0xf59e0b,
                url:   uiUrl ?? undefined,
                description,
                fields,
                footer: "Dockge Enhanced — Image Watcher",
            });
        }

        if (appriseNotifier) {
            const imageLines = fields.map(f => `**${f.name}**\n${f.value}`).join("\n\n");
            await appriseNotifier.send({
                title,
                body:  `${description}\n\n${imageLines}`.trim(),
                type:  autoUpdated.length > 0 && notAuto.length === 0 ? "success" : "warning",
            });
        }
    }
}
