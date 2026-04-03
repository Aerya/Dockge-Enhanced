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

export interface BackupSettings {
    enabled: boolean;
    intervalHours: number;
    destinations: BackupDestination[];   // tableau de destinations (migration auto depuis destination)
    retention: RetentionPolicy;
    discordWebhooks: string[];
    includeEnvFiles: boolean;
    extraPaths: string[];
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
    type: "compose" | "env" | "other";
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
}

export interface BackupResult {
    success: boolean;               // true si toutes les destinations ont réussi
    snapshotId?: string;            // premier snapshotId réussi (affichage)
    duration: number;               // ms
    dataAdded?: number;             // bytes (somme)
    filesNew?: number;
    filesChanged?: number;
    error?: string;                 // première erreur rencontrée
    timestamp: string;
    destinations?: DestinationResult[];
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

/**
 * Construit les options supplémentaires à passer à restic pour le mode SFTP.
 * - Clé SSH    : -o sftp.args pour forcer l'usage de la clé
 * - Mot de passe : -o sftp.command utilisant sshpass -f <tmpFile>
 *   (le chemin du fichier temporaire est créé par resticFor() avant l'appel)
 */
function buildSftpOptions(dest: BackupDestination, tmpFile?: string): string {
    if (dest.type !== "sftp" || !dest.sftp) return "";
    const s = dest.sftp;
    const port = s.port && s.port !== 22 ? s.port : 22;

    if (s.authMode === "password" && tmpFile) {
        // Chemins absolus obligatoires : restic spawne le sftp.command dans un
        // sous-processus Go dont le PATH peut être différent du PATH Node.js.
        // Sans chemin absolu, sshpass trouve bien `ssh` dans son propre PATH mais
        // le sous-processus spawné par restic échoue avec ENOENT sur `ssh`.
        const sshCmd = `/usr/bin/sshpass -f ${tmpFile} /usr/bin/ssh -l ${s.user} -p ${port} -o StrictHostKeyChecking=no -o PreferredAuthentications=password -o BatchMode=no`;
        return `-o sftp.command="${sshCmd} ${s.host} -s sftp"`;
    }

    if (s.authMode === "key" && s.keyPath) {
        const sshArgs = `-i ${s.keyPath} -o StrictHostKeyChecking=no`;
        return `-o sftp.args="${sshArgs}"`;
    }

    return "";
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
            const cmd = `restic --repo "${repo}" --json ${sftpOpts} ${args}`;
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
            return result;
        }

        const paths = await this.buildBackupPaths();
        if (paths.length === 0) {
            result.error = "Aucun fichier à sauvegarder";
            backupHistory.unshift(result);
            return result;
        }

        const pathArgs = paths.map(p => `"${p}"`).join(" ");
        const tagArg   = `--tag dockge-enhanced --tag ${new Date().toISOString().slice(0,10)}`;
        const excludes = [
            "--exclude '*.log'",
            "--exclude '__pycache__'",
            "--exclude 'node_modules'",
        ].join(" ");

        let totalDataAdded = 0;
        let allSuccess = true;

        for (const dest of activeDests) {
            const destResult: DestinationResult = {
                label: dest.label,
                type:  dest.type,
                success: false,
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

    private async runForgetFor(dest: BackupDestination): Promise<void> {
        const r = this.settings.retention;
        const args = [
            `--keep-last ${r.keepLast}`,
            `--keep-daily ${r.keepDaily}`,
            `--keep-weekly ${r.keepWeekly}`,
            `--keep-monthly ${r.keepMonthly}`,
            "--tag dockge-enhanced",
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
            const stdout = await this.resticFor(this.primaryDest(), "snapshots --tag dockge-enhanced");
            return JSON.parse(stdout) as ResticSnapshot[];
        } catch {
            return [];
        }
    }

    async deleteSnapshot(id: string): Promise<void> {
        await this.resticFor(this.primaryDest(), `forget ${id} --prune`);
    }

    /**
     * Liste les fichiers compose/env d'un snapshot avec deux dimensions de statut :
     *   - diskStatus  : comparaison vs fichier actuellement sur le disque
     *   - snapDiff    : comparaison vs snapshot précédent (via restic diff)
     */
    async listSnapshotFiles(snapshotId: string): Promise<SnapshotFile[]> {
        try {
            // ── 1. Trouve le snapshot précédent ─────────────────────────
            const allSnaps = await this.listSnapshots(); // utilise primaryDest()
            allSnaps.sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
            const idx = allSnaps.findIndex(
                s => s.id.startsWith(snapshotId) || s.short_id === snapshotId
            );
            const prevSnap = idx > 0 ? allSnaps[idx - 1] : null;

            // ── 2. Liste les fichiers du snapshot courant ────────────────
            const stdout = await this.resticFor(this.primaryDest(), `ls ${snapshotId} --json --long`);
            const files: SnapshotFile[] = [];
            const fileMap = new Map<string, SnapshotFile>();

            for (const line of stdout.split("\n").filter(Boolean)) {
                let entry: Record<string, unknown>;
                try { entry = JSON.parse(line); } catch { continue; }
                if (entry.struct_type !== "node" || entry.type !== "file") continue;

                const filePath = entry.path as string;
                const name = path.basename(filePath);
                const isCompose = /^(compose|docker-compose)(\.ya?ml)?$/.test(name);
                const isEnv = name === ".env";
                if (!isCompose && !isEnv) continue;

                // Extrait le nom de la stack depuis le chemin
                const stacksBase = path.basename(STACKS_DIR);
                const parts = filePath.split("/");
                const stacksIdx = parts.lastIndexOf(stacksBase);
                const stack = stacksIdx >= 0 && parts.length > stacksIdx + 1
                    ? parts[stacksIdx + 1] : "unknown";

                // Statut vs disque
                let diskStatus: "unchanged" | "modified" | "missing";
                try {
                    const stat = await fs.stat(filePath);
                    const snapMtime = new Date(entry.mtime as string).getTime();
                    diskStatus = stat.mtime.getTime() > snapMtime + 2000 ? "modified" : "unchanged";
                } catch { diskStatus = "missing"; }

                const file: SnapshotFile = {
                    path: filePath, name, stack,
                    type: isCompose ? "compose" : "env",
                    size: (entry.size as number) ?? 0,
                    mtime: entry.mtime as string,
                    diskStatus,
                    snapDiff: prevSnap ? "unchanged" : "added",  // sera affiné par diff
                    prevSnapshotId: prevSnap?.short_id ?? null,
                };
                files.push(file);
                fileMap.set(filePath, file);
            }

            // ── 3. Diff vs snapshot précédent ────────────────────────────
            if (prevSnap) {
                try {
                    const diffOut = await this.resticFor(this.primaryDest(), `diff ${prevSnap.short_id} ${snapshotId}`);
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

            return files.sort((a, b) => {
                if (a.stack !== b.stack) return a.stack.localeCompare(b.stack);
                return a.type === "compose" ? -1 : 1;
            });
        } catch (e) {
            console.error("[BackupManager] listSnapshotFiles error:", e);
            return [];
        }
    }

    /** Restaure une liste de fichiers depuis un snapshot à leur emplacement d'origine */
    async restoreFiles(snapshotId: string, filePaths: string[]): Promise<{ restored: number; errors: string[] }> {
        if (filePaths.length === 0) return { restored: 0, errors: [] };
        const includes = filePaths.map(p => `--include "${p}"`).join(" ");
        try {
            await this.resticFor(this.primaryDest(), `restore ${snapshotId} --target / ${includes}`);
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

    // ── Discord ───────────────────────────────────────────────────

    private async sendDiscordNotification(result: BackupResult): Promise<void> {
        const notifier = new DiscordNotifier(this.settings.discordWebhooks);
        const en       = (this.settings.notificationLang ?? "fr") === "en";
        const locale   = en ? "en-GB" : "fr-FR";
        const t        = (fr: string, enStr: string) => en ? enStr : fr;

        if (result.success) {
            await notifier.sendEmbed({
                title: t("✅ Backup Dockge réussi", "✅ Dockge backup successful"),
                color: 0x22c55e,
                description: `Snapshot \`${result.snapshotId}\` ${t("créé avec succès", "created successfully")}`,
                fields: [
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
                ],
                footer: `Dockge Enhanced — Backup · ${new Date(result.timestamp).toLocaleString(locale)}`,
            });
        } else {
            await notifier.sendEmbed({
                title: t("❌ Échec du backup Dockge", "❌ Dockge backup failed"),
                color: 0xef4444,
                description: `**${t("Erreur", "Error")} :** ${result.error}`,
                fields: [
                    { name: t("Durée", "Duration"),
                      value: formatDuration(result.duration),                                  inline: true },
                    { name: t("Destinations", "Destinations"),
                      value: (result.destinations ?? [])
                          .map(d => `${d.success ? "✅" : "❌"} ${d.label}`)
                          .join("\n") || "—",
                      inline: true },
                ],
                footer: `Dockge Enhanced — Backup · ${new Date(result.timestamp).toLocaleString(locale)}`,
            });
        }
    }
}
