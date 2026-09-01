/**
 * backup/shared.ts — types, helper d'API et fonctions utilitaires
 * partagés entre BackupTab.vue et ses sous-composants (dossier backup/).
 */

import type { useI18n } from "vue-i18n/dist/vue-i18n.esm-browser.prod.js";

type TranslateFn = ReturnType<typeof useI18n>["t"];

// ─── Types ────────────────────────────────────────────────────────

export interface LocalConfig {
    path: string;
}

export interface SftpConfig {
    host: string;
    port: number;
    user: string;
    path: string;
    authMode: "key" | "password";
    keyPath?: string;
    password?: string;
}

export interface S3Config {
    endpoint?: string;
    bucket: string;
    path: string;
    accessKeyId: string;
    secretAccessKey: string;
}

export interface RestConfig {
    url: string;
    user?: string;
    password?: string;
}

export interface Destination {
    label: string;
    enabled: boolean;
    type: "local" | "sftp" | "s3" | "rest";
    resticPassword: string;
    local?: LocalConfig;
    sftp?: SftpConfig;
    s3?: S3Config;
    rest?: RestConfig;
}

export interface Retention {
    keepLast: number;
    keepDaily: number;
    keepWeekly: number;
    keepMonthly: number;
}

export interface VolumeBackupConfig {
    selectedVolumes: string[];
}

export interface MountedVolume {
    source: string;
    destination: string;
}

export type StackBackupMode = "hot" | "stop" | "hooks";

export interface StackBackupPolicy {
    mode: StackBackupMode;
    hookService?: string;
    preHook?: string;
    postHook?: string;
}

export interface Settings {
    enabled: boolean;
    intervalHours: number;
    destinations: Destination[];
    retention: Retention;
    includeEnvFiles: boolean;
    discordWebhooks?: string[];
    notificationLang?: "fr" | "en" | "es" | "zh-CN";
    volumeBackup: VolumeBackupConfig;
    extraPaths?: string[];
    backupOnSave: boolean;
    preventConcurrentBackups: boolean;
    excludedStacks: string[];
    stackPolicies: Record<string, StackBackupPolicy>;
    excludePatterns: string[];
    restoreTest: boolean;
}

export type BackupTrigger = "scheduled" | "manual" | "on-save";

export interface Snapshot {
    id: string;
    short_id: string;
    time: string;
    tags?: string[];
    paths: string[];
    size?: number;
    fileCount?: number;
    summary?: {
        total_bytes_processed?: number;
        total_files_processed?: number;
        data_added?: number;
    };
}

export interface SnapshotStats {
    repositorySize?: number;
    repositoryFileCount?: number;
    snapshots: Record<string, { size?: number; fileCount?: number }>;
    errors?: Record<string, string>;
}

export interface SnapshotFile {
    path: string;
    name: string;
    stack: string;
    type: "compose" | "env" | "volume" | "other";
    relativePath?: string;
    services?: string[];
    aliases?: string[];
    size: number;
    mtime: string;
    diskStatus: "unchanged" | "modified" | "missing";
    snapDiff: "added" | "modified" | "unchanged";
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
    success: boolean;
    trigger?: BackupTrigger;
    snapshotId?: string;
    duration: number;
    dataAdded?: number;
    filesNew?: number;
    filesChanged?: number;
    error?: string;
    warnings?: string[];
    timestamp: string;
    destinations?: DestinationResult[];
}

export interface DiffLine {
    type: "same" | "added" | "removed";
    line: string;
}

export interface PreviewState {
    open: boolean;
    snapId: string;
    filePath: string;
    fileName: string;
    snapshotContent: string;
    diskContent: string | null;
    prevContent: string | null;
    loading: boolean;
    tab: "preview" | "diff" | "snapdiff";
}

// ─── Constantes ───────────────────────────────────────────────────

export const APP_DATA = "/app/data";

// ─── API ──────────────────────────────────────────────────────────

const API = "/api/watcher";

export async function api(method: string, path: string, body?: unknown) {
    const token = localStorage.getItem("token") ?? sessionStorage.getItem("token") ?? "";
    const res = await fetch(API + path, {
        method,
        headers: {
            "Content-Type": "application/json",
            ...(token ? { "Authorization": `Bearer ${token}` } : {}),
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    return res.json();
}

// ─── Fabriques ────────────────────────────────────────────────────

export function defaultDestination(t: TranslateFn): Destination {
    return {
        label: t("watcher.backup.destDefaultLabel"),
        enabled: true,
        type: "local",
        resticPassword: "",
        local: { path: "/app/data/backups" },
        sftp: { host: "", port: 22, user: "", path: "", authMode: "key" },
        s3: { endpoint: "", bucket: "", path: "dockge", accessKeyId: "", secretAccessKey: "" },
        rest: { url: "", user: "", password: "" },
    };
}

// ─── Formatage ────────────────────────────────────────────────────

export function formatBytes(b: number): string {
    if (b < 1024) return `${b} B`;
    if (b < 1024 ** 2) return `${(b / 1024).toFixed(1)} KB`;
    if (b < 1024 ** 3) return `${(b / 1024 ** 2).toFixed(1)} MB`;
    return `${(b / 1024 ** 3).toFixed(2)} GB`;
}

export function formatDuration(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
}

// ─── Triggers ─────────────────────────────────────────────────────

export function backupTrigger(item: BackupResult | Snapshot): BackupTrigger {
    const direct = (item as BackupResult).trigger;
    if (direct === "manual" || direct === "scheduled" || direct === "on-save") return direct;
    const tags = (item as Snapshot).tags ?? [];
    if (tags.includes("on-save")) return "on-save";
    if (tags.includes("manual")) return "manual";
    return "scheduled";
}

export function backupTriggerLabel(t: TranslateFn, trigger: BackupTrigger): string {
    return t(`watcher.backup.trigger.${trigger}`);
}

export function backupTriggerClass(trigger: BackupTrigger): string {
    if (trigger === "on-save") return "bg-info text-dark";
    if (trigger === "manual") return "bg-primary";
    return "bg-secondary";
}

// ─── Diff ─────────────────────────────────────────────────────────

export function diffLines(aText: string, bText: string): DiffLine[] {
    const a = aText.split("\n");
    const b = bText.split("\n");
    const m = a.length, n = b.length;
    const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
    for (let i = 1; i <= m; i++)
        for (let j = 1; j <= n; j++)
            dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);
    const result: DiffLine[] = [];
    let i = m, j = n;
    while (i > 0 || j > 0) {
        if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) {
            result.unshift({ type: "same", line: a[i - 1] });
            i--; j--;
        } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
            result.unshift({ type: "added", line: b[j - 1] });
            j--;
        } else {
            result.unshift({ type: "removed", line: a[i - 1] });
            i--;
        }
    }
    return result;
}
