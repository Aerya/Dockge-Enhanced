/**
 * MonitoringWatcher - crash-loop detection and optional Docker health auto-heal.
 * Notifications via Discord + Apprise.
 */

import { spawn } from "child_process";
import childProcessAsync from "promisify-child-process";
import * as path from "path";
import * as fs from "fs/promises";
import { R } from "redbean-node";
import yaml from "yaml";
import { DiscordNotifier } from "../notification/discord";
import { AppriseNotifier } from "../notification/apprise";
import { Settings } from "../settings";
import { DockgeServer } from "../dockge-server";
import { Stack } from "../stack";
import { log } from "../log";

const DATA_DIR              = process.env.DOCKGE_DATA_DIR ?? "/opt/dockge/data";
const SETTINGS_PATH         = path.join(DATA_DIR, "monitoring-settings.json");
const CRASH_EVENTS_PATH     = path.join(DATA_DIR, "crash-events.json");
const HEALTH_EVENTS_PATH    = path.join(DATA_DIR, "health-events.json");
const WATCHER_SETTINGS_PATH = path.join(DATA_DIR, "watcher-settings.json");

export type HealthAutoHealMode = "notify" | "restart_container" | "restart_service" | "stack_aware";
type HealthActionStatus = "notified" | "success" | "failed" | "skipped";

export interface CrashExclusion {
    containerName: string;
    expiresAt: string | null;
}

export interface MonitoringSettings {
    crashLoopEnabled: boolean;
    crashLoopThreshold: number;
    crashLoopWindowMinutes: number;
    crashLoopCooldownMinutes: number;
    healthcheckEnabled: boolean;
    healthcheckAutoHealMode: HealthAutoHealMode;
    healthcheckCooldownMinutes: number;
    discordWebhooks: string[];
    appriseUrls: string[];
    notificationLang: "fr" | "en";
    lowPowerMode: boolean;
}

export interface CrashEvent {
    containerName: string;
    containerId: string;
    restartCount: number;
    windowMinutes: number;
    timestamp: string;
}

export interface HealthEvent {
    containerName: string;
    containerId: string;
    stackName: string | null;
    serviceName: string | null;
    healthStatus: string;
    action: HealthAutoHealMode;
    actionStatus: HealthActionStatus;
    message: string;
    timestamp: string;
}

interface DockerEvent {
    status?: string;
    id?: string;
    Actor?: {
        Attributes?: Record<string, string | undefined>;
    };
}

const DEFAULT_SETTINGS: MonitoringSettings = {
    crashLoopEnabled: false,
    crashLoopThreshold: 5,
    crashLoopWindowMinutes: 10,
    crashLoopCooldownMinutes: 60,
    healthcheckEnabled: false,
    healthcheckAutoHealMode: "notify",
    healthcheckCooldownMinutes: 30,
    discordWebhooks: [],
    appriseUrls: [],
    notificationLang: "fr",
    lowPowerMode: false,
};

export class MonitoringWatcher {
    private static _instance: MonitoringWatcher;

    settings: MonitoringSettings = { ...DEFAULT_SETTINGS };

    private server: DockgeServer | null = null;
    private crashTimestamps:   Map<string, number[]> = new Map();
    private crashCooldowns:    Map<string, number>   = new Map();
    private healthCooldowns:   Map<string, number>   = new Map();
    private recentCrashEvents: CrashEvent[]          = [];
    private recentHealthEvents: HealthEvent[]        = [];
    private exclusionsCache:   CrashExclusion[]      = [];
    private dockerEventProc: ReturnType<typeof spawn> | null = null;
    private dockerEventBuffer = "";

    static getInstance(): MonitoringWatcher {
        if (!MonitoringWatcher._instance) {
            MonitoringWatcher._instance = new MonitoringWatcher();
        }
        return MonitoringWatcher._instance;
    }

    setServer(server: DockgeServer): void {
        this.server = server;
    }

    async loadSettings(): Promise<void> {
        try {
            const raw = await fs.readFile(SETTINGS_PATH, "utf8");
            this.settings = { ...DEFAULT_SETTINGS, ...JSON.parse(raw) as Partial<MonitoringSettings> };
            if (!["notify", "restart_container", "restart_service", "stack_aware"].includes(this.settings.healthcheckAutoHealMode)) {
                this.settings.healthcheckAutoHealMode = "notify";
            }
        } catch {
            this.settings = { ...DEFAULT_SETTINGS };
        }
    }

    async saveSettings(partial: Partial<MonitoringSettings>): Promise<void> {
        const safePartial = { ...partial };
        if (
            safePartial.healthcheckAutoHealMode !== undefined &&
            !["notify", "restart_container", "restart_service", "stack_aware"].includes(safePartial.healthcheckAutoHealMode)
        ) {
            safePartial.healthcheckAutoHealMode = "notify";
        }
        this.settings = { ...this.settings, ...safePartial };
        await this.persistSettings();
        await this.startIfEnabled();
    }

    private async persistSettings(): Promise<void> {
        await fs.mkdir(DATA_DIR, { recursive: true });
        await fs.writeFile(SETTINGS_PATH, JSON.stringify(this.settings, null, 2));
    }

    async startIfEnabled(): Promise<void> {
        await this.loadSettings();
        await this.loadCrashEvents();
        await this.loadHealthEvents();
        await this.loadExclusionsFromDb();
        this.stop();
        if (this.settings.crashLoopEnabled || this.settings.healthcheckEnabled) {
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
            const cutoff = Date.now() - 86_400_000;
            this.recentCrashEvents = events.filter(e => new Date(e.timestamp).getTime() > cutoff);
        } catch {
            this.recentCrashEvents = [];
        }
    }

    private async loadHealthEvents(): Promise<void> {
        try {
            const raw = await fs.readFile(HEALTH_EVENTS_PATH, "utf8");
            const events = JSON.parse(raw) as HealthEvent[];
            const cutoff = Date.now() - 86_400_000;
            this.recentHealthEvents = events.filter(e => new Date(e.timestamp).getTime() > cutoff);
        } catch {
            this.recentHealthEvents = [];
        }
    }

    private async saveCrashEvents(): Promise<void> {
        try {
            await fs.mkdir(DATA_DIR, { recursive: true });
            await fs.writeFile(CRASH_EVENTS_PATH, JSON.stringify(this.recentCrashEvents, null, 2));
        } catch { /* ignore */ }
    }

    private async saveHealthEvents(): Promise<void> {
        try {
            await fs.mkdir(DATA_DIR, { recursive: true });
            await fs.writeFile(HEALTH_EVENTS_PATH, JSON.stringify(this.recentHealthEvents, null, 2));
        } catch { /* ignore */ }
    }

    private stop(): void {
        if (this.dockerEventProc) {
            try { this.dockerEventProc.kill(); } catch { /* ignore */ }
            this.dockerEventProc = null;
        }
    }

    private startDockerEvents(): void {
        this.dockerEventBuffer = "";
        const filters = [];
        if (this.settings.crashLoopEnabled) {
            filters.push("--filter", "event=die");
        }
        if (this.settings.healthcheckEnabled) {
            filters.push("--filter", "event=health_status");
        }

        this.dockerEventProc = spawn("docker", [
            "events", "--format", "{{json .}}", ...filters,
        ]);

        this.dockerEventProc.stdout?.on("data", (chunk: Buffer) => {
            this.dockerEventBuffer += chunk.toString();
            const lines = this.dockerEventBuffer.split("\n");
            this.dockerEventBuffer = lines.pop() ?? "";
            for (const line of lines.filter(Boolean)) {
                this.handleDockerEventLine(line);
            }
        });

        this.dockerEventProc.on("close", () => {
            this.dockerEventProc = null;
            if (this.settings.crashLoopEnabled || this.settings.healthcheckEnabled) {
                setTimeout(() => this.startDockerEvents(), 5_000);
            }
        });
    }

    private handleDockerEventLine(line: string): void {
        try {
            const ev = JSON.parse(line) as DockerEvent;
            const attrs = ev.Actor?.Attributes ?? {};
            const name = attrs.name ?? ev.id?.slice(0, 12) ?? "unknown";
            const id = ev.id ?? name;
            const status = ev.status ?? "";

            if (this.settings.crashLoopEnabled && status === "die") {
                this.onContainerDie(name, id);
            }

            const healthStatus = attrs.health_status ?? status.replace(/^health_status:\s*/, "");
            if (this.settings.healthcheckEnabled && status.startsWith("health_status") && healthStatus === "unhealthy") {
                this.onContainerUnhealthy(ev, name, id).catch(e => {
                    log.warn("monitoring", `Health event handling failed for ${name}: ${e instanceof Error ? e.message : String(e)}`);
                });
            }
        } catch {
            /* ignore malformed line */
        }
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
                this.trimCrashEvents();
                this.saveCrashEvents().catch(() => { /* ignore */ });
                this.sendCrashAlert(event).catch(() => { /* ignore */ });
            }
        }
    }

    private async onContainerUnhealthy(ev: DockerEvent, name: string, id: string): Promise<void> {
        const now = Date.now();
        const cooldownMs = Math.max(1, this.settings.healthcheckCooldownMinutes) * 60_000;
        const lastAction = this.healthCooldowns.get(name) ?? 0;
        if (now - lastAction < cooldownMs) {
            return;
        }
        this.healthCooldowns.set(name, now);

        const attrs = ev.Actor?.Attributes ?? {};
        const stackName = attrs["com.docker.compose.project"] ?? null;
        const serviceName = attrs["com.docker.compose.service"] ?? null;
        const action = this.settings.healthcheckAutoHealMode;
        const event: HealthEvent = {
            containerName: name,
            containerId: id,
            stackName,
            serviceName,
            healthStatus: "unhealthy",
            action,
            actionStatus: "notified",
            message: "Notification only",
            timestamp: new Date().toISOString(),
        };

        if (action !== "notify") {
            const result = await this.applyHealthAction(action, name, id, stackName, serviceName);
            event.actionStatus = result.ok ? "success" : "failed";
            event.message = result.message;
        }

        this.recentHealthEvents.unshift(event);
        this.trimHealthEvents();
        this.saveHealthEvents().catch(() => { /* ignore */ });
        await this.sendHealthAlert(event);
    }

    private async applyHealthAction(
        action: HealthAutoHealMode,
        containerName: string,
        containerId: string,
        stackName: string | null,
        serviceName: string | null
    ): Promise<{ ok: boolean; message: string }> {
        try {
            if (action === "restart_container") {
                await childProcessAsync.spawn("docker", [ "restart", containerId || containerName ], { encoding: "utf-8" });
                return { ok: true, message: "Container restarted" };
            }

            if (!stackName || !serviceName || !this.server) {
                await childProcessAsync.spawn("docker", [ "restart", containerId || containerName ], { encoding: "utf-8" });
                return { ok: true, message: "No managed compose service found, container restarted" };
            }

            const stack = await Stack.getStack(this.server, stackName);

            if (action === "restart_service") {
                await stack.restartService(serviceName);
                return { ok: true, message: `Compose service restarted: ${serviceName}` };
            }

            const providers = this.getNetworkProviderServices(stack);
            if (providers.has(serviceName)) {
                await stack.recreateInBackground();
                return { ok: true, message: `Stack recreated because ${serviceName} provides network_mode: service to another service` };
            }

            await stack.restartService(serviceName);
            return { ok: true, message: `Compose service restarted: ${serviceName}` };
        } catch (e) {
            return { ok: false, message: e instanceof Error ? e.message : String(e) };
        }
    }

    private getNetworkProviderServices(stack: Stack): Set<string> {
        const providers = new Set<string>();
        for (const composeText of [ stack.composeYAML, stack.composeOverrideYAML ]) {
            if (!composeText.trim()) continue;
            try {
                const doc = yaml.parse(composeText) as { services?: Record<string, { network_mode?: unknown }> } | null;
                const services = doc?.services ?? {};
                for (const config of Object.values(services)) {
                    if (typeof config?.network_mode !== "string") continue;
                    const match = config.network_mode.match(/^service:(.+)$/);
                    if (match?.[1]) {
                        providers.add(match[1]);
                    }
                }
            } catch {
                /* Invalid YAML is already handled when stacks are saved. Ignore here. */
            }
        }
        return providers;
    }

    private trimCrashEvents(): void {
        if (this.recentCrashEvents.length > 50) this.recentCrashEvents.splice(50);
        const cutoff = Date.now() - 86_400_000;
        this.recentCrashEvents = this.recentCrashEvents.filter(e => new Date(e.timestamp).getTime() > cutoff);
    }

    private trimHealthEvents(): void {
        if (this.recentHealthEvents.length > 50) this.recentHealthEvents.splice(50);
        const cutoff = Date.now() - 86_400_000;
        this.recentHealthEvents = this.recentHealthEvents.filter(e => new Date(e.timestamp).getTime() > cutoff);
    }

    private async loadAppriseNotifier(): Promise<AppriseNotifier | null> {
        try {
            const raw  = await fs.readFile(WATCHER_SETTINGS_PATH, "utf8");
            const data = JSON.parse(raw) as Record<string, unknown>;
            const serverUrl = typeof data.appriseServerUrl === "string" ? data.appriseServerUrl : "";
            if (!serverUrl) return null;
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
        const footerHost     = hostname ? ` - ${hostname}` : "";

        const en = (this.settings.notificationLang ?? "fr") === "en";
        const tr = (fr: string, enStr: string) => en ? enStr : fr;

        const title = `${hostnamePrefix}` + tr(
            `Boucle de crash - ${event.containerName}`,
            `Crash loop - ${event.containerName}`,
        );
        const desc = tr(
            `Le conteneur **${event.containerName}** a redémarré **${event.restartCount} fois** en ${event.windowMinutes} min.`,
            `Container **${event.containerName}** restarted **${event.restartCount} times** in ${event.windowMinutes} min.`,
        );

        if (discord) {
            await discord.sendEmbed({
                title, color: 0xef4444, description: desc, fields: [],
                footer: `Dockge Enhanced - Monitoring${footerHost} - ${new Date().toLocaleString(en ? "en-GB" : "fr-FR")}`,
            });
        }
        if (apprise) await apprise.send({ title, body: desc, type: "failure" });
    }

    private async sendHealthAlert(event: HealthEvent): Promise<void> {
        const discord = this.settings.discordWebhooks.length > 0
            ? new DiscordNotifier(this.settings.discordWebhooks)
            : null;
        const apprise = await this.loadAppriseNotifier();
        if (!discord && !apprise) return;

        const hostname       = (await Settings.get("primaryHostname")) || "";
        const hostnamePrefix = hostname ? `[${hostname}] ` : "";
        const footerHost     = hostname ? ` - ${hostname}` : "";

        const en = (this.settings.notificationLang ?? "fr") === "en";
        const tr = (fr: string, enStr: string) => en ? enStr : fr;
        const actionLabel = this.healthActionLabel(event.action, en);
        const statusLabel = event.actionStatus === "success"
            ? tr("action réussie", "action succeeded")
            : event.actionStatus === "failed"
                ? tr("action échouée", "action failed")
                : tr("notification seule", "notification only");

        const title = `${hostnamePrefix}` + tr(
            `Healthcheck unhealthy - ${event.containerName}`,
            `Healthcheck unhealthy - ${event.containerName}`,
        );
        const desc = tr(
            `Le conteneur **${event.containerName}** est passé en **unhealthy**. Mode: **${actionLabel}** (${statusLabel}). ${event.message}`,
            `Container **${event.containerName}** became **unhealthy**. Mode: **${actionLabel}** (${statusLabel}). ${event.message}`,
        );

        if (discord) {
            await discord.sendEmbed({
                title,
                color: event.actionStatus === "failed" ? 0xef4444 : 0xf59e0b,
                description: desc,
                fields: [
                    { name: "Stack", value: event.stackName ?? "-", inline: true },
                    { name: "Service", value: event.serviceName ?? "-", inline: true },
                ],
                footer: `Dockge Enhanced - Monitoring${footerHost} - ${new Date().toLocaleString(en ? "en-GB" : "fr-FR")}`,
            });
        }
        if (apprise) await apprise.send({ title, body: desc, type: event.actionStatus === "failed" ? "failure" : "warning" });
    }

    private healthActionLabel(action: HealthAutoHealMode, en: boolean): string {
        const labels: Record<HealthAutoHealMode, { fr: string; en: string }> = {
            notify: { fr: "Notification seule", en: "Notify only" },
            restart_container: { fr: "Redémarrer le conteneur", en: "Restart container" },
            restart_service: { fr: "Redémarrer le service Compose", en: "Restart Compose service" },
            stack_aware: { fr: "Intelligent stack/network", en: "Stack/network aware" },
        };
        return en ? labels[action].en : labels[action].fr;
    }

    getRecentCrashEvents(): CrashEvent[] {
        return this.recentCrashEvents.filter(e => !this.isExcluded(e.containerName));
    }

    getRecentHealthEvents(): HealthEvent[] {
        return [...this.recentHealthEvents];
    }

    clearCrashEvents(): void {
        this.recentCrashEvents = [];
        this.saveCrashEvents().catch(() => { /* ignore */ });
    }

    clearHealthEvents(): void {
        this.recentHealthEvents = [];
        this.saveHealthEvents().catch(() => { /* ignore */ });
    }

    getSettingsSafe(): MonitoringSettings {
        return { ...this.settings };
    }

    isExcluded(containerName: string): boolean {
        const now  = Date.now();
        const excl = this.exclusionsCache.find(e => e.containerName === containerName);
        if (!excl) return false;
        if (excl.expiresAt === null) return true;
        return new Date(excl.expiresAt).getTime() > now;
    }

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

        await R.exec(
            `INSERT INTO crash_exclusion (container_name, expires_at)
             VALUES (?, ?)
             ON CONFLICT(container_name) DO UPDATE SET expires_at = excluded.expires_at`,
            [containerName, expiresAt],
        );

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
