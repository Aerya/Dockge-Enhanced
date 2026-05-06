/**
 * MonitoringWatcher — Détection des crash loops + seuils CPU/RAM par stack.
 * Notifications via Discord + Apprise globaux.
 */

import { exec, spawn } from "child_process";
import { promisify } from "util";
import * as path from "path";
import * as fs from "fs/promises";
import { DiscordNotifier } from "../notification/discord";
import { AppriseNotifier } from "../notification/apprise";

const execAsync = promisify(exec);

const DATA_DIR              = process.env.DOCKGE_DATA_DIR ?? "/opt/dockge/data";
const SETTINGS_PATH         = path.join(DATA_DIR, "monitoring-settings.json");
const WATCHER_SETTINGS_PATH = path.join(DATA_DIR, "watcher-settings.json");

// ─── Types ────────────────────────────────────────────────────────

export interface StackAlertConfig {
    cpuPercent?: number;
    ramMB?: number;
}

export interface MonitoringSettings {
    crashLoopEnabled: boolean;
    crashLoopThreshold: number;          // N redémarrages
    crashLoopWindowMinutes: number;      // dans X minutes
    crashLoopCooldownMinutes: number;    // anti-spam
    stackAlertsEnabled: boolean;
    stackAlerts: Record<string, StackAlertConfig>;
    stackAlertsIntervalMinutes: number;
    stackAlertsCooldownMinutes: number;
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
    stackAlertsEnabled: false,
    stackAlerts: {},
    stackAlertsIntervalMinutes: 5,
    stackAlertsCooldownMinutes: 30,
    discordWebhooks: [],
    notificationLang: "fr",
};

// ─── Singleton ────────────────────────────────────────────────────

export class MonitoringWatcher {
    private static _instance: MonitoringWatcher;

    settings: MonitoringSettings = { ...DEFAULT_SETTINGS };

    // Crash loop tracking
    private crashTimestamps: Map<string, number[]> = new Map();
    private crashCooldowns:  Map<string, number>   = new Map();
    private recentCrashEvents: CrashEvent[] = [];
    private dockerEventProc: ReturnType<typeof spawn> | null = null;
    private dockerEventBuffer = "";

    // Stack threshold tracking
    private stackAlertCooldowns: Map<string, number> = new Map();
    private stackAlertTimer: NodeJS.Timeout | null = null;

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
        this.stopAll();
        if (this.settings.crashLoopEnabled) {
            this.startDockerEvents();
        }
        if (this.settings.stackAlertsEnabled) {
            this.startStackAlerts();
        }
    }

    private stopAll(): void {
        if (this.dockerEventProc) {
            try { this.dockerEventProc.kill(); } catch { /* ignore */ }
            this.dockerEventProc = null;
        }
        if (this.stackAlertTimer) {
            clearInterval(this.stackAlertTimer);
            this.stackAlertTimer = null;
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

                // Keep last 50 events, purge >24 h
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

    // ── CPU/RAM threshold alerts ──────────────────────────────────

    private startStackAlerts(): void {
        const ms = this.settings.stackAlertsIntervalMinutes * 60_000;
        this.checkStackThresholds().catch(() => { /* ignore */ });
        this.stackAlertTimer = setInterval(
            () => this.checkStackThresholds().catch(() => { /* ignore */ }),
            ms,
        );
    }

    private async checkStackThresholds(): Promise<void> {
        if (!this.settings.stackAlertsEnabled) return;

        let stdout: string;
        try {
            ({ stdout } = await execAsync("docker stats --no-stream --format '{{json .}}'"));
        } catch { return; }

        // Aggregate per stack
        const stackStats = new Map<string, { cpu: number; memMB: number }>();

        for (const line of stdout.split("\n").filter(Boolean)) {
            try {
                const stat = JSON.parse(line) as {
                    Name?: string;
                    CPUPerc?: string;
                    MemUsage?: string;
                };
                const containerName = stat.Name ?? "";
                const stackName     = this.stackFromContainerName(containerName);
                if (!stackName) continue;

                const cpu   = parseFloat((stat.CPUPerc ?? "0%").replace("%", "")) || 0;
                const memMB = this.parseMemMB((stat.MemUsage ?? "0MiB / 0MiB").split(" / ")[0]);

                const prev = stackStats.get(stackName) ?? { cpu: 0, memMB: 0 };
                stackStats.set(stackName, { cpu: prev.cpu + cpu, memMB: prev.memMB + memMB });
            } catch { /* ignore */ }
        }

        const now = Date.now();
        for (const [stackName, cfg] of Object.entries(this.settings.stackAlerts)) {
            const stats = stackStats.get(stackName);
            if (!stats) continue;

            const cpuOver = cfg.cpuPercent != null && stats.cpu > cfg.cpuPercent;
            const ramOver = cfg.ramMB      != null && stats.memMB > cfg.ramMB;
            if (!cpuOver && !ramOver) continue;

            const lastAlert  = this.stackAlertCooldowns.get(stackName) ?? 0;
            const cooldownMs = this.settings.stackAlertsCooldownMinutes * 60_000;
            if (now - lastAlert >= cooldownMs) {
                this.stackAlertCooldowns.set(stackName, now);
                await this.sendStackAlert(stackName, stats.cpu, stats.memMB, cfg);
            }
        }
    }

    private stackFromContainerName(name: string): string | null {
        // Compose v2 : <project>-<service>-<N>
        // Compose v1 : <project>_<service>_<N>
        const sep   = name.includes("_") ? "_" : "-";
        const parts = name.split(sep);
        return parts.length >= 2 ? parts[0] : null;
    }

    private parseMemMB(s: string): number {
        const val = parseFloat(s);
        if (/GiB|GB/i.test(s)) return val * 1024;
        if (/MiB|MB/i.test(s)) return val;
        if (/KiB|kB/i.test(s)) return val / 1024;
        return val / (1024 * 1024); // bytes
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
        const t  = (fr: string, enStr: string) => en ? enStr : fr;

        const title = t(
            `🔁 Boucle de crash — ${event.containerName}`,
            `🔁 Crash loop — ${event.containerName}`,
        );
        const desc = t(
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

    private async sendStackAlert(
        stack: string,
        cpu: number,
        memMB: number,
        cfg: StackAlertConfig,
    ): Promise<void> {
        const discord = this.settings.discordWebhooks.length > 0
            ? new DiscordNotifier(this.settings.discordWebhooks)
            : null;
        const apprise = await this.loadAppriseNotifier();
        if (!discord && !apprise) return;

        const en = (this.settings.notificationLang ?? "fr") === "en";
        const t  = (fr: string, enStr: string) => en ? enStr : fr;

        const title = t(
            `⚠️ Seuil dépassé — Stack ${stack}`,
            `⚠️ Threshold exceeded — Stack ${stack}`,
        );
        const lines: string[] = [];
        if (cfg.cpuPercent != null && cpu > cfg.cpuPercent) {
            lines.push(t(
                `CPU : **${cpu.toFixed(1)}%** (seuil : ${cfg.cpuPercent}%)`,
                `CPU: **${cpu.toFixed(1)}%** (threshold: ${cfg.cpuPercent}%)`,
            ));
        }
        if (cfg.ramMB != null && memMB > cfg.ramMB) {
            lines.push(t(
                `RAM : **${memMB.toFixed(0)} MB** (seuil : ${cfg.ramMB} MB)`,
                `RAM: **${memMB.toFixed(0)} MB** (threshold: ${cfg.ramMB} MB)`,
            ));
        }
        const desc = lines.join("\n");

        if (discord) {
            await discord.sendEmbed({
                title, color: 0xf59e0b, description: desc, fields: [],
                footer: `Dockge Enhanced — Monitoring · ${new Date().toLocaleString(en ? "en-GB" : "fr-FR")}`,
            });
        }
        if (apprise) await apprise.send({ title, body: desc, type: "warning" });
    }

    // ── Public accessors ──────────────────────────────────────────

    getRecentCrashEvents(): CrashEvent[] {
        return this.recentCrashEvents;
    }

    getSettingsSafe(): MonitoringSettings {
        return { ...this.settings };
    }
}
