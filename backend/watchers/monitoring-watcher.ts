/**
 * MonitoringWatcher — Détection des crash loops.
 * Notifications via Discord + Apprise globaux.
 */

import { spawn } from "child_process";
import * as path from "path";
import * as fs from "fs/promises";
import { DiscordNotifier } from "../notification/discord";
import { AppriseNotifier } from "../notification/apprise";

const DATA_DIR              = process.env.DOCKGE_DATA_DIR ?? "/opt/dockge/data";
const SETTINGS_PATH         = path.join(DATA_DIR, "monitoring-settings.json");
const WATCHER_SETTINGS_PATH = path.join(DATA_DIR, "watcher-settings.json");

// ─── Types ────────────────────────────────────────────────────────

export interface MonitoringSettings {
    crashLoopEnabled: boolean;
    crashLoopThreshold: number;          // N redémarrages
    crashLoopWindowMinutes: number;      // dans X minutes
    crashLoopCooldownMinutes: number;    // anti-spam
    discordWebhooks: string[];
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
    notificationLang: "fr",
};

// ─── Singleton ────────────────────────────────────────────────────

export class MonitoringWatcher {
    private static _instance: MonitoringWatcher;

    settings: MonitoringSettings = { ...DEFAULT_SETTINGS };

    private crashTimestamps: Map<string, number[]> = new Map();
    private crashCooldowns:  Map<string, number>   = new Map();
    private recentCrashEvents: CrashEvent[] = [];
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
        await fs.mkdir(DATA_DIR, { recursive: true });
        await fs.writeFile(SETTINGS_PATH, JSON.stringify(this.settings, null, 2));
        await this.startIfEnabled();
    }

    // ── Lifecycle ─────────────────────────────────────────────────

    async startIfEnabled(): Promise<void> {
        await this.loadSettings();
        this.stop();
        if (this.settings.crashLoopEnabled) {
            this.startDockerEvents();
        }
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

                this.sendCrashAlert(event).catch(() => { /* ignore */ });
            }
        }
    }

    // ── Notifications ─────────────────────────────────────────────

    private async loadAppriseNotifier(): Promise<AppriseNotifier | null> {
        try {
            const raw  = await fs.readFile(WATCHER_SETTINGS_PATH, "utf8");
            const data = JSON.parse(raw) as Record<string, unknown>;
            const serverUrl = typeof data.appriseServerUrl === "string" ? data.appriseServerUrl : "";
            const urls = Array.isArray(data.appriseUrls) ? data.appriseUrls as string[] : [];
            if (!serverUrl) return null;
            return new AppriseNotifier(serverUrl, urls);
        } catch { return null; }
    }

    private async sendCrashAlert(event: CrashEvent): Promise<void> {
        const discord = this.settings.discordWebhooks.length > 0
            ? new DiscordNotifier(this.settings.discordWebhooks)
            : null;
        const apprise = await this.loadAppriseNotifier();
        if (!discord && !apprise) return;

        const en = (this.settings.notificationLang ?? "fr") === "en";
        const tr = (fr: string, enStr: string) => en ? enStr : fr;

        const title = tr(
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
                footer: `Dockge Enhanced — Monitoring · ${new Date().toLocaleString(en ? "en-GB" : "fr-FR")}`,
            });
        }
        if (apprise) await apprise.send({ title, body: desc, type: "failure" });
    }

    // ── Public accessors ──────────────────────────────────────────

    getRecentCrashEvents(): CrashEvent[] {
        return this.recentCrashEvents;
    }

    getSettingsSafe(): MonitoringSettings {
        return { ...this.settings };
    }
}
