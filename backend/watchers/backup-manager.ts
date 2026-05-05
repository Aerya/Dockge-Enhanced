/**
 * BackupManager — Gère les sauvegardes Restic des compose.yaml et .env
 * Supporte : local, SFTP, S3/B2, Restic REST server
 * Fichier : backend/watchers/backup-manager.ts
 */

import * as cron from "node-cron";
import { exec } from "child_process";
import { promisify } from "util";
import * as fs from "fs/promises";
import * as path from "path";
import * as yaml from "js-yaml";
import { DiscordNotifier } from "../notification/discord";
import { AppriseNotifier } from "../notification/apprise";

const execAsync = promisify(exec);

const STACKS_DIR         = process.env.DOCKGE_STACKS_DIR ?? "/opt/stacks";
const DATA_DIR           = process.env.DOCKGE_DATA_DIR   ?? "/opt/dockge/data";
const SETTINGS_PATH      = path.join(DATA_DIR, "backup-settings.json");
const WATCHER_SETTINGS_PATH = path.join(DATA_DIR, "watcher-settings.json");
const HISTORY_PATH       = path.join(DATA_DIR, "backup-history.json");

// ─── Types ────────────────────────────────────────────────────────

export type DestinationType = "local" | "sftp" | "s3" | "rest";

export interface LocalConfig {
    path: string;                   // ex: /opt/backups/dockge
}

export interface SftpConfig {
    host: string;
    port: number;                   // défaut 22
    user: string;
    path: string;                   // ex: /backups/dockge
    authMode: "key" | "password";   // mode d'authentification SSH
    keyPath?: string;               // chemin clé SSH (authMode = "key")
    password?: string;              // mot de passe SSH (authMode = "password") — via sshpass
}

export interface S3Config {
    endpoint?: string;              // vide pour AWS, ou URL Backblaze/Minio
    bucket: string;
    path: string;                   // préfixe dans le bucket
    accessKeyId: string;
    secretAccessKey: string;
    region?: string;                // ex: us-east-1
}

export interface RestConfig {
    url: string;                    // ex: https://restic.example.com/dockge
    user?: string;
    password?: string;
}

export interface BackupDestination {
    label: string;                  // nom affiché (ex: "NAS local", "Backblaze B2")
    enabled: boolean;               // activer/désactiver sans supprimer
    type: DestinationType;
    local?: LocalConfig;
    sftp?: SftpConfig;
    s3?: S3Config;
    rest?: RestConfig;
    resticPassword: string;         // mot de passe de chiffrement du repo
}

export interface RetentionPolicy {
    keepLast: number;               // garde les N derniers snapshots
    keepDaily: number;              // garde 1 snapshot par jour sur N jours
    keepWeekly: number;
    keepMonthly: number;
}

export interface VolumeBackupConfig {
    selectedVolumes: string[];  // chemins à sauvegarder : volume entier ou sous-dossiers spécifiques
}

export interface MountedVolume {
    source: string;       // chemin sur l'hôte (ex: /home/aerya/docker)
    destination: string;  // chemin dans le conteneur (ex: /dockers-data)
}

// Volumes à exclure de la liste (système + gérés séparément + destinations backup)
const EXCLUDED_VOL_DESTINATIONS = new Set([
    DATA_DIR,
    STACKS_DIR,
    "/backup",
    "/var/run/docker.sock",
    "/etc/hosts",
    "/etc/hostname",
    "/etc/resolv.conf",
]);
const EXCLUDED_VOL_PREFIXES = ["/proc", "/sys", "/dev", "/run", "/tmp"];

export interface BackupSettings {
    enabled: boolean;
    intervalHours: number;
    destinations: BackupDestination[];   // tableau de destinations (migration auto depuis destination)
    retention: RetentionPolicy;
    discordWebhooks: string[];
    includeEnvFiles: boolean;
    extraPaths: string[];
    volumeBackup: VolumeBackupConfig;
    notificationLang: "fr" | "en";
}

export interface ResticSnapshot {
    id: string;
    short_id: string;
    time: string;
    hostname: string;
    tags?: string[];
    paths: string[];
    summary?: {
        files_new: number;
        files_changed: number;
        files_unmodified: number;
        data_added: number;         // bytes
        total_files_processed: number;
    };
}

export interface SnapshotFile {
    path: string;
    name: string;
    stack: string;
    relativePath?: string;     // chemin relatif depuis le mount point (volumes uniquement)
    services?: string[];       // noms de services (compose uniquement)
    aliases?: string[];        // chemins alternatifs dans le snapshot (même fichier physique)
    type: "compose" | "env" | "volume" | "other";
    size: number;
    mtime: string;
    /** Statut vs fichier actuellement sur le disque */
    diskStatus: "unchanged" | "modified" | "missing";
    /** Statut vs snapshot précédent (restic diff) */
    snapDiff: "added" | "modified" | "unchanged";
    /** ID court du snapshot précédent utilisé pour la comparaison (null = premier snapshot) */
    prevSnapshotId: string | null;
}

export interface DestinationResult {
    label: string;
    type: string;
    success: boolean;
    snapshotId?: string;
    dataAdded?: number;
    error?: string;
    warnings?: string[];
}

export interface BackupResult {
    success: boolean;               // true si toutes les destinations ont réussi
    snapshotId?: string;            // premier snapshotId réussi (affichage)
    duration: number;               // ms
    dataAdded?: number;             // bytes (somme)
    filesNew?: number;
    filesChanged?: number;
    error?: string;                 // première erreur rencontrée
    warnings?: string[];            // chemins demandés mais absents / ignorés
    timestamp: string;
    destinations?: DestinationResult[];
}

interface BackupPathsResult {
    paths: string[];
    warnings: string[];
}

// Historique persisté sur disque (les 20 derniers) — rechargé au démarrage
const backupHistory: BackupResult[] = [];

async function loadHistory(): Promise<void> {
    try {
        const raw = await fs.readFile(HISTORY_PATH, "utf8");
        const arr = JSON.parse(raw) as BackupResult[];
        backupHistory.splice(0, backupHistory.length, ...arr.slice(0, 20));
        console.log(`[BackupManager] Historique chargé — ${backupHistory.length} entrée(s)`);
    } catch { /* première utilisation */ }
}

async function saveHistory(): Promise<void> {
    try {
        await fs.mkdir(DATA_DIR, { recursive: true });
        await fs.writeFile(HISTORY_PATH, JSON.stringify(backupHistory, null, 2));
    } catch (e) {
        console.error("[BackupManager] Impossible de sauvegarder l'historique:", e);
    }
}

// ─── Helpers ──────────────────────────────────────────────────────

function shellQuote(value: string): string {
    return `"${String(value).replace(/(["\\$`])/g, "\\$1")}"`;
}

function sanitizeIntervalHours(value: unknown, fallback = 24): number {
    const interval = Number(value);
    if (!Number.isFinite(interval)) return fallback;
    return Math.min(168, Math.max(1, Math.floor(interval)));
}

function cronExpressionForIntervalHours(intervalHours: number): string {
    if (intervalHours >= 168) return "0 0 * * 0";      // une fois par semaine
    if (intervalHours >= 48) return "0 0 */2 * *";      // tous les 2 jours
    if (intervalHours === 24) return "0 0 * * *";       // une fois par jour
    return `0 */${Math.max(1, Math.min(23, intervalHours))} * * *`;
}

function sanitizePort(value: unknown, fallback = 22): number {
    const port = Number(value);
    if (!Number.isFinite(port)) return fallback;
    return Math.min(65535, Math.max(1, Math.floor(port)));
}

function sanitizeRetention(value: unknown): number {
    const n = Number(value);
    if (!Number.isFinite(n)) return 0;
    return Math.max(0, Math.floor(n));
}

function assertSafeResticId(id: string): string {
    if (!/^[a-zA-Z0-9_-]{1,128}$/.test(id)) {
        throw new Error("Identifiant de snapshot invalide");
    }
    return id;
}

function buildResticEnv(dest: BackupDestination): Record<string, string> {
    const env: Record<string, string> = {
        RESTIC_PASSWORD:    dest.resticPassword,
        RESTIC_REPOSITORY:  buildRepoUrl(dest),   // toujours défini
    };

    if (dest.type === "s3" && dest.s3) {
        env.AWS_ACCESS_KEY_ID     = dest.s3.accessKeyId;
        env.AWS_SECRET_ACCESS_KEY = dest.s3.secretAccessKey;
        if (dest.s3.region) env.AWS_DEFAULT_REGION = dest.s3.region;
    }

    // REST : les credentials sont déjà encodés dans l'URL par buildRepoUrl()
    // Aucune variable d'env supplémentaire nécessaire.

    return env;
}

/**
 * Construit les options supplémentaires à passer à restic pour le mode SFTP.
 * - Clé SSH    : -o sftp.args pour forcer l'usage de la clé
 * - Mot de passe : -o sftp.command utilisant sshpass -f <tmpFile>
 *   (le chemin du fichier temporaire est créé par resticFor() avant l'appel)
 */
function buildSftpOptions(dest: BackupDestination, tmpFile?: string): string {
    if (dest.type !== "sftp" || !dest.sftp) return "";
    const s = dest.sftp;
    const port = sanitizePort(s.port);

    if (s.authMode === "password" && tmpFile) {
        // Chemins absolus obligatoires : restic spawne le sftp.command dans un
        // sous-processus Go dont le PATH peut être différent du PATH Node.js.
        const sshCommand = [
            "/usr/bin/sshpass",
            "-f", shellQuote(tmpFile),
            "/usr/bin/ssh",
            "-l", shellQuote(s.user),
            "-p", String(port),
            "-o", "StrictHostKeyChecking=no",
            "-o", "PreferredAuthentications=password",
            "-o", "BatchMode=no",
            shellQuote(s.host),
            "-s", "sftp",
        ].join(" ");
        return `-o ${shellQuote(`sftp.command=${sshCommand}`)}`;
    }

    if (s.authMode === "key") {
        const sshArgs = [
            ...(s.keyPath ? ["-i", shellQuote(s.keyPath)] : []),
            "-p", String(port),
            "-o", "StrictHostKeyChecking=no",
        ].join(" ");
        return `-o ${shellQuote(`sftp.args=${sshArgs}`)}`;
    }

    return "";
}

function buildRepoUrl(dest: BackupDestination): string {
    switch (dest.type) {
        case "local":
            return dest.local!.path;

        case "sftp": {
            const s = dest.sftp!;
            // Le port est passé via sftp.args/-o sftp.command, pas dans l'URL
            return `sftp:${s.user}@${s.host}:${s.path}`;
        }

        case "s3": {
            const s = dest.s3!;
            if (s.endpoint) {
                // Backblaze B2, Minio, etc.
                const url = s.endpoint.replace(/\/$/, "");
                return `s3:${url}/${s.bucket}/${s.path}`;
            }
            // AWS S3 standard
            return `s3:s3.amazonaws.com/${s.bucket}/${s.path}`;
        }

        case "rest": {
            const r = dest.rest!;
            if (r.user && r.password) {
                const urlObj = new URL(r.url);
                urlObj.username = r.user;
                urlObj.password = r.password;
                return `rest:${urlObj.toString()}`;
            }
            return `rest:${r.url}`;
        }
    }
}

function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
    return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

function formatDuration(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
}

/**
 * Fusionne les webhooks entrants (potentiellement masqués) avec les webhooks
 * existants en mémoire.
 * - URLs réelles (non masquées) → conservées telles quelles
 * - URLs masquées ("/***")      → on cherche l'URL réelle dans `existing`
 * - Si TOUTES les URLs sont masquées ET qu'aucune n'a pu être restaurée
 *   (ex : mémoire corrompue) → on retourne les existantes pour éviter d'écraser
 *   les vrais tokens par `***`
 * - Tableau vide → l'utilisateur a tout supprimé, on respecte ça
 */
export function mergeWebhooks(incoming: string[], existing: string[]): string[] {
    if (incoming.length === 0) return [];

    const processed = incoming.map(url => {
        if (!url.endsWith("/***")) return url;
        const prefix = url.slice(0, -3);
        return existing.find(e => e.startsWith(prefix)) ?? null;
    }).filter((u): u is string => !!u);

    // Tous masqués et aucun restauré → mémoire hors-sync, on garde l'existant
    const allMasked = incoming.every(u => u.endsWith("/***"));
    if (allMasked && processed.length === 0 && existing.length > 0) {
        return existing;
    }
    return processed;
}

// ─── Classe principale ────────────────────────────────────────────

export class BackupManager {
    private static _instance: BackupManager;
    private cronJob: cron.ScheduledTask | null = null;

    settings: BackupSettings = {
        enabled: false,
        intervalHours: 24,
        destinations: [
            {
                label: "Local",
                enabled: true,
                type: "local",
                resticPassword: "",
                local: { path: "/app/data/backups" },
            },
        ],
        retention: {
            keepLast: 10,
            keepDaily: 7,
            keepWeekly: 4,
            keepMonthly: 3,
        },
        discordWebhooks: [],
        includeEnvFiles: true,
        extraPaths: [],
        notificationLang: "fr",
        volumeBackup: { selectedVolumes: [] },
    };

    static getInstance(): BackupManager {
        if (!BackupManager._instance) BackupManager._instance = new BackupManager();
        return BackupManager._instance;
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

            // Migration : ancien champ destination (objet) → destinations (tableau)
            if (data.destination && !data.destinations) {
                const old = data.destination as BackupDestination;
                data.destinations = [{
                    label: old.type === "local" ? "Local" : old.type.toUpperCase(),
                    enabled: true,
                    ...old,
                }];
                delete data.destination;
            }

            this.settings = { ...this.settings, ...data as Partial<BackupSettings> };
        } catch { /* première utilisation */ }
    }

    async saveSettings(partial: Partial<BackupSettings>): Promise<void> {
        // Deep-merge destinations[] : pour chaque destination entrante, restaure
        // les secrets masqués ("***") depuis les destinations existantes (même index).
        if (partial.destinations) {
            partial.destinations = partial.destinations.map((incoming, idx) => {
                const orig = this.settings.destinations[idx];
                const merged: BackupDestination = orig ? { ...orig, ...incoming } : { ...incoming };

                if (merged.resticPassword === "***")
                    merged.resticPassword = orig?.resticPassword ?? "";
                if (merged.sftp?.password === "***")
                    merged.sftp!.password = orig?.sftp?.password;
                if (merged.sftp?.authMode === "key")
                    merged.sftp!.password = undefined;
                else if (merged.sftp?.authMode === "password")
                    merged.sftp!.keyPath = undefined;
                if (merged.s3?.secretAccessKey === "***")
                    merged.s3!.secretAccessKey = orig?.s3?.secretAccessKey ?? "";
                if (merged.rest?.password === "***")
                    merged.rest!.password = orig?.rest?.password;

                return merged;
            });
        }
        this.settings = { ...this.settings, ...partial };
        await fs.mkdir(DATA_DIR, { recursive: true });
        await fs.writeFile(SETTINGS_PATH, JSON.stringify(this.settings, null, 2));
        this.restart();
    }

    /** Retourne les settings sans exposer les secrets */
    getSettingsSafe(): BackupSettings {
        const s = JSON.parse(JSON.stringify(this.settings)) as BackupSettings;
        for (const dest of s.destinations) {
            if (dest.resticPassword)      dest.resticPassword           = "***";
            if (dest.sftp?.password)      dest.sftp.password            = "***";
            if (dest.s3?.secretAccessKey) dest.s3.secretAccessKey       = "***";
            if (dest.rest?.password)      dest.rest.password            = "***";
        }
        return s;
    }

    // ── Cycle de vie ──────────────────────────────────────────────

    async startIfEnabled(): Promise<void> {
        await this.loadSettings();
        await loadHistory();
        if (this.settings.enabled) this.start();
    }

    start(): void {
        this.stop();
        const intervalHours = sanitizeIntervalHours(this.settings.intervalHours);
        this.settings.intervalHours = intervalHours;
        const cronExpr = cronExpressionForIntervalHours(intervalHours);
        console.log(`[BackupManager] Démarrage — backup toutes les ${intervalHours}h (${cronExpr})`);
        this.cronJob = cron.schedule(cronExpr, () => this.runBackup());
    }

    stop(): void {
        this.cronJob?.stop();
        this.cronJob = null;
    }

    restart(): void {
        this.settings.enabled ? this.start() : this.stop();
    }

    // ── Restic helpers ────────────────────────────────────────────

    private async resticFor(dest: BackupDestination, args: string, extraEnv: Record<string, string> = {}): Promise<string> {
        const repoEnv = buildResticEnv(dest);
        const repo    = buildRepoUrl(dest);
        const allEnv  = { ...repoEnv, ...extraEnv };

        // SFTP + mot de passe → écrit dans un fichier tmp (chmod 600) pour sshpass -f
        // On ne passe PAS le mot de passe via env var car restic spawne sshpass
        // dans un sous-processus où l'héritage de SSHPASS n'est pas fiable.
        let tmpFile: string | null = null;
        try {
            if (dest.type === "sftp" && dest.sftp?.authMode === "password" && dest.sftp.password) {
                tmpFile = `/tmp/dockge_sshpass_${Date.now()}_${Math.random().toString(36).slice(2)}`;
                await fs.writeFile(tmpFile, dest.sftp.password, { mode: 0o600 });
            }

            const sftpOpts = buildSftpOptions(dest, tmpFile ?? undefined);
            const cmd = `restic --repo ${shellQuote(repo)} --json ${sftpOpts} ${args}`;
            const { stdout } = await execAsync(cmd, {
                maxBuffer: 20 * 1024 * 1024,
                timeout:   30 * 60 * 1000,
                env: {
                    PATH: "/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin",
                    ...process.env,
                    ...allEnv,
                },
            });
            return stdout.trim();
        } finally {
            if (tmpFile) await fs.unlink(tmpFile).catch(() => {});
        }
    }

    /** Initialise le repo d'une destination si pas encore fait */
    async initRepoFor(dest: BackupDestination): Promise<void> {
        try {
            await this.resticFor(dest, "snapshots --quiet");
            console.log(`[BackupManager] "${dest.label}" déjà initialisé.`);
        } catch (e: any) {
            const msg = e?.message ?? "";
            if (msg.includes("wrong password") || msg.includes("no key found")) {
                throw new Error(
                    `"${dest.label}" — Mot de passe incorrect. ` +
                    "Corrigez-le ou supprimez le dépôt pour repartir de zéro."
                );
            }
            console.log(`[BackupManager] Initialisation du repo "${dest.label}"...`);
            try {
                await this.resticFor(dest, "init");
                console.log(`[BackupManager] "${dest.label}" initialisé.`);
            } catch (initErr: any) {
                if ((initErr?.message ?? "").includes("config file already exists")) {
                    console.log(`[BackupManager] "${dest.label}" déjà initialisé (init ignoré).`);
                    return;
                }
                throw initErr;
            }
        }
    }

    /** Initialise la première destination activée (compat route /backup/init) */
    async initRepo(): Promise<void> {
        const dest = this.settings.destinations.find(d => d.enabled);
        if (!dest) throw new Error("Aucune destination activée");
        await this.initRepoFor(dest);
    }

    // ── Backup ────────────────────────────────────────────────────

    async runBackup(): Promise<BackupResult> {
        const start = Date.now();
        const result: BackupResult = {
            success: false,
            duration: 0,
            timestamp: new Date().toISOString(),
            destinations: [],
        };

        const activeDests = this.settings.destinations.filter(d => d.enabled);
        if (activeDests.length === 0) {
            result.error = "Aucune destination de backup activée";
            backupHistory.unshift(result);
            if (backupHistory.length > 20) backupHistory.splice(20);
            await saveHistory();
            return result;
        }

        const { paths, warnings } = await this.buildBackupPaths();
        result.warnings = warnings;
        if (paths.length === 0) {
            result.error = warnings.length > 0
                ? `Aucun fichier à sauvegarder — ${warnings.join(" ; ")}`
                : "Aucun fichier à sauvegarder";
            backupHistory.unshift(result);
            if (backupHistory.length > 20) backupHistory.splice(20);
            await saveHistory();
            return result;
        }

        const pathArgs = paths.map(shellQuote).join(" ");
        const tagArg   = ["--tag", shellQuote("dockge-enhanced"), "--tag", shellQuote(new Date().toISOString().slice(0,10))].join(" ");
        const excludes = [
            `--exclude ${shellQuote("*.log")}`,
            `--exclude ${shellQuote("__pycache__")}`,
            `--exclude ${shellQuote("node_modules")}`,
        ].join(" ");

        let totalDataAdded = 0;
        let allSuccess = true;

        for (const dest of activeDests) {
            const destResult: DestinationResult = {
                label: dest.label,
                type:  dest.type,
                success: false,
                warnings,
            };

            try {
                if (!dest.resticPassword) {
                    throw new Error(`Mot de passe Restic non configuré pour "${dest.label}"`);
                }

                await this.initRepoFor(dest);

                const stdout = await this.resticFor(dest, `backup ${pathArgs} ${tagArg} ${excludes}`);

                const lines = stdout.split("\n").filter(Boolean);
                const summary = lines.reduce<Record<string, unknown> | null>((acc, line) => {
                    try {
                        const obj = JSON.parse(line) as Record<string, unknown>;
                        return obj.message_type === "summary" ? obj : acc;
                    } catch { return acc; }
                }, null);

                destResult.success    = true;
                destResult.snapshotId = (summary?.snapshot_id as string)?.slice(0, 8);
                destResult.dataAdded  = summary?.data_added as number ?? 0;
                totalDataAdded       += destResult.dataAdded;

                if (!result.snapshotId) result.snapshotId = destResult.snapshotId;
                if (!result.filesNew)     result.filesNew     = summary?.files_new     as number ?? 0;
                if (!result.filesChanged) result.filesChanged = summary?.files_changed as number ?? 0;

                await this.runForgetFor(dest);

                console.log(
                    `[BackupManager] ✅ "${dest.label}" — Snapshot ${destResult.snapshotId} ` +
                    `+${formatBytes(destResult.dataAdded)} en ${formatDuration(Date.now() - start)}`
                );
            } catch (e: unknown) {
                destResult.error = e instanceof Error ? e.message : String(e);
                allSuccess = false;
                if (!result.error) result.error = destResult.error;
                console.error(`[BackupManager] ❌ "${dest.label}":`, destResult.error);
            }

            result.destinations!.push(destResult);
        }

        result.success   = allSuccess;
        result.dataAdded = totalDataAdded;
        result.duration  = Date.now() - start;

        backupHistory.unshift(result);
        if (backupHistory.length > 20) backupHistory.splice(20);
        await saveHistory();

        await this.sendNotification(result);

        return result;
    }

    private async buildBackupPaths(): Promise<BackupPathsResult> {
        const paths: string[] = [];
        const warnings: string[] = [];
        const seen = new Set<string>();

        const addExistingPath = async (candidate: string, label: string): Promise<void> => {
            const p = candidate.trim();
            if (!p) return;
            try {
                await fs.access(p);
                if (!seen.has(p)) {
                    seen.add(p);
                    paths.push(p);
                }
            } catch {
                warnings.push(`${label} absent ou non monté : ${p}`);
            }
        };

        // Parcourt les stacks
        try {
            const stacks = await fs.readdir(STACKS_DIR);
            for (const stack of stacks) {
                const stackDir = path.join(STACKS_DIR, stack);
                try {
                    const stat = await fs.stat(stackDir);
                    if (!stat.isDirectory()) continue;
                } catch { continue; }

                let composeFound = false;
                for (const name of ["compose.yaml", "docker-compose.yml", "docker-compose.yaml"]) {
                    const p = path.join(stackDir, name);
                    try {
                        await fs.access(p);
                        if (!seen.has(p)) {
                            seen.add(p);
                            paths.push(p);
                        }
                        composeFound = true;
                        break;
                    } catch { /* next */ }
                }
                if (!composeFound) warnings.push(`Compose introuvable pour la stack : ${stack}`);

                if (this.settings.includeEnvFiles) {
                    const envPath = path.join(stackDir, ".env");
                    try {
                        await fs.access(envPath);
                        if (!seen.has(envPath)) {
                            seen.add(envPath);
                            paths.push(envPath);
                        }
                    } catch { /* .env optionnel */ }
                }
            }
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            warnings.push(`Impossible de lire STACKS_DIR (${STACKS_DIR}) : ${msg}`);
            console.error("[BackupManager] Impossible de lire STACKS_DIR:", e);
        }

        // Volumes sélectionnés (entiers ou sous-dossiers spécifiques)
        for (const selected of this.settings.volumeBackup?.selectedVolumes ?? []) {
            await addExistingPath(selected, "Volume sélectionné");
        }

        // Chemins supplémentaires configurés
        for (const extra of this.settings.extraPaths ?? []) {
            await addExistingPath(extra, "Chemin supplémentaire");
        }

        return { paths, warnings };
    }

    /** Retourne la taille sur disque de DATA_DIR et des volumes sélectionnés */
    async getDirSizes(selectedVolumes: string[] = []): Promise<{ appData: string; volumes: Record<string, string> }> {
        const du = async (dir: string): Promise<string> => {
            try {
                const { stdout } = await execAsync(`du -sh ${shellQuote(dir)} 2>/dev/null`, { timeout: 15000 });
                return stdout.split("\t")[0].trim() || "?";
            } catch {
                return "?";
            }
        };
        const appData = await du(DATA_DIR);
        const volumes: Record<string, string> = {};
        await Promise.all(
            selectedVolumes.filter(v => v.trim()).map(async v => {
                volumes[v] = await du(v);
            })
        );
        return { appData, volumes };
    }

    /** Retourne les volumes montés dans le conteneur (filtrés) via docker inspect */
    async getMountedVolumes(): Promise<MountedVolume[]> {
        try {
            const { stdout: hostOut } = await execAsync("hostname", { timeout: 5000 });
            const containerId = hostOut.trim();
            const { stdout } = await execAsync(
                `docker inspect --format '{{json .Mounts}}' ${shellQuote(containerId)}`,
                { timeout: 10000 }
            );
            const raw = JSON.parse(stdout) as Array<{
                Type: string;
                Source: string;
                Destination: string;
            }>;
            return raw.filter(m => {
                if (m.Type === "tmpfs") return false;
                if (EXCLUDED_VOL_DESTINATIONS.has(m.Destination)) return false;
                if (EXCLUDED_VOL_PREFIXES.some(p => m.Destination.startsWith(p))) return false;
                return true;
            }).map(m => ({ source: m.Source, destination: m.Destination }));
        } catch {
            return [];
        }
    }

    /** Liste les sous-dossiers immédiats d'un chemin (sans tailles, rapide) */
    async getVolumeDirs(volPath: string): Promise<string[]> {
        try {
            const entries = await fs.readdir(volPath, { withFileTypes: true });
            return entries.filter(e => e.isDirectory()).map(e => e.name).sort();
        } catch { return []; }
    }

    /** Calcule la taille de chaque sous-dossier d'un chemin (du -sh, à la demande) */
    async getVolumeSubdirSizes(volPath: string): Promise<Record<string, string>> {
        const dirs = await this.getVolumeDirs(volPath);
        const results: Record<string, string> = {};
        await Promise.all(dirs.map(async dir => {
            const p = path.join(volPath, dir);
            try {
                const { stdout } = await execAsync(`du -sh ${shellQuote(p)} 2>/dev/null`, { timeout: 60000 });
                results[dir] = stdout.split("\t")[0].trim() || "?";
            } catch { results[dir] = "?"; }
        }));
        return results;
    }

    private async runForgetFor(dest: BackupDestination): Promise<void> {
        const r = this.settings.retention;
        const args = [
            `--keep-last ${sanitizeRetention(r.keepLast)}`,
            `--keep-daily ${sanitizeRetention(r.keepDaily)}`,
            `--keep-weekly ${sanitizeRetention(r.keepWeekly)}`,
            `--keep-monthly ${sanitizeRetention(r.keepMonthly)}`,
            "--tag", shellQuote("dockge-enhanced"),
            "--prune",
        ].join(" ");
        await this.resticFor(dest, `forget ${args}`);
    }

    /** Retourne la première destination activée (pour snapshots/restore) */
    private primaryDest(): BackupDestination {
        const d = this.settings.destinations.find(dest => dest.enabled);
        if (!d) throw new Error("Aucune destination de backup activée");
        return d;
    }

    // ── Snapshots ─────────────────────────────────────────────────

    async listSnapshots(): Promise<ResticSnapshot[]> {
        try {
            const stdout = await this.resticFor(this.primaryDest(), `snapshots --tag ${shellQuote("dockge-enhanced")}`);
            return JSON.parse(stdout) as ResticSnapshot[];
        } catch {
            return [];
        }
    }

    async deleteSnapshot(id: string): Promise<void> {
        await this.resticFor(this.primaryDest(), `forget ${shellQuote(assertSafeResticId(id))} --prune`);
    }

    /**
     * Liste les fichiers d'un snapshot avec :
     *   - déduplication des alias (même fichier physique accessible via plusieurs chemins montés)
     *   - extraction des noms de services depuis les compose.yaml sur disque
     *   - diskStatus  : comparaison vs fichier actuellement sur le disque
     *   - snapDiff    : comparaison vs snapshot précédent (via restic diff)
     */
    async listSnapshotFiles(snapshotId: string): Promise<SnapshotFile[]> {
        try {
            // ── 1. Trouve le snapshot précédent ─────────────────────────
            const allSnaps = await this.listSnapshots();
            allSnaps.sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
            const idx = allSnaps.findIndex(
                s => s.id.startsWith(snapshotId) || s.short_id === snapshotId
            );
            const prevSnap = idx > 0 ? allSnaps[idx - 1] : null;

            // ── 1b. Charge les volumes montés pour identifier les fichiers de données ──
            let mountedVols: MountedVolume[] = [];
            try { mountedVols = await this.getMountedVolumes(); } catch {}
            // Plus long en premier → on prend toujours le mount le plus spécifique
            const sortedVols = [...mountedVols].sort((a, b) => b.destination.length - a.destination.length);

            // ── 2. Liste tous les fichiers du snapshot ───────────────────
            const stdout = await this.resticFor(this.primaryDest(), `ls ${shellQuote(assertSafeResticId(snapshotId))} --json --long`);

            // ── 3. Parse et groupe par (stack, name) pour dédupliquer ────
            // Un fichier est "direct dans la stack" s'il se trouve exactement au niveau
            // <stacksBase>/<stack>/<file> — compose.yaml et .env uniquement.
            // Les fichiers imbriqués plus profond (volumes) restent individuels.
            const stacksBase = path.basename(STACKS_DIR);
            type RawEntry = { path: string; name: string; stack: string; size: number; mtime: string; volumeRelPath?: string };
            const groups = new Map<string, RawEntry[]>();
            const standalones: RawEntry[] = [];

            for (const line of stdout.split("\n").filter(Boolean)) {
                let entry: Record<string, unknown>;
                try { entry = JSON.parse(line); } catch { continue; }
                if (entry.struct_type !== "node" || entry.type !== "file") continue;

                const filePath = entry.path as string;
                const name = path.basename(filePath);
                const parts = filePath.split("/");
                const stacksIdx = parts.lastIndexOf(stacksBase);
                const isDirectInStack = stacksIdx >= 0 && parts.length - 1 === stacksIdx + 2;
                const stack = isDirectInStack ? parts[stacksIdx + 1] : "unknown";

                const raw: RawEntry = {
                    path: filePath, name, stack,
                    size: (entry.size as number) ?? 0,
                    mtime: entry.mtime as string,
                };

                if (isDirectInStack) {
                    const key = `${stack}::${name}`;
                    if (!groups.has(key)) groups.set(key, []);
                    groups.get(key)!.push(raw);
                } else {
                    // Tente de rattacher à un volume monté (plus long en premier = plus spécifique)
                    for (const vol of sortedVols) {
                        const prefix = vol.destination.endsWith("/") ? vol.destination : vol.destination + "/";
                        if (filePath.startsWith(prefix)) {
                            const rel = filePath.slice(prefix.length);
                            const firstSeg = rel.split("/")[0];
                            raw.stack = firstSeg || path.basename(vol.destination);
                            raw.volumeRelPath = rel;
                            break;
                        }
                    }
                    standalones.push(raw);
                }
            }

            // ── 4. Construit les SnapshotFile (chemin canonique + aliases) ──
            const fileMap = new Map<string, SnapshotFile>();

            const makeFile = async (entries: RawEntry[]): Promise<SnapshotFile> => {
                // Préfère le chemin sous STACKS_DIR comme canonique, sinon le plus court
                entries.sort((a, b) => {
                    const aCanon = a.path.startsWith(STACKS_DIR + "/");
                    const bCanon = b.path.startsWith(STACKS_DIR + "/");
                    if (aCanon !== bCanon) return aCanon ? -1 : 1;
                    return a.path.length - b.path.length;
                });
                const canon = entries[0];
                const aliases = entries.length > 1 ? entries.slice(1).map(e => e.path) : undefined;

                const isCompose = /^(compose|docker-compose)(\.ya?ml)?$/.test(canon.name);
                const isEnv = canon.name === ".env";
                const isVolume = !!canon.volumeRelPath;

                // Statut vs disque
                let diskStatus: "unchanged" | "modified" | "missing";
                try {
                    const stat = await fs.stat(canon.path);
                    diskStatus = stat.mtime.getTime() > new Date(canon.mtime).getTime() + 2000
                        ? "modified" : "unchanged";
                } catch { diskStatus = "missing"; }

                // Noms de services depuis le compose.yaml sur disque (non-bloquant)
                let services: string[] | undefined;
                if (isCompose && diskStatus !== "missing") {
                    try {
                        const raw = await fs.readFile(canon.path, "utf8");
                        const doc = yaml.load(raw) as Record<string, unknown>;
                        if (doc?.services && typeof doc.services === "object") {
                            services = Object.keys(doc.services as object).filter(Boolean);
                        }
                    } catch { /* non-bloquant */ }
                }

                return {
                    path: canon.path,
                    name: canon.name,
                    stack: canon.stack,
                    ...(canon.volumeRelPath ? { relativePath: canon.volumeRelPath } : {}),
                    services,
                    aliases,
                    type: isCompose ? "compose" : isEnv ? "env" : isVolume ? "volume" : "other",
                    size: canon.size,
                    mtime: canon.mtime,
                    diskStatus,
                    snapDiff: prevSnap ? "unchanged" : "added",
                    prevSnapshotId: prevSnap?.short_id ?? null,
                };
            };

            const allGroups = [
                ...[...groups.values()],
                ...standalones.map(r => [r]),
            ];
            const files = await Promise.all(allGroups.map(makeFile));

            // Enregistre canonical + aliases dans la map pour la résolution du diff
            for (const file of files) {
                fileMap.set(file.path, file);
                for (const alias of (file.aliases ?? [])) fileMap.set(alias, file);
            }

            // ── 5. Diff vs snapshot précédent ────────────────────────────
            if (prevSnap) {
                try {
                    const diffOut = await this.resticFor(this.primaryDest(), `diff ${shellQuote(assertSafeResticId(prevSnap.short_id))} ${shellQuote(assertSafeResticId(snapshotId))}`);
                    for (const line of diffOut.split("\n").filter(Boolean)) {
                        let change: Record<string, unknown>;
                        try { change = JSON.parse(line); } catch { continue; }
                        if (change.message_type !== "change") continue;
                        const f = fileMap.get(change.path as string);
                        if (!f) continue;
                        const mod = change.modifier as string;
                        if (mod === "+")      f.snapDiff = "added";
                        else if (mod === "M") f.snapDiff = "modified";
                    }
                } catch { /* diff indisponible, on garde "unchanged" */ }
            }

            const typeOrder: Record<string, number> = { compose: 0, env: 1, volume: 2, other: 3 };
            return files.sort((a, b) => {
                if (a.stack !== b.stack) return a.stack.localeCompare(b.stack);
                const ao = typeOrder[a.type] ?? 3;
                const bo = typeOrder[b.type] ?? 3;
                if (ao !== bo) return ao - bo;
                return (a.relativePath ?? a.name).localeCompare(b.relativePath ?? b.name);
            });
        } catch (e) {
            console.error("[BackupManager] listSnapshotFiles error:", e);
            return [];
        }
    }

    /** Restaure une liste de fichiers depuis un snapshot à leur emplacement d'origine */
    async restoreFiles(snapshotId: string, filePaths: string[]): Promise<{ restored: number; errors: string[] }> {
        if (filePaths.length === 0) return { restored: 0, errors: [] };
        const safeSnapshotId = shellQuote(assertSafeResticId(snapshotId));
        const includes = filePaths
            .map(p => p.trim())
            .filter(Boolean)
            .map(p => `--include ${shellQuote(p)}`)
            .join(" ");
        try {
            await this.resticFor(this.primaryDest(), `restore ${safeSnapshotId} --target ${shellQuote("/")} ${includes}`);
            return { restored: filePaths.length, errors: [] };
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : String(e);
            return { restored: 0, errors: [msg] };
        }
    }

    /** Retourne une copie de l'historique en lecture seule */
    getHistory(): Readonly<BackupResult[]> {
        return backupHistory;
    }

    // ── Notifications (Discord + Apprise) ────────────────────────

    private async loadAppriseNotifier(): Promise<AppriseNotifier | null> {
        try {
            const raw  = await fs.readFile(WATCHER_SETTINGS_PATH, "utf8");
            const data = JSON.parse(raw) as Record<string, unknown>;
            const serverUrl = typeof data.appriseServerUrl === "string" ? data.appriseServerUrl : "";
            const urls = Array.isArray(data.appriseUrls) ? data.appriseUrls as string[] : [];
            if (!serverUrl) return null;
            return new AppriseNotifier(serverUrl, urls);
        } catch {
            return null;
        }
    }

    private async sendNotification(result: BackupResult): Promise<void> {
        const discord  = this.settings.discordWebhooks.length > 0
            ? new DiscordNotifier(this.settings.discordWebhooks)
            : null;
        const apprise  = await this.loadAppriseNotifier();
        if (!discord && !apprise) return;

        const en       = (this.settings.notificationLang ?? "fr") === "en";
        const locale   = en ? "en-GB" : "fr-FR";
        const t        = (fr: string, enStr: string) => en ? enStr : fr;

        if (result.success) {
            const title  = t("✅ Backup Dockge réussi", "✅ Dockge backup successful");
            const descr  = `Snapshot \`${result.snapshotId}\` ${t("créé avec succès", "created successfully")}`;
            const fields: Array<{ name: string; value: string; inline: boolean }> = [
                { name: t("Durée", "Duration"),
                  value: formatDuration(result.duration),                                  inline: true },
                { name: t("Données ajoutées", "Data added"),
                  value: formatBytes(result.dataAdded ?? 0),                               inline: true },
                { name: t("Fichiers", "Files"),
                  value: `${result.filesNew} ${t("nouveaux", "new")} · ${result.filesChanged} ${t("modifiés", "modified")}`,
                  inline: true },
                { name: t("Destinations", "Destinations"),
                  value: (result.destinations ?? [])
                      .map(d => `${d.success ? "✅" : "❌"} ${d.label}`)
                      .join("\n") || "—",
                  inline: true },
            ];

            if ((result.warnings ?? []).length > 0) {
                fields.push({
                    name: t("Avertissements", "Warnings"),
                    value: result.warnings!.slice(0, 8).join("\n"),
                    inline: false,
                });
            }

            if (discord) {
                await discord.sendEmbed({
                    title, color: 0x22c55e, description: descr, fields,
                    footer: `Dockge Enhanced — Backup · ${new Date(result.timestamp).toLocaleString(locale)}`,
                });
            }
            if (apprise) {
                const body = `${descr}\n\n${fields.map(f => `**${f.name}**: ${f.value}`).join("\n")}`;
                await apprise.send({ title, body, type: "success" });
            }
        } else {
            const title  = t("❌ Échec du backup Dockge", "❌ Dockge backup failed");
            const descr  = `**${t("Erreur", "Error")} :** ${result.error}`;
            const fields: Array<{ name: string; value: string; inline: boolean }> = [
                { name: t("Durée", "Duration"),
                  value: formatDuration(result.duration),                                  inline: true },
                { name: t("Destinations", "Destinations"),
                  value: (result.destinations ?? [])
                      .map(d => `${d.success ? "✅" : "❌"} ${d.label}`)
                      .join("\n") || "—",
                  inline: true },
            ];

            if ((result.warnings ?? []).length > 0) {
                fields.push({
                    name: t("Avertissements", "Warnings"),
                    value: result.warnings!.slice(0, 8).join("\n"),
                    inline: false,
                });
            }

            if (discord) {
                await discord.sendEmbed({
                    title, color: 0xef4444, description: descr, fields,
                    footer: `Dockge Enhanced — Backup · ${new Date(result.timestamp).toLocaleString(locale)}`,
                });
            }
            if (apprise) {
                const body = `${descr}\n\n${fields.map(f => `**${f.name}**: ${f.value}`).join("\n")}`;
                await apprise.send({ title, body, type: "failure" });
            }
        }
    }
}
