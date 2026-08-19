/**
 * shared.ts — types et helper API partagés entre la page Watcher
 * (WatcherSettings.vue) et ses onglets extraits (watcher/Watcher*Tab.vue).
 */

// ─── Types ────────────────────────────────────────────────────────

export interface AppriseSettings {
    serverUrl: string;
    imagesUrls: string[];   // URLs pour surveillance des images
    trivyUrls: string[];   // URLs pour Trivy
    backupUrls: string[];   // URLs pour les sauvegardes
}

export interface Cred {
    registry: string;
    username: string;
    token: string;
}

export interface AutoUpdateEntry {
    mode: "immediate" | "scheduled" | "ignored";
    time?: string;
}

export interface ImgSettings {
    enabled: boolean;
    intervalHours: number;
    discordWebhooks: string[];
    autoUpdateConfig: Record<string, AutoUpdateEntry>;
    pendingAutoUpdates: string[];
    imagePlatform: string;
}

export interface TrivySettings {
    enabled: boolean;
    intervalHours: number;
    discordWebhooks: string[];
    minSeverityAlert: string;
    ignoreUnfixed: boolean;
    scanTimeoutMinutes: number;
    ignoredCVEs: string[];
}

export interface ImageStatus {
    image: string;
    stack: string;
    localDigest: string;
    remoteDigest: string;
    hasUpdate: boolean;
    lastChecked: string;
    ignoredDigest?: string;
    error?: string;
}

export interface RollbackEntry {
    key: string;
    image: string;
    stack: string;
    oldImageId: string;
    updatedAt: string;
    expiresAt: string;
}

export interface UpdateHistoryEntry {
    timestamp: string;
    stack: string;
    image: string;
    oldDigest: string;
    newDigest: string;
    mode: "immediate" | "scheduled";
    success: boolean;
    error?: string;
}

export interface TrivyScanResult {
    image: string;
    stack: string;
    maxSeverity: string;
    counts: Record<string, number>;
    error?: string;
}

export interface TrivyVuln {
    id: string;
    pkg: string;
    installed: string;
    fixed: string;
    severity: string;
    url: string;
    title: string;
}

export interface TrivyFullResult {
    image: string;
    stack: string;
    vulns: TrivyVuln[];
    error?: string;
}

export interface TrivyStatus {
    running: boolean;
    lastScanAt: string | null;
    scannedCount: number;
    lastResults: TrivyScanResult[];
    lastFullResults: TrivyFullResult[];
}

// ─── API ──────────────────────────────────────────────────────────

export interface WatcherApiResult {
    ok: boolean;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    data?: any;
    message?: string;
}

const API = "/api/watcher";

export async function watcherApi(method: string, path: string, body?: unknown): Promise<WatcherApiResult> {
    const token = localStorage.getItem("token") ?? sessionStorage.getItem("token") ?? "";
    const base = API + path;
    const sep = base.includes("?") ? "&" : "?";
    const url = token ? `${base}${sep}token=${encodeURIComponent(token)}` : base;
    const res = await fetch(url, {
        method,
        headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
    });
    return res.json();
}
