/**
 * MonitoringWatcher — Détection des crash loops.
 * Notifications via Discord + Apprise globaux.
 */

import { spawn } from "child_process";
import * as path from "path";
import * as fs from "fs/promises";
import { R } from "redbean-node";
import { DiscordNotifier } from "../notification/discord";
import { AppriseNotifier } from "../notification/apprise";
import { Settings } from "../settings";

const DATA_DIR              = process.env.DOCKGE_DATA_DIR ?? "/opt/dockge/data";
const SETTINGS_PATH         = path.join(DATA_DIR, "monitoring-settings.json");
const CRASH_EVENTS_PATH     = path.join(DATA_DIR, "crash-events.json");
const WATCHER_SETTINGS_PATH = path.join(DATA_DIR, "watcher-settings.json");

// ─── Types ────────────────────────────────────────────────────────

export interface CrashExclusion {
    containerName: string;
    expiresAt: string | null; // ISO date, ou null = permanent
}

export interface MonitoringSettings {
    crashLoopEnabled: boolean;
    crashLoopThreshold: number;          // N redémarrages
    crashLoopWindowMinutes: number;      // dans X minutes
    crashLoopCooldownMinutes: number;    // anti-spam
    discordWebhooks: string[];
    appriseUrls: string[];
    notificationLang: "fr" | "en";
}

export interface CrashEvent {
    containerName: string;
    containerId: string;
    restartCount: number;
    windowMinutes: number;
    timestamp: string;
}

const DEFAULT_SETTINGS: MonitoringSettings = {
    crashLoopEnabled: false,
    crashLoopThreshold: 5,
    crashLoopWindowMinutes: 10,
    crashLoopCooldownMinutes: 60,
    discordWebhooks: [],
    appriseUrls: [],
    notificationLang: "fr",
};

// ─── Singleton ────────────────────────────────────────────────────

export class MonitoringWatcher {
    private static _instance: MonitoringWatcher;

    settings: MonitoringSettings = { ...DEFAULT_SETTINGS };

    private crashTimestamps:   Map<string, number[]> = new Map();
    private crashCooldowns:    Map<string, number>   = new Map();
    private recentCrashEvents: CrashEvent[]          = [];
    private exclusionsCache:   CrashExclusion[]      = []; // cache DB → mémoire
    private dockerEventProc: ReturnType<typeof spawn> | null = null;
    private dockerEventBuffer = "";

    static getInstance(): MonitoringWatcher {
        if (!MonitoringWatcher._instance) {
            MonitoringWatcher._instance = new MonitoringWatcher();
        }
        return MonitoringWatcher._instance;
    }

    // ── Settings ──────────────────────────────────────────────────

    async loadSettings(): Promise<void> {
        try {
            const raw = await fs.readFile(SETTINGS_PATH, "utf8");
            this.settings = { ...DEFAULT_SETTINGS, ...JSON.parse(raw) as Partial<MonitoringSettings> };
        } catch {
            this.settings = { ...DEFAULT_SETTINGS };
        }
    }

    async saveSettings(partial: Partial<MonitoringSettings>): Promise<void> {
        this.settings = { ...this.settings, ...partial };
        await this.persistSettings();
        await this.startIfEnabled();
    }

    /** Écrit les settings sur disque sans redémarrer le watcher. */
    private async persistSettings(): Promise<void> {
        await fs.mkdir(DATA_DIR, { recursive: true });
        await fs.writeFile(SETTINGS_PATH, JSON.stringify(this.settings, null, 2));
    }

    // ── Lifecycle ─────────────────────────────────────────────────

    async startIfEnabled(): Promise<void> {
        await this.loadSettings();
        await this.loadCrashEvents();
        await this.loadExclusionsFromDb();
        this.stop();
        if (this.settings.crashLoopEnabled) {
            this.startDockerEvents();
        }
    }

    private async loadExclusionsFromDb(): Promise<void> {
        try {
            const rows = await R.getAll("SELECT container_name, expires_at FROM crash_exclusion") as { container_name: string; expires_at: string | null }[];
            this.exclusionsCache = rows.map(r => ({
                containerName: r.container_name,
                expiresAt:     r.expires_at ?? null,
            }));
        } catch {
            this.exclusionsCache = [];
        }
    }

    private async loadCrashEvents(): Promise<void> {
        try {
            const raw = await fs.readFile(CRASH_EVENTS_PATH, "utf8");
            const events = JSON.parse(raw) as CrashEvent[];
            // Filtre les événements > 24h au chargement
            const cutoff = Date.now() - 86_400_000;
            this.recentCrashEvents = events.filter(
                e => new Date(e.timestamp).getTime() > cutoff,
            );
        } catch {
            this.recentCrashEvents = [];
        }
    }

    private async saveCrashEvents(): Promise<void> {
        try {
            await fs.mkdir(DATA_DIR, { recursive: true });
            await fs.writeFile(CRASH_EVENTS_PATH, JSON.stringify(this.recentCrashEvents, null, 2));
        } catch { /* ignore — perte de l'event en mémoire acceptable */ }
    }

    private stop(): void {
        if (this.dockerEventProc) {
            try { this.dockerEventProc.kill(); } catch { /* ignore */ }
            this.dockerEventProc = null;
        }
    }

    // ── Crash loop detection ──────────────────────────────────────

    private startDockerEvents(): void {
        this.dockerEventBuffer = "";
        this.dockerEventProc = spawn("docker", [
            "events", "--format", "{{json .}}", "--filter", "event=die",
        ]);

        this.dockerEventProc.stdout?.on("data", (chunk: Buffer) => {
            this.dockerEventBuffer += chunk.toString();
            const lines = this.dockerEventBuffer.split("\n");
            this.dockerEventBuffer = lines.pop() ?? "";
            for (const line of lines.filter(Boolean)) {
                try {
                    const ev = JSON.parse(line) as {
                        id?: string;
                        Actor?: { Attributes?: { name?: string } };
                    };
                    const name = ev.Actor?.Attributes?.name ?? ev.id?.slice(0, 12) ?? "unknown";
                    const id   = ev.id ?? name;
                    this.onContainerDie(name, id);
                } catch { /* ignore malformed line */ }
            }
        });

        this.dockerEventProc.on("close", () => {
            this.dockerEventProc = null;
            if (this.settings.crashLoopEnabled) {
                setTimeout(() => this.startDockerEvents(), 5_000);
            }
        });
    }

    private onContainerDie(name: string, id: string): void {
        if (this.isExcluded(name)) return;

        const now       = Date.now();
        const windowMs  = this.settings.crashLoopWindowMinutes * 60_000;

        const ts = (this.crashTimestamps.get(name) ?? []).concat(now)
            .filter(t => now - t < windowMs);
        this.crashTimestamps.set(name, ts);

        if (ts.length >= this.settings.crashLoopThreshold) {
            const lastAlert  = this.crashCooldowns.get(name) ?? 0;
            const cooldownMs = this.settings.crashLoopCooldownMinutes * 60_000;
            if (now - lastAlert >= cooldownMs) {
                this.crashCooldowns.set(name, now);
                this.crashTimestamps.set(name, []);

                const event: CrashEvent = {
                    containerName: name,
                    containerId:   id,
                    restartCount:  ts.length,
                    windowMinutes: this.settings.crashLoopWindowMinutes,
                    timestamp:     new Date().toISOString(),
                };

                this.recentCrashEvents.unshift(event);
                if (this.recentCrashEvents.length > 50) this.recentCrashEvents.splice(50);
                const cutoff = Date.now() - 86_400_000;
                this.recentCrashEvents = this.recentCrashEvents.filter(
                    e => new Date(e.timestamp).getTime() > cutoff,
                );

                this.saveCrashEvents().catch(() => { /* ignore */ });
                this.sendCrashAlert(event).catch(() => { /* ignore */ });
            }
        }
    }

    // ── Notifications ─────────────────────────────────────────────

    private async loadAppriseNotifier(): Promise<AppriseNotifier | null> {
        try {
            // Le serverUrl est partagé (stocké dans watcher-settings.json)
            const raw  = await fs.readFile(WATCHER_SETTINGS_PATH, "utf8");
            const data = JSON.parse(raw) as Record<string, unknown>;
            const serverUrl = typeof data.appriseServerUrl === "string" ? data.appriseServerUrl : "";
            if (!serverUrl) return null;
            // Les URLs sont propres au monitoring (stockées dans monitoring-settings.json)
            const urls = this.settings.appriseUrls ?? [];
            if (urls.length === 0) return null;
            return new AppriseNotifier(serverUrl, urls);
        } catch { return null; }
    }

    private async sendCrashAlert(event: CrashEvent): Promise<void> {
        const discord = this.settings.discordWebhooks.length > 0
            ? new DiscordNotifier(this.settings.discordWebhooks)
            : null;
        const apprise = await this.loadAppriseNotifier();
        if (!discord && !apprise) return;

        const hostname       = (await Settings.get("primaryHostname")) || "";
        const hostnamePrefix = hostname ? `[${hostname}] ` : "";
        const footerHost     = hostname ? ` · ${hostname}` : "";

        const en = (this.settings.notificationLang ?? "fr") === "en";
        const tr = (fr: string, enStr: string) => en ? enStr : fr;

        const title = `${hostnamePrefix}` + tr(
            `🔁 Boucle de crash — ${event.containerName}`,
            `🔁 Crash loop — ${event.containerName}`,
        );
        const desc = tr(
            `Le conteneur **${event.containerName}** a redémarré **${event.restartCount} fois** en ${event.windowMinutes} min.`,
            `Container **${event.containerName}** restarted **${event.restartCount} times** in ${event.windowMinutes} min.`,
        );

        if (discord) {
            await discord.sendEmbed({
                title, color: 0xef4444, description: desc, fields: [],
                footer: `Dockge Enhanced — Monitoring${footerHost} · ${new Date().toLocaleString(en ? "en-GB" : "fr-FR")}`,
            });
        }
        if (apprise) await apprise.send({ title, body: desc, type: "failure" });
    }

    // ── Public accessors ──────────────────────────────────────────

    getRecentCrashEvents(): CrashEvent[] {
        // Exclure les containers marqués comme ignorés
        return this.recentCrashEvents.filter(e => !this.isExcluded(e.containerName));
    }

    clearCrashEvents(): void {
        this.recentCrashEvents = [];
        this.saveCrashEvents().catch(() => { /* ignore */ });
    }

    getSettingsSafe(): MonitoringSettings {
        return { ...this.settings };
    }

    // ── Exclusions (persistées en DB SQLite) ─────────────────────

    /** Synchrone — utilise le cache mémoire, OK pour le hot path onContainerDie */
    isExcluded(containerName: string): boolean {
        const now  = Date.now();
        const excl = this.exclusionsCache.find(e => e.containerName === containerName);
        if (!excl) return false;
        if (excl.expiresAt === null) return true;
        return new Date(excl.expiresAt).getTime() > now;
    }

    /** Retourne les exclusions actives (purge les expirées de la DB au passage) */
    async getExclusions(): Promise<CrashExclusion[]> {
        const now     = Date.now();
        const expired = this.exclusionsCache.filter(
            e => e.expiresAt !== null && new Date(e.expiresAt).getTime() <= now,
        );
        for (const e of expired) {
            await R.exec("DELETE FROM crash_exclusion WHERE container_name = ?", [e.containerName]);
        }
        this.exclusionsCache = this.exclusionsCache.filter(
            e => e.expiresAt === null || new Date(e.expiresAt).getTime() > now,
        );
        return [...this.exclusionsCache];
    }

    async addExclusion(containerName: string, durationHours: number | null): Promise<void> {
        const expiresAt = durationHours === null
            ? null
            : new Date(Date.now() + durationHours * 3_600_000).toISOString();

        // UPSERT : remplace si le container existe déjà
        await R.exec(
            `INSERT INTO crash_exclusion (container_name, expires_at)
             VALUES (?, ?)
             ON CONFLICT(container_name) DO UPDATE SET expires_at = excluded.expires_at`,
            [containerName, expiresAt],
        );

        // Met à jour le cache
        const idx = this.exclusionsCache.findIndex(e => e.containerName === containerName);
        if (idx >= 0) {
            this.exclusionsCache[idx] = { containerName, expiresAt };
        } else {
            this.exclusionsCache.push({ containerName, expiresAt });
        }
    }

    async removeExclusion(containerName: string): Promise<void> {
        await R.exec("DELETE FROM crash_exclusion WHERE container_name = ?", [containerName]);
        this.exclusionsCache = this.exclusionsCache.filter(e => e.containerName !== containerName);
    }

    async clearExclusions(): Promise<void> {
        await R.exec("DELETE FROM crash_exclusion");
        this.exclusionsCache = [];
    }
}
