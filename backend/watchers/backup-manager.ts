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
import { DiscordNotifier } from "../notification/discord";

const execAsync = promisify(exec);

const STACKS_DIR    = process.env.DOCKGE_STACKS_DIR ?? "/opt/stacks";
const DATA_DIR      = process.env.DOCKGE_DATA_DIR   ?? "/opt/dockge/data";
const SETTINGS_PATH = path.join(DATA_DIR, "backup-settings.json");

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
    // Clé SSH : monter la clé via volume Docker, indiquer le chemin
    keyPath?: string;               // ex: /root/.ssh/id_rsa
    password?: string;              // si pas de clé SSH
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

export interface BackupSettings {
    enabled: boolean;
    intervalHours: number;
    destination: BackupDestination;
    retention: RetentionPolicy;
    discordWebhooks: string[];      // liste de webhooks (migration auto depuis discordWebhook)
    includeEnvFiles: boolean;
    extraPaths: string[];
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

export interface BackupResult {
    success: boolean;
    snapshotId?: string;
    duration: number;               // ms
    dataAdded?: number;             // bytes
    filesNew?: number;
    filesChanged?: number;
    error?: string;
    timestamp: string;
}

// Historique en mémoire (les 20 derniers) — accès via BackupManager.getInstance().getHistory()
const backupHistory: BackupResult[] = [];

// ─── Helpers ──────────────────────────────────────────────────────

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

function buildRepoUrl(dest: BackupDestination): string {
    switch (dest.type) {
        case "local":
            return dest.local!.path;

        case "sftp": {
            const s = dest.sftp!;
            const port = s.port !== 22 ? `:${s.port}` : "";
            return `sftp:${s.user}@${s.host}${port}:${s.path}`;
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

function envToString(env: Record<string, string>): string {
    return Object.entries(env)
        .map(([k, v]) => `${k}="${v.replace(/"/g, '\\"')}"`)
        .join(" ");
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

// ─── Classe principale ────────────────────────────────────────────

export class BackupManager {
    private static _instance: BackupManager;
    private cronJob: cron.ScheduledTask | null = null;

    settings: BackupSettings = {
        enabled: false,
        intervalHours: 24,
        destination: {
            type: "local",
            resticPassword: "",
            local: { path: "/opt/backups/dockge" },
        },
        retention: {
            keepLast: 10,
            keepDaily: 7,
            keepWeekly: 4,
            keepMonthly: 3,
        },
        discordWebhooks: [],
        includeEnvFiles: true,
        extraPaths: [],
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
            this.settings = { ...this.settings, ...data as Partial<BackupSettings> };
        } catch { /* première utilisation */ }
    }

    async saveSettings(partial: Partial<BackupSettings>): Promise<void> {
        this.settings = { ...this.settings, ...partial };
        await fs.mkdir(DATA_DIR, { recursive: true });
        await fs.writeFile(SETTINGS_PATH, JSON.stringify(this.settings, null, 2));
        this.restart();
    }

    /** Retourne les settings sans exposer les secrets */
    getSettingsSafe(): BackupSettings {
        const s = JSON.parse(JSON.stringify(this.settings)) as BackupSettings;
        if (s.destination.resticPassword)      s.destination.resticPassword      = "***";
        if (s.destination.sftp?.password)      s.destination.sftp.password       = "***";
        if (s.destination.s3?.secretAccessKey) s.destination.s3.secretAccessKey  = "***";
        if (s.destination.rest?.password)      s.destination.rest.password       = "***";
        s.discordWebhooks = s.discordWebhooks.map(w => w.replace(/\/\w{6}\w+$/, "/***"));
        return s;
    }

    // ── Cycle de vie ──────────────────────────────────────────────

    async startIfEnabled(): Promise<void> {
        await this.loadSettings();
        if (this.settings.enabled) this.start();
    }

    start(): void {
        this.stop();
        const { intervalHours } = this.settings;
        console.log(`[BackupManager] Démarrage — backup toutes les ${intervalHours}h`);
        this.cronJob = cron.schedule(`0 */${intervalHours} * * *`, () => this.runBackup());
    }

    stop(): void {
        this.cronJob?.stop();
        this.cronJob = null;
    }

    restart(): void {
        this.settings.enabled ? this.start() : this.stop();
    }

    // ── Restic helpers ────────────────────────────────────────────

    private async restic(args: string, extraEnv: Record<string, string> = {}): Promise<string> {
        const dest = this.settings.destination;
        const repoEnv = buildResticEnv(dest);
        const repo    = buildRepoUrl(dest);

        const allEnv = { ...repoEnv, ...extraEnv };

        const cmd = `restic --repo "${repo}" --json ${args}`;
        const { stdout } = await execAsync(cmd, {
            maxBuffer: 20 * 1024 * 1024,
            timeout:   30 * 60 * 1000,   // 30 min max — évite un blocage infini
            env:       { ...process.env, ...allEnv },
        });
        return stdout.trim();
    }

    /** Initialise le repo si pas encore fait */
    async initRepo(): Promise<void> {
        try {
            await this.restic("snapshots --quiet");
            console.log("[BackupManager] Repo Restic déjà initialisé.");
        } catch {
            console.log("[BackupManager] Initialisation du repo Restic...");
            await this.restic("init");
            console.log("[BackupManager] Repo initialisé.");
        }
    }

    // ── Backup ────────────────────────────────────────────────────

    async runBackup(): Promise<BackupResult> {
        const start = Date.now();
        const result: BackupResult = {
            success: false,
            duration: 0,
            timestamp: new Date().toISOString(),
        };

        try {
            if (!this.settings.destination.resticPassword) {
                throw new Error("Mot de passe Restic non configuré");
            }

            await this.initRepo();

            // Construit la liste des chemins à sauvegarder
            const paths = await this.buildBackupPaths();
            if (paths.length === 0) throw new Error("Aucun fichier à sauvegarder");

            const pathArgs = paths.map(p => `"${p}"`).join(" ");
            const tagArg   = `--tag dockge-enhanced --tag ${new Date().toISOString().slice(0,10)}`;

            // Exclut les fichiers non pertinents
            const excludes = [
                "--exclude '*.log'",
                "--exclude '__pycache__'",
                "--exclude 'node_modules'",
            ].join(" ");

            const stdout = await this.restic(`backup ${pathArgs} ${tagArg} ${excludes}`);

            // Parse le résumé JSON (dernière ligne de la sortie)
            const lines = stdout.split("\n").filter(Boolean);
            const summary = lines.reduce<Record<string, unknown> | null>((acc, line) => {
                try {
                    const obj = JSON.parse(line) as Record<string, unknown>;
                    return obj.message_type === "summary" ? obj : acc;
                } catch { return acc; }
            }, null);

            result.success      = true;
            result.snapshotId   = (summary?.snapshot_id as string)?.slice(0, 8);
            result.dataAdded    = summary?.data_added as number ?? 0;
            result.filesNew     = summary?.files_new as number ?? 0;
            result.filesChanged = summary?.files_changed as number ?? 0;
            result.duration     = Date.now() - start;

            // Prune automatique selon la politique de rétention
            await this.runForget();

            console.log(
                `[BackupManager] ✅ Snapshot ${result.snapshotId} — ` +
                `+${formatBytes(result.dataAdded)} en ${formatDuration(result.duration)}`
            );
        } catch (e: unknown) {
            result.error    = e instanceof Error ? e.message : String(e);
            result.duration = Date.now() - start;
            console.error("[BackupManager] ❌ Échec du backup:", result.error);
        }

        // Sauvegarde dans l'historique (20 max)
        backupHistory.unshift(result);
        if (backupHistory.length > 20) backupHistory.splice(20);

        // Notification Discord
        if (this.settings.discordWebhooks.length > 0) {
            await this.sendDiscordNotification(result);
        }

        return result;
    }

    private async buildBackupPaths(): Promise<string[]> {
        const paths: string[] = [];

        // Parcourt les stacks
        try {
            const stacks = await fs.readdir(STACKS_DIR);
            for (const stack of stacks) {
                const stackDir = path.join(STACKS_DIR, stack);
                try {
                    const stat = await fs.stat(stackDir);
                    if (!stat.isDirectory()) continue;
                } catch { continue; }

                // compose.yaml / docker-compose.yml
                for (const name of ["compose.yaml", "docker-compose.yml", "docker-compose.yaml"]) {
                    const p = path.join(stackDir, name);
                    try { await fs.access(p); paths.push(p); break; } catch { /* next */ }
                }

                // .env
                if (this.settings.includeEnvFiles) {
                    const envPath = path.join(stackDir, ".env");
                    try { await fs.access(envPath); paths.push(envPath); } catch { /* absent */ }
                }
            }
        } catch (e) {
            console.error("[BackupManager] Impossible de lire STACKS_DIR:", e);
        }

        // Chemins supplémentaires configurés
        for (const extra of this.settings.extraPaths) {
            try { await fs.access(extra); paths.push(extra); } catch { /* absent */ }
        }

        return paths;
    }

    private async runForget(): Promise<void> {
        const r = this.settings.retention;
        const args = [
            `--keep-last ${r.keepLast}`,
            `--keep-daily ${r.keepDaily}`,
            `--keep-weekly ${r.keepWeekly}`,
            `--keep-monthly ${r.keepMonthly}`,
            "--tag dockge-enhanced",
            "--prune",
        ].join(" ");
        await this.restic(`forget ${args}`);
    }

    // ── Snapshots ─────────────────────────────────────────────────

    async listSnapshots(): Promise<ResticSnapshot[]> {
        try {
            const stdout = await this.restic("snapshots --tag dockge-enhanced");
            return JSON.parse(stdout) as ResticSnapshot[];
        } catch {
            return [];
        }
    }

    async deleteSnapshot(id: string): Promise<void> {
        await this.restic(`forget ${id} --prune`);
    }

    /** Retourne une copie de l'historique en lecture seule */
    getHistory(): Readonly<BackupResult[]> {
        return backupHistory;
    }

    // ── Discord ───────────────────────────────────────────────────

    private async sendDiscordNotification(result: BackupResult): Promise<void> {
        const notifier = new DiscordNotifier(this.settings.discordWebhooks);

        if (result.success) {
            await notifier.sendEmbed({
                title: "✅ Backup Dockge réussi",
                color: 0x22c55e,
                description: `Snapshot \`${result.snapshotId}\` créé avec succès`,
                fields: [
                    { name: "Durée",          value: formatDuration(result.duration),         inline: true },
                    { name: "Données ajoutées", value: formatBytes(result.dataAdded ?? 0),    inline: true },
                    { name: "Fichiers",
                      value: `${result.filesNew} nouveaux · ${result.filesChanged} modifiés`, inline: true },
                    { name: "Destination",
                      value: `\`${this.settings.destination.type}\``,                          inline: true },
                ],
                footer: `Dockge Enhanced — Backup · ${new Date(result.timestamp).toLocaleString("fr-FR")}`,
            });
        } else {
            await notifier.sendEmbed({
                title: "❌ Échec du backup Dockge",
                color: 0xef4444,
                description: `**Erreur :** ${result.error}`,
                fields: [
                    { name: "Durée",      value: formatDuration(result.duration),       inline: true },
                    { name: "Destination", value: `\`${this.settings.destination.type}\``, inline: true },
                ],
                footer: `Dockge Enhanced — Backup · ${new Date(result.timestamp).toLocaleString("fr-FR")}`,
            });
        }
    }
}
