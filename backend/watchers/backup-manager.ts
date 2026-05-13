/**
 * BackupManager — Gère les sauvegardes Restic des compose.yaml et .env
 * Supporte : local, SFTP, S3/B2, Restic REST server
 * Fichier : backend/watchers/backup-manager.ts
 */

import * as cron from "node-cron";
import { exec, spawn } from "child_process";
import { promisify } from "util";
import * as readline from "readline";
import * as fs from "fs/promises";
import * as path from "path";
import * as yaml from "js-yaml";
import { DiscordNotifier } from "../notification/discord";
import { AppriseNotifier } from "../notification/apprise";
import { Settings } from "../settings";

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
    backupOnSave: boolean;               // déclenche un backup immédiat quand un compose est sauvegardé
    excludedStacks: string[];            // stacks exclues de la sauvegarde
    excludePatterns: string[];           // patterns restic --exclude supplémentaires (ex: *.wal, *.tmp)
    restoreTest: boolean;                // lit un fichier depuis chaque snapshot pour vérifier la lisibilité
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

export interface RestoreTestResult {
    ok: boolean;
    testedFile?: string;
    error?: string;
}

export interface DestinationResult {
    label: string;
    type: string;
    success: boolean;
    snapshotId?: string;
    dataAdded?: number;
    error?: string;
    warnings?: string[];
    restoreTest?: RestoreTestResult;
}

export interface BackupResult {
    success: boolean;               // true si toutes les destinations ont réussi
    trigger?: "scheduled" | "manual" | "on-save";
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
        // Restic parse la valeur de -o sftp.command= avec le parseur CSV de Go :
        // les guillemets " dans un champ non-quoté provoquent "bare quote" error.
        // Restic split ensuite la valeur par espace pour construire ses argv →
        // pas besoin de shell-quoting ici, juste les valeurs brutes.
        const sshCommand = [
            "/usr/bin/sshpass",
            "-f", tmpFile,
            "/usr/bin/ssh",
            "-l", s.user,
            "-p", String(port),
            "-o", "StrictHostKeyChecking=no",
            "-o", "PreferredAuthentications=password",
            "-o", "BatchMode=no",
            s.host,
            "-s", "sftp",
        ].join(" ");
        return `-o ${shellQuote(`sftp.command=${sshCommand}`)}`;
    }

    if (s.authMode === "key") {
        // Même raison : pas de guillemets dans sftp.args
        const sshArgs = [
            ...(s.keyPath ? ["-i", s.keyPath] : []),
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
    private cronJob:          cron.ScheduledTask | null = null;
    private stalenessCron:    cron.ScheduledTask | null = null;
    private lastStalenessNotif = 0;
    private lastOnSaveTrigger  = 0;

    // Destinations dont le backup est actuellement en cours { label → timestamp démarrage }
    private runningDests = new Map<string, number>();

    getRunningDests(): { label: string; startedAt: number }[] {
        return Array.from(this.runningDests.entries()).map(([label, startedAt]) => ({ label, startedAt }));
    }

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
        backupOnSave: true,
        excludedStacks: [],
        excludePatterns: [],
        restoreTest: true,
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
        this.cronJob = cron.schedule(cronExpr, () => this.runBackup({ trigger: "scheduled" }));
        this.stalenessCron = cron.schedule("0 * * * *", () => this.checkStaleness().catch(console.error));
    }

    stop(): void {
        this.cronJob?.stop();
        this.cronJob = null;
        this.stalenessCron?.stop();
        this.stalenessCron = null;
    }

    restart(): void {
        this.settings.enabled ? this.start() : this.stop();
    }

    // ── Restic helpers ────────────────────────────────────────────

    private async resticFor(dest: BackupDestination, args: string, extraEnv: Record<string, string> = {}, toleratedExitCodes: number[] = []): Promise<string> {
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
            try {
                const { stdout } = await execAsync(cmd, {
                    maxBuffer: 20 * 1024 * 1024,
                    timeout:   2 * 60 * 60 * 1000,  // 2 hours
                    env: {
                        PATH: "/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin",
                        ...process.env,
                        ...allEnv,
                    },
                });
                return stdout.trim();
            } catch (e: any) {
                if (toleratedExitCodes.includes(e?.code) && typeof e?.stdout === "string") {
                    return e.stdout.trim();
                }
                throw e;
            }
        } finally {
            if (tmpFile) await fs.unlink(tmpFile).catch(() => {});
        }
    }

    /**
     * Streams `restic ls <snapshotId> --json --long [paths...]` via spawn + readline.
     * Évite la limite maxBuffer de execAsync sur les snapshots de grande taille.
     * Attend la fermeture de readline (toutes les lignes traitées) avant de résoudre,
     * puis vérifie le code de sortie pour rejeter en cas d'erreur.
     * Timeout configurable (défaut 120 s).
     */
    /**
     * lineFilter : filtre appliqué sur chaque ligne brute PENDANT le streaming,
     * avant JSON.parse — évite d'accumuler des millions de lignes en mémoire.
     * Utiliser des checks sur les chaînes (ex: line.includes('"type":"file"'))
     * plutôt que JSON.parse pour rester rapide.
     */
    private resticLsLines(
        dest: BackupDestination,
        snapshotId: string,
        timeoutMs: number = 120_000,
        lineFilter?: (line: string) => boolean,
    ): Promise<string[]> {
        return new Promise(async (resolve, reject) => {
            const repoEnv = buildResticEnv(dest);
            const repo    = buildRepoUrl(dest);
            let tmpFile: string | null = null;
            let settled   = false;
            let timer: ReturnType<typeof setTimeout> | null = null;

            const cleanup = (tf: string | null) => {
                if (timer) { clearTimeout(timer); timer = null; }
                if (tf) fs.unlink(tf).catch(() => {});
            };
            const fail = (err: unknown, tf: string | null) => {
                if (settled) return;
                settled = true;
                cleanup(tf);
                reject(err);
            };

            try {
                if (dest.type === "sftp" && dest.sftp?.authMode === "password" && dest.sftp.password) {
                    tmpFile = `/tmp/dockge_sshpass_${Date.now()}_${Math.random().toString(36).slice(2)}`;
                    await fs.writeFile(tmpFile, dest.sftp.password, { mode: 0o600 });
                }

                const sftpOpts  = buildSftpOptions(dest, tmpFile ?? undefined);
                const safeId    = assertSafeResticId(snapshotId);
                // Pas de restriction de chemin : restic ls /chemin ne liste que les
                // enfants directs (non récursif). On filtre en streaming à la place.
                const cmd       = `restic --repo ${shellQuote(repo)} --json ${sftpOpts} ls ${shellQuote(safeId)} --json --long`;

                console.log(`[BackupManager] resticLsLines cmd: ${cmd}`);

                const proc = spawn("sh", ["-c", cmd], {
                    env: {
                        PATH: "/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin",
                        ...process.env,
                        ...repoEnv,
                    },
                });

                // Timeout watchdog
                timer = setTimeout(() => {
                    proc.kill();
                    fail(new Error(`restic ls timed out after ${timeoutMs / 1000}s`), tmpFile);
                }, timeoutMs);

                const lines: string[] = [];
                const rl = readline.createInterface({ input: proc.stdout, crlfDelay: Infinity });
                rl.on("line", (line: string) => {
                    if (!line) return;
                    if (lineFilter && !lineFilter(line)) return;
                    lines.push(line);
                });

                let exitCode: number | null = null;
                let stderr = "";
                proc.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });

                // Capture exit code early; resolution happens on rl 'close'
                // (guarantees all line events have fired before we resolve)
                proc.on("exit", (code) => { exitCode = code; });

                rl.on("close", () => {
                    if (settled) return;
                    settled = true;
                    cleanup(tmpFile);
                    if (exitCode === 0 || exitCode === null) {
                        console.log(`[BackupManager] resticLsLines: ${lines.length} lignes reçues`);
                        resolve(lines);
                    } else {
                        reject(new Error(`restic ls exited with code ${exitCode}: ${stderr.slice(0, 500)}`));
                    }
                });

                proc.on("error", (err: Error) => fail(err, tmpFile));

            } catch (err) {
                fail(err, tmpFile);
            }
        });
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

    /**
     * Déclenche un backup immédiat si le backup est activé et si l'option
     * backupOnSave est activée. Un cooldown de 60 s évite les déclenchements
     * en rafale lors de sauvegardes successives rapides.
     */
    triggerBackupOnSave(stackName: string): void {
        if (!this.settings.enabled || !this.settings.backupOnSave) return;
        const now = Date.now();
        if (now - this.lastOnSaveTrigger < 60_000) {
            console.log(`[BackupManager] on-save ignoré (cooldown) — stack "${stackName}"`);
            return;
        }
        this.lastOnSaveTrigger = now;
        console.log(`[BackupManager] Backup déclenché par la sauvegarde de "${stackName}"`);
        this.runBackup({ skipForget: true, tag: "on-save", trigger: "on-save" })
            .catch(e => console.error("[BackupManager] Backup on-save échoué:", e));
    }

    async runBackup(opts: { skipForget?: boolean; tag?: string; trigger?: "scheduled" | "manual" | "on-save" } = {}): Promise<BackupResult> {
        const start = Date.now();
        const trigger = opts.trigger ?? (opts.tag === "on-save" ? "on-save" : "manual");
        const result: BackupResult = {
            success: false,
            trigger,
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
        const tags = ["dockge-enhanced", new Date().toISOString().slice(0, 10), trigger];
        if (opts.tag && !tags.includes(opts.tag)) tags.push(opts.tag);
        const tagArg = tags.map(t => `--tag ${shellQuote(t)}`).join(" ");
        const builtinExcludes = ["*.log", "__pycache__", "node_modules"];
        const userExcludes    = this.settings.excludePatterns ?? [];
        const excludes = [...builtinExcludes, ...userExcludes]
            .map(p => `--exclude ${shellQuote(p)}`).join(" ");

        let totalDataAdded = 0;
        let allSuccess = true;

        console.log(`[BackupManager] ▶ Backup démarré (${activeDests.length} destination(s))`);

        for (const dest of activeDests) {
            const destResult: DestinationResult = {
                label: dest.label,
                type:  dest.type,
                success: false,
                warnings,
            };

            const destStart = Date.now();
            this.runningDests.set(dest.label, destStart);
            console.log(`[BackupManager] ▶ "${dest.label}" démarré…`);

            try {
                if (!dest.resticPassword) {
                    throw new Error(`Mot de passe Restic non configuré pour "${dest.label}"`);
                }

                // Libère un éventuel verrou obsolète avant toute opération restic
                try { await this.resticFor(dest, "unlock --remove-all"); } catch { /* ignore */ }

                await this.initRepoFor(dest);

                const stdout = await this.resticFor(dest, `backup -q ${pathArgs} ${tagArg} ${excludes}`, {}, [3]);

                const lines = stdout.split("\n").filter(Boolean);
                const summary = lines.reduce<Record<string, unknown> | null>((acc, line) => {
                    try {
                        const obj = JSON.parse(line) as Record<string, unknown>;
                        return obj.message_type === "summary" ? obj : acc;
                    } catch { return acc; }
                }, null);

                // Collecte les fichiers non lisibles signalés par restic (exit 3)
                const resticErrors = lines.flatMap(line => {
                    try {
                        const obj = JSON.parse(line) as Record<string, unknown>;
                        if (obj.message_type === "error") {
                            const msg = (obj.error as Record<string, unknown>)?.message ?? obj.item ?? line;
                            return [String(msg)];
                        }
                    } catch { /* ignore */ }
                    return [];
                });
                if (resticErrors.length > 0) {
                    if (!result.warnings) result.warnings = [];
                    result.warnings.push(...resticErrors.map(m => `[${dest.label}] ${m}`));
                    if (!destResult.warnings) destResult.warnings = [];
                    destResult.warnings.push(...resticErrors);
                }

                destResult.success    = true;
                destResult.snapshotId = (summary?.snapshot_id as string)?.slice(0, 8);
                destResult.dataAdded  = summary?.data_added as number ?? 0;
                totalDataAdded       += destResult.dataAdded;

                if (!result.snapshotId) result.snapshotId = destResult.snapshotId;
                if (!result.filesNew)     result.filesNew     = summary?.files_new     as number ?? 0;
                if (!result.filesChanged) result.filesChanged = summary?.files_changed as number ?? 0;

                if (!opts.skipForget) {
                    await this.runForgetFor(dest);

                    // Restore test : lit un fichier depuis le snapshot pour prouver la lisibilité
                    if (this.settings.restoreTest && destResult.snapshotId) {
                        destResult.restoreTest = await this.runRestoreTest(dest, destResult.snapshotId);
                        if (!destResult.restoreTest.ok) {
                            const msg = destResult.restoreTest.error ?? "Lecture du snapshot impossible";
                            if (!result.warnings) result.warnings = [];
                            result.warnings.push(`[${dest.label}] Restore test échoué : ${msg}`);
                            console.warn(`[BackupManager] ⚠️ Restore test "${dest.label}" échoué:`, msg);
                        } else {
                            console.log(
                                `[BackupManager] 🔍 Restore test "${dest.label}" OK` +
                                (destResult.restoreTest.testedFile ? ` — ${destResult.restoreTest.testedFile}` : "")
                            );
                        }
                    }
                }

                console.log(
                    `[BackupManager] ✓ "${dest.label}" terminé en ${formatDuration(Date.now() - destStart)}` +
                    ` — Snapshot ${destResult.snapshotId} +${formatBytes(destResult.dataAdded)}` +
                    (opts.skipForget ? " [on-save, pruning différé]" : "")
                );
            } catch (e: unknown) {
                destResult.error = e instanceof Error ? e.message : String(e);
                allSuccess = false;
                if (!result.error) result.error = destResult.error;
                console.error(`[BackupManager] ❌ "${dest.label}" échoué en ${formatDuration(Date.now() - destStart)}:`, destResult.error);
            } finally {
                this.runningDests.delete(dest.label);
            }

            result.destinations!.push(destResult);
        }

        console.log(`[BackupManager] ✓ Backup terminé en ${formatDuration(Date.now() - start)} — ${allSuccess ? "succès" : "échec(s)"}`);


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
        const excludedSet = new Set(this.settings.excludedStacks ?? []);
        try {
            const stacks = await fs.readdir(STACKS_DIR);
            for (const stack of stacks) {
                const stackDir = path.join(STACKS_DIR, stack);
                try {
                    const stat = await fs.stat(stackDir);
                    if (!stat.isDirectory()) continue;
                } catch { continue; }

                if (excludedSet.has(stack)) {
                    console.log(`[BackupManager] Stack "${stack}" exclue de la sauvegarde — ignorée`);
                    continue;
                }

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

    /** Retourne la liste des stacks présentes dans STACKS_DIR */
    async listStacks(): Promise<string[]> {
        try {
            const entries = await fs.readdir(STACKS_DIR, { withFileTypes: true });
            return entries
                .filter(e => e.isDirectory())
                .map(e => e.name)
                .sort();
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
        // Libère un éventuel verrou laissé par le backup (ex: crash, timeout)
        try { await this.resticFor(dest, "unlock --remove-all"); } catch { /* ignore */ }

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
        const dest = this.primaryDest();
        try { await this.resticFor(dest, "unlock --remove-all"); } catch { /* ignore */ }
        await this.resticFor(dest, `forget ${shellQuote(assertSafeResticId(id))} --prune`);
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
            const prevSnap    = idx > 0 ? allSnaps[idx - 1] : null;
            const currentSnap = idx >= 0 ? allSnaps[idx]   : null;

            // ── 1b. Charge les volumes montés pour identifier les fichiers de données ──
            let mountedVols: MountedVolume[] = [];
            try { mountedVols = await this.getMountedVolumes(); } catch {}
            // Plus long en premier → on prend toujours le mount le plus spécifique
            const sortedVols = [...mountedVols].sort((a, b) => b.destination.length - a.destination.length);

            // ── 2. Liste les fichiers du snapshot en deux passes ─────────────
            // restic ls /chemin est NON-RÉCURSIF (enfants directs seulement).
            // Passe A : ls /opt/stacks → liste les sous-dossiers de stacks.
            // Passe B : ls /opt/stacks/stack1 /opt/stacks/stack2 … → liste les
            //           fichiers directement dans chaque stack (compose.yaml, .env).
            // Les deux appels sont petits → resticFor (exec) convient.
            const safeId = shellQuote(assertSafeResticId(snapshotId));

            // Passe A — sous-dossiers de STACKS_DIR
            const passA = await this.resticFor(this.primaryDest(), `ls ${safeId} ${shellQuote(STACKS_DIR)} --json --long`);
            const stackPaths: string[] = [];
            for (const line of passA.split("\n").filter(Boolean)) {
                try {
                    const e = JSON.parse(line) as Record<string, unknown>;
                    if (e.type === "dir" && typeof e.path === "string" && e.path !== STACKS_DIR) {
                        const parentDir = path.dirname(e.path as string);
                        if (parentDir === STACKS_DIR) stackPaths.push(e.path as string);
                    }
                } catch { /* ignore */ }
            }
            console.log(`[BackupManager] listSnapshotFiles: ${stackPaths.length} stacks détectés`);

            if (stackPaths.length === 0) return [];

            // Passe B — fichiers dans chaque stack (compose.yaml, .env…)
            const stackArgs = stackPaths.map(p => shellQuote(p)).join(" ");
            const passB = await this.resticFor(this.primaryDest(), `ls ${safeId} ${stackArgs} --json --long`);
            const lsLines = passB.split("\n").filter(line => line.includes('"type":"file"'));
            console.log(`[BackupManager] listSnapshotFiles: ${lsLines.length} fichiers trouvés`);

            // ── 3. Parse et groupe par (stack, name) pour dédupliquer ────
            // Un fichier est "direct dans la stack" s'il se trouve exactement au niveau
            // <stacksBase>/<stack>/<file> — compose.yaml et .env uniquement.
            // Les fichiers imbriqués plus profond (volumes) restent individuels.
            const stacksBase = path.basename(STACKS_DIR);
            type RawEntry = { path: string; name: string; stack: string; size: number; mtime: string; volumeRelPath?: string };
            const groups = new Map<string, RawEntry[]>();
            const standalones: RawEntry[] = [];

            for (const line of lsLines) {
                let entry: Record<string, unknown>;
                try { entry = JSON.parse(line); } catch { continue; }
                // restic ls --json : les nodes ont { type: "file"|"dir" }
                // la ligne de résumé du snapshot n'a pas de champ "type"
                if (entry.type !== "file") continue;

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
            console.log(`[BackupManager] listSnapshotFiles: ${allGroups.length} fichiers, construction des métadonnées…`);
            const files = await Promise.all(allGroups.map(makeFile));
            console.log(`[BackupManager] listSnapshotFiles: métadonnées prêtes, lancement du diff…`);

            // Enregistre canonical + aliases dans la map pour la résolution du diff
            for (const file of files) {
                fileMap.set(file.path, file);
                for (const alias of (file.aliases ?? [])) fileMap.set(alias, file);
            }

            // ── 5. Diff vs snapshot précédent (timeout 15 s — info cosmétique) ─
            // restic diff traverse les deux arbres complets ; sur les gros repos ça
            // peut prendre plusieurs minutes. On abandonne si ça prend trop longtemps
            // et on conserve "unchanged" comme valeur par défaut.
            if (prevSnap) {
                const DIFF_TIMEOUT_MS = 15_000;
                try {
                    const diffPromise = this.resticFor(
                        this.primaryDest(),
                        `diff ${shellQuote(assertSafeResticId(prevSnap.short_id))} ${shellQuote(assertSafeResticId(snapshotId))}`
                    );
                    const timeoutPromise = new Promise<never>((_, rej) =>
                        setTimeout(() => rej(new Error("restic diff timeout")), DIFF_TIMEOUT_MS)
                    );
                    const diffOut = await Promise.race([diffPromise, timeoutPromise]);
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
                    console.log(`[BackupManager] listSnapshotFiles: diff terminé`);
                } catch (e) {
                    // Timeout ou erreur → on garde "unchanged" par défaut, pas bloquant
                    console.warn(`[BackupManager] listSnapshotFiles: diff ignoré (${(e as Error).message})`);
                }
            }

            // ── 6. Dossiers de volumes depuis snapshot.paths ──────────────
            // Les chemins hors STACKS_DIR sont des dossiers de volumes — on les
            // ajoute directement sans restic ls supplémentaire.
            // snapDiff : "added" si le chemin n'était pas dans le snapshot précédent,
            // "unchanged" sinon (on ne peut pas calculer "modified" sans restic diff).
            if (currentSnap) {
                const prevPaths = new Set(prevSnap?.paths ?? []);
                for (const p of currentSnap.paths) {
                    if (p.startsWith(STACKS_DIR + "/") || p === STACKS_DIR) continue;
                    if (p === "/var/run/docker.sock" || p === "/etc/hosts" || p === "/etc/hostname") continue;
                    const volName = path.basename(p);
                    let diskStatus: "unchanged" | "modified" | "missing" = "missing";
                    try { await fs.stat(p); diskStatus = "unchanged"; } catch { /* absent */ }
                    files.push({
                        path: p,
                        name: volName,
                        stack: volName,
                        type: "volume",
                        size: 0,
                        mtime: currentSnap.time,
                        diskStatus,
                        snapDiff: prevPaths.has(p) ? "unchanged" : "added",
                        prevSnapshotId: prevSnap?.short_id ?? null,
                    });
                }
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

    /**
     * Liste les enfants directs d'un chemin dans un snapshot (non-récursif).
     * Utilisé pour le lazy-loading du navigateur de volumes.
     */
    async browseSnapshotPath(snapshotId: string, dirPath: string): Promise<Array<{
        name: string; path: string; type: "file" | "dir"; size: number; mtime: string;
    }>> {
        const safeId   = shellQuote(assertSafeResticId(snapshotId));
        const safePath = shellQuote(dirPath);
        const out = await this.resticFor(this.primaryDest(), `ls ${safeId} ${safePath} --json --long`);
        const results: Array<{ name: string; path: string; type: "file" | "dir"; size: number; mtime: string }> = [];
        for (const line of out.split("\n").filter(Boolean)) {
            try {
                const e = JSON.parse(line) as Record<string, unknown>;
                if ((e.type === "file" || e.type === "dir") && typeof e.path === "string" && e.path !== dirPath) {
                    results.push({
                        name:  e.name  as string ?? "",
                        path:  e.path  as string,
                        type:  e.type  as "file" | "dir",
                        size:  (e.size as number)  ?? 0,
                        mtime: (e.mtime as string) ?? "",
                    });
                }
            } catch { /* ignore */ }
        }
        return results;
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

    // ── Contenu de fichier dans un snapshot ──────────────────────

    /**
     * Teste la lisibilité d'un repo en lisant un fichier réel depuis le snapshot.
     * Utilise `restic ls` pour trouver un compose.yaml puis `restic dump` pour le lire.
     * Aucun fichier temporaire n'est créé sur le disque — tout reste en mémoire.
     */
    private async runRestoreTest(dest: BackupDestination, snapshotId: string): Promise<RestoreTestResult> {
        try {
            // 1. Lister uniquement les fichiers sous STACKS_DIR (évite de parcourir les volumes)
            const lsOut = await this.resticFor(dest, `ls ${shellQuote(snapshotId)} ${shellQuote(STACKS_DIR)}`);

            // 2. Trouver le premier compose.yaml dans le snapshot
            let composePath: string | undefined;
            for (const line of lsOut.split("\n").filter(Boolean)) {
                try {
                    const obj = JSON.parse(line) as Record<string, unknown>;
                    if (obj.struct_type !== "node" || obj.type !== "file") continue;
                    const name = path.basename(obj.path as string);
                    if (/^(compose|docker-compose)(\.ya?ml)?$/.test(name)) {
                        composePath = obj.path as string;
                        break;
                    }
                } catch { continue; }
            }

            if (!composePath) {
                // Snapshot vide ou sans compose — test trivial passé
                console.log(`[BackupManager] Restore test "${dest.label}" — aucun compose trouvé dans le snapshot, test ignoré`);
                return { ok: true };
            }

            // 3. Lire le fichier (déchiffrement + vérification de l'intégrité des données)
            const content = await this.resticDump(dest, snapshotId, composePath);
            if (!content.trim()) {
                return { ok: false, testedFile: composePath, error: "Fichier vide retourné par le snapshot" };
            }

            return { ok: true, testedFile: composePath };
        } catch (e: unknown) {
            const raw = e instanceof Error ? e.message : String(e);
            return { ok: false, error: raw.slice(0, 300) };
        }
    }

    /** Exécute `restic dump` sans `--json` pour récupérer le contenu brut d'un fichier */
    private async resticDump(dest: BackupDestination, snapshotId: string, filePath: string): Promise<string> {
        const repoEnv = buildResticEnv(dest);
        const repo    = buildRepoUrl(dest);
        let tmpFile: string | null = null;
        try {
            if (dest.type === "sftp" && dest.sftp?.authMode === "password" && dest.sftp.password) {
                tmpFile = `/tmp/dockge_sshpass_${Date.now()}_${Math.random().toString(36).slice(2)}`;
                await fs.writeFile(tmpFile, dest.sftp.password, { mode: 0o600 });
            }
            const sftpOpts = buildSftpOptions(dest, tmpFile ?? undefined);
            const cmd = `restic --repo ${shellQuote(repo)} ${sftpOpts} dump ${shellQuote(snapshotId)} ${shellQuote(filePath)}`;
            const { stdout } = await execAsync(cmd, {
                maxBuffer: 10 * 1024 * 1024,
                timeout: 30_000,
                env: { PATH: "/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin", ...process.env, ...repoEnv },
            });
            return stdout;
        } finally {
            if (tmpFile) await fs.unlink(tmpFile).catch(() => {});
        }
    }

    /** Exécute `restic check` sans `--json` pour vérifier l'intégrité d'un repo */
    private async resticCheck(dest: BackupDestination): Promise<string> {
        // Libère un éventuel verrou obsolète avant le check (comme pour backup/forget)
        try { await this.resticFor(dest, "unlock --remove-all"); } catch { /* ignore */ }

        const repoEnv = buildResticEnv(dest);
        const repo    = buildRepoUrl(dest);
        let tmpFile: string | null = null;
        try {
            if (dest.type === "sftp" && dest.sftp?.authMode === "password" && dest.sftp.password) {
                tmpFile = `/tmp/dockge_sshpass_${Date.now()}_${Math.random().toString(36).slice(2)}`;
                await fs.writeFile(tmpFile, dest.sftp.password, { mode: 0o600 });
            }
            const sftpOpts = buildSftpOptions(dest, tmpFile ?? undefined);
            const cmd = `restic --repo ${shellQuote(repo)} ${sftpOpts} check 2>&1`;
            try {
                const { stdout } = await execAsync(cmd, {
                    maxBuffer: 2 * 1024 * 1024,
                    timeout: 5 * 60_000,
                    env: { PATH: "/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin", ...process.env, ...repoEnv },
                });
                return stdout;
            } catch (e: any) {
                // execAsync échoue avec exit code non-zéro → on retourne le stdout réel (2>&1 le contient)
                const output = (e?.stdout ?? e?.message ?? String(e)).trim();
                throw new Error(output);
            }
        } finally {
            if (tmpFile) await fs.unlink(tmpFile).catch(() => {});
        }
    }

    /** Vérifie l'intégrité de chaque destination activée */
    async runCheck(destIndex?: number): Promise<Array<{ destIndex: number; label: string; ok: boolean; output: string }>> {
        const activeDests = this.settings.destinations
            .map((d, i) => ({ dest: d, idx: i }))
            .filter(({ dest, idx }) => dest.enabled && (destIndex === undefined || idx === destIndex));

        if (activeDests.length === 0) {
            throw new Error("Aucune destination de backup activée");
        }

        return Promise.all(activeDests.map(async ({ dest, idx }) => {
            try {
                const output = await this.resticCheck(dest);
                return { destIndex: idx, label: dest.label, ok: true, output };
            } catch (e: unknown) {
                const raw = e instanceof Error ? e.message : String(e);
                return { destIndex: idx, label: dest.label, ok: false, output: raw };
            }
        }));
    }

    /** Retourne le contenu d'un fichier texte depuis un snapshot + sa version disque actuelle + version snapshot précédent */
    async getSnapshotFileContent(snapshotId: string, filePath: string, prevSnapshotId?: string): Promise<{ snapshot: string; disk: string | null; prev: string | null }> {
        const safeId = assertSafeResticId(snapshotId);
        if (!filePath.startsWith("/") || filePath.includes("..") || filePath.length > 1000) {
            throw new Error("Chemin de fichier invalide");
        }
        const snapshotContent = await this.resticDump(this.primaryDest(), safeId, filePath);
        let disk: string | null = null;
        try {
            const stat = await fs.stat(filePath);
            if (stat.size <= 500 * 1024) {
                disk = await fs.readFile(filePath, "utf8");
            }
        } catch { /* fichier absent */ }
        let prev: string | null = null;
        if (prevSnapshotId) {
            try {
                const safePrev = assertSafeResticId(prevSnapshotId);
                prev = await this.resticDump(this.primaryDest(), safePrev, filePath);
            } catch { /* fichier absent du snapshot précédent */ }
        }
        return { snapshot: snapshotContent, disk, prev };
    }

    // ── Surveillance de fraîcheur ────────────────────────────────

    private async checkStaleness(): Promise<void> {
        if (!this.settings.enabled) return;
        const intervalHours = sanitizeIntervalHours(this.settings.intervalHours);
        const maxAgeMs = 2 * intervalHours * 3_600_000;
        const lastSuccess = backupHistory.find(h => h.success);
        if (!lastSuccess) return; // pas encore de backup — pas d'alerte
        const ageMs = Date.now() - new Date(lastSuccess.timestamp).getTime();
        if (ageMs < maxAgeMs) return;
        // En retard — n'envoyer qu'une notif par fenêtre d'intervalHours
        if (Date.now() - this.lastStalenessNotif < intervalHours * 3_600_000) return;
        this.lastStalenessNotif = Date.now();
        await this.sendStalenessNotification(ageMs);
    }

    private async sendStalenessNotification(ageMs: number): Promise<void> {
        const discord = this.settings.discordWebhooks.length > 0
            ? new DiscordNotifier(this.settings.discordWebhooks)
            : null;
        const apprise = await this.loadAppriseNotifier();
        if (!discord && !apprise) return;

        const en     = (this.settings.notificationLang ?? "fr") === "en";
        const locale = en ? "en-GB" : "fr-FR";
        const hostname: string = await Settings.get("primaryHostname") || "";
        const hostnamePrefix   = hostname ? `[${hostname}] ` : "";
        const footerHost       = hostname ? ` · ${hostname}` : "";
        const hours  = Math.floor(ageMs / 3_600_000);
        const title  = `${hostnamePrefix}${en ? "⚠️ Dockge backup overdue" : "⚠️ Backup Dockge en retard"}`;
        const descr  = en
            ? `No successful backup in the last **${hours}h**. Please check your backup configuration.`
            : `Aucun backup réussi depuis **${hours}h**. Vérifiez votre configuration de backup.`;

        if (discord) {
            await discord.sendEmbed({
                title, color: 0xf59e0b, description: descr, fields: [],
                footer: `Dockge Enhanced — Backup${footerHost} · ${new Date().toLocaleString(locale)}`,
            });
        }
        if (apprise) await apprise.send({ title, body: descr, type: "failure" });
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
        const hostname: string = await Settings.get("primaryHostname") || "";
        const hostnamePrefix   = hostname ? `[${hostname}] ` : "";
        const footerHost       = hostname ? ` · ${hostname}` : "";

        if (result.success) {
            const title  = `${hostnamePrefix}${t("✅ Backup Dockge réussi", "✅ Dockge backup successful")}`;
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
                      .map(d => {
                          const rt = d.restoreTest;
                          const rtIcon = rt == null ? "" : (rt.ok ? " · Restore test ✅" : " · Restore test ❌");
                          return `${d.success ? "✅" : "❌"} ${d.label}${rtIcon}`;
                      })
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
                    footer: `Dockge Enhanced — Backup${footerHost} · ${new Date(result.timestamp).toLocaleString(locale)}`,
                });
            }
            if (apprise) {
                const body = `${descr}\n\n${fields.map(f => `**${f.name}**: ${f.value}`).join("\n")}`;
                await apprise.send({ title, body, type: "success" });
            }
        } else {
            const title  = `${hostnamePrefix}${t("❌ Échec du backup Dockge", "❌ Dockge backup failed")}`;
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
                    footer: `Dockge Enhanced — Backup${footerHost} · ${new Date(result.timestamp).toLocaleString(locale)}`,
                });
            }
            if (apprise) {
                const body = `${descr}\n\n${fields.map(f => `**${f.name}**: ${f.value}`).join("\n")}`;
                await apprise.send({ title, body, type: "failure" });
            }
        }
    }
}
