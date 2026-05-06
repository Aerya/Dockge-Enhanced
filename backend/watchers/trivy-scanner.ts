/**
 * TrivyScanner — Scanne les images Docker avec Trivy et notifie Discord selon la sévérité.
 * Fichier : backend/watchers/trivy-scanner.ts
 */

import * as cron from "node-cron";
import { exec } from "child_process";
import { promisify } from "util";
import * as path from "path";
import { DiscordNotifier } from "../notification/discord";
import { AppriseNotifier } from "../notification/apprise";
import { Settings } from "../settings";

const execAsync = promisify(exec);

const DATA_DIR           = process.env.DOCKGE_DATA_DIR ?? "/opt/dockge/data";
const SETTINGS_PATH      = path.join(DATA_DIR, "trivy-settings.json");
const WATCHER_SETTINGS_PATH = path.join(DATA_DIR, "watcher-settings.json");
const STATUS_PATH   = path.join(DATA_DIR, "trivy-status.json");

type Severity = "UNKNOWN" | "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

const SEVERITY_LEVELS: Record<Severity, number> = {
    UNKNOWN: 0,
    LOW: 1,
    MEDIUM: 2,
    HIGH: 3,
    CRITICAL: 4,
};

const SEVERITY_COLORS: Record<Severity, number> = {
    UNKNOWN: 0x6b7280,
    LOW: 0x3b82f6,
    MEDIUM: 0xf59e0b,
    HIGH: 0xf97316,
    CRITICAL: 0xef4444,
};

const SEVERITY_EMOJI: Record<Severity, string> = {
    UNKNOWN: "⚪",
    LOW: "🔵",
    MEDIUM: "🟡",
    HIGH: "🟠",
    CRITICAL: "🔴",
};

function shellQuote(value: string): string {
    return '"' + value.replace(/(["\\$`])/g, "\\$1") + '"';
}

function sanitizeIntervalHours(value: unknown, fallback = 24): number {
    const interval = Number(value);
    if (!Number.isFinite(interval)) return fallback;
    return Math.min(24, Math.max(1, Math.floor(interval)));
}

function sanitizeTimeoutMinutes(value: unknown, fallback = 10): number {
    const timeout = Number(value);
    if (!Number.isFinite(timeout)) return fallback;
    return Math.min(120, Math.max(1, Math.floor(timeout)));
}

interface ScannerSettings {
    enabled: boolean;
    intervalHours: number;
    discordWebhooks: string[];    // liste de webhooks (migration auto depuis discordWebhook)
    minSeverityAlert: Severity;
    ignoreUnfixed: boolean;
    scanTimeoutMinutes: number;
    notificationLang: "fr" | "en";
    ignoredCVEs: string[];        // CVE IDs ignorés globalement (pas de notif, masqués dans l'UI)
}

interface Vulnerability {
    VulnerabilityID: string;
    PkgName: string;
    InstalledVersion: string;
    FixedVersion?: string;
    Severity: Severity;
    Title?: string;
    Description?: string;
    PrimaryURL?: string;
}

interface TrivyResult {
    Target: string;
    Type: string;
    Vulnerabilities?: Vulnerability[];
}

interface ScanResult {
    image: string;
    stack: string;
    results: TrivyResult[];
    counts: Record<Severity, number>;
    maxSeverity: Severity;
    error?: string;
}

interface ScanSummary {
    image: string;
    stack: string;
    maxSeverity: Severity;
    counts: Record<Severity, number>;
    error?: string;
}

interface ScanDetailEntry {
    image: string;
    stack: string;
    vulns: Array<{
        id: string;
        pkg: string;
        installed: string;
        fixed: string;
        severity: Severity;
        url: string;
        title: string;
    }>;
    error?: string;
}

interface ScanStatus {
    running: boolean;
    lastScanAt: string | null;
    scannedCount: number;
    lastResults: ScanSummary[];
    lastFullResults: ScanDetailEntry[];
}

export class TrivyScanner {
    private static instance: TrivyScanner;
    private cronJob: cron.ScheduledTask | null = null;
    private baseUrl: string = "";

    private scanStatus: ScanStatus = {
        running: false,
        lastScanAt: null,
        scannedCount: 0,
        lastResults: [],
        lastFullResults: [],
    };

    setBaseUrl(url: string): void { this.baseUrl = url; }

    getStatus(): ScanStatus {
        return { ...this.scanStatus };
    }

    settings: ScannerSettings = {
        enabled: false,
        intervalHours: 24,
        discordWebhooks: [],
        minSeverityAlert: "HIGH",
        ignoreUnfixed: false,
        scanTimeoutMinutes: 10,
        notificationLang: "fr",
        ignoredCVEs: [],
    };

    static getInstance(): TrivyScanner {
        if (!TrivyScanner.instance) {
            TrivyScanner.instance = new TrivyScanner();
        }
        return TrivyScanner.instance;
    }

    async loadSettings(): Promise<void> {
        try {
            const fs   = await import("fs/promises");
            const raw  = await fs.readFile(SETTINGS_PATH, "utf8");
            const data = JSON.parse(raw) as Record<string, unknown>;
            // Migration : ancien champ discordWebhook (string) → discordWebhooks (string[])
            if (typeof data.discordWebhook === "string" && !data.discordWebhooks) {
                data.discordWebhooks = data.discordWebhook ? [data.discordWebhook] : [];
                delete data.discordWebhook;
            }
            this.settings = { ...this.settings, ...data as Partial<ScannerSettings> };
        } catch { /* config absente ou première utilisation */ }
        await this.loadStatus();
    }

    private async loadStatus(): Promise<void> {
        try {
            const fs  = await import("fs/promises");
            const raw = await fs.readFile(STATUS_PATH, "utf8");
            const data = JSON.parse(raw) as Partial<ScanStatus>;
            this.scanStatus = {
                running: false, // jamais "en cours" au démarrage
                lastScanAt:    data.lastScanAt    ?? null,
                scannedCount:  data.scannedCount  ?? 0,
                lastResults:   data.lastResults   ?? [],
                lastFullResults: data.lastFullResults ?? [],
            };
        } catch { /* pas encore de fichier de statut */ }
    }

    private async saveStatus(): Promise<void> {
        try {
            const fs = await import("fs/promises");
            await fs.mkdir(DATA_DIR, { recursive: true });
            await fs.writeFile(STATUS_PATH, JSON.stringify(this.scanStatus, null, 2));
        } catch { /* silencieux */ }
    }

    async saveSettings(partial: Partial<ScannerSettings>): Promise<void> {
        this.settings = { ...this.settings, ...partial };
        const fs = await import("fs/promises");
        await fs.mkdir(DATA_DIR, { recursive: true });
        await fs.writeFile(SETTINGS_PATH, JSON.stringify(this.settings, null, 2));
        this.restart();
    }

    getSettings(): ScannerSettings {
        return { ...this.settings };
    }

    async startIfEnabled(): Promise<void> {
        await this.loadSettings();
        if (this.settings.enabled) {
            this.start();
        }
    }

    start(): void {
        this.stop();
        const intervalHours = sanitizeIntervalHours(this.settings.intervalHours);
        this.settings.intervalHours = intervalHours;
        const cronExpr = `0 */${intervalHours} * * *`;
        console.log(`[TrivyScanner] Démarrage — scan toutes les ${intervalHours}h`);
        this.cronJob = cron.schedule(cronExpr, () => this.runScan());
    }

    stop(): void {
        if (this.cronJob) {
            this.cronJob.stop();
            this.cronJob = null;
            console.log("[TrivyScanner] Arrêté");
        }
    }

    restart(): void {
        if (this.settings.enabled) {
            this.start();
        } else {
            this.stop();
        }
    }

    /** Lance un scan manuel immédiat */
    async runScan(targetImage?: string): Promise<ScanResult[]> {
        console.log("[TrivyScanner] Début du scan de sécurité...");
        this.scanStatus.running = true;
        const scanResults: ScanResult[] = [];

        try {
            // Pull de la dernière image Trivy avant chaque scan
            console.log("[TrivyScanner] Pull de ghcr.io/aquasecurity/trivy:latest...");
            await execAsync("docker pull ghcr.io/aquasecurity/trivy:latest");

            let images: Array<{ image: string; stack: string }>;

            if (targetImage) {
                images = [{ image: targetImage, stack: "manuel" }];
            } else {
                images = await this.getAllRunningImages();
            }

            for (const { image, stack } of images) {
                const result = await this.scanImage(image, stack);
                scanResults.push(result);
            }

            await this.sendDiscordNotifications(scanResults);
        } catch (e) {
            console.error("[TrivyScanner] Erreur lors du scan:", e);
        } finally {
            // Suppression de l'image Trivy après le scan pour libérer l'espace disque
            execAsync("docker rmi ghcr.io/aquasecurity/trivy:latest").catch(() => { /* silencieux */ });
        }

        const minLevel = SEVERITY_LEVELS[this.settings.minSeverityAlert];

        // Mise à jour du statut
        this.scanStatus = {
            running: false,
            lastScanAt: new Date().toISOString(),
            scannedCount: scanResults.length,
            lastResults: scanResults.map(r => ({
                image: r.image,
                stack: r.stack,
                maxSeverity: r.maxSeverity,
                counts: r.counts,
                error: r.error,
            })),
            lastFullResults: scanResults.map(r => ({
                image: r.image,
                stack: r.stack,
                error: r.error,
                vulns: r.results
                    .flatMap(t => t.Vulnerabilities || [])
                    .filter(v => SEVERITY_LEVELS[v.Severity] >= minLevel)
                    .sort((a, b) => SEVERITY_LEVELS[b.Severity] - SEVERITY_LEVELS[a.Severity])
                    .filter((v, i, arr) => arr.findIndex(x => x.VulnerabilityID === v.VulnerabilityID) === i)
                    .map(v => ({
                        id:        v.VulnerabilityID,
                        pkg:       v.PkgName,
                        installed: v.InstalledVersion,
                        fixed:     v.FixedVersion ?? "",
                        severity:  v.Severity,
                        url:       v.PrimaryURL ?? `https://nvd.nist.gov/vuln/detail/${v.VulnerabilityID}`,
                        title:     v.Title ?? "",
                    })),
            })),
        };

        await this.saveStatus();
        return scanResults;
    }

    private buildTrivyCommand(image: string): string {
        const args = [
            "docker run --rm",
            "-v /var/run/docker.sock:/var/run/docker.sock",
            "ghcr.io/aquasecurity/trivy:latest image",
            "--format json",
            "--quiet",
        ];

        if (this.settings.ignoreUnfixed) {
            args.push("--ignore-unfixed");
        }

        args.push(shellQuote(image));
        return args.join(" ");
    }

    private async scanImage(image: string, stack: string): Promise<ScanResult> {
        const result: ScanResult = {
            image,
            stack,
            results: [],
            counts: { UNKNOWN: 0, LOW: 0, MEDIUM: 0, HIGH: 0, CRITICAL: 0 },
            maxSeverity: "UNKNOWN",
        };

        try {
            console.log(`[TrivyScanner] Scan de ${image}...`);
            const command = this.buildTrivyCommand(image);
            const { stdout } = await execAsync(command, {
                maxBuffer: 50 * 1024 * 1024,
                timeout: sanitizeTimeoutMinutes(this.settings.scanTimeoutMinutes) * 60 * 1000,
            });

            if (!stdout.trim()) return result;

            const parsed = JSON.parse(stdout);
            result.results = parsed.Results || [];

            // Compte les vulnérabilités par sévérité
            for (const r of result.results) {
                for (const vuln of r.Vulnerabilities || []) {
                    const sev = (vuln.Severity as Severity) || "UNKNOWN";
                    result.counts[sev] = (result.counts[sev] || 0) + 1;

                    if (SEVERITY_LEVELS[sev] > SEVERITY_LEVELS[result.maxSeverity]) {
                        result.maxSeverity = sev;
                    }
                }
            }
        } catch (e: unknown) {
            result.error = e instanceof Error ? e.message : String(e);
            console.error(`[TrivyScanner] Erreur scan ${image}:`, result.error);
        }

        return result;
    }

    private async getAllRunningImages(): Promise<Array<{ image: string; stack: string }>> {
        try {
            // Inclut l'ID du conteneur pour résoudre les images sans tag
            const { stdout } = await execAsync(
                `docker ps --format '{{.ID}}|{{.Image}}|{{.Label "com.docker.compose.project"}}'`
            );
            const entries = stdout
                .trim()
                .split("\n")
                .filter(Boolean)
                .map(line => {
                    const [id, image, stack] = line.split("|");
                    return { id: id.trim(), image: image.trim(), stack: (stack || "unknown").trim() };
                });

            // Résout les hashes vers le nom d'origine via le config du conteneur.
            // Cas typique : docker compose pull a mis à jour 'latest', l'ancien conteneur
            // tourne encore sur l'image dé-taguée → {{.Image}} retourne un hash court.
            const resolved = await Promise.all(entries.map(async e => {
                if (/^[a-f0-9]{6,64}$/.test(e.image)) {
                    try {
                        const { stdout: name } = await execAsync(
                            `docker inspect ${shellQuote(e.id)} --format '{{.Config.Image}}'`
                        );
                        const resolved = name.trim();
                        if (resolved) return { image: resolved, stack: e.stack };
                    } catch { /* garde le hash */ }
                }
                return { image: e.image, stack: e.stack };
            }));

            // Déduplique (même image + même stack) et exclut dockge-enhanced lui-même
            const seen = new Set<string>();
            return resolved.filter(e => {
                if (e.image.includes("dockge-enhanced")) return false;
                const key = `${e.image}|${e.stack}`;
                if (seen.has(key)) return false;
                seen.add(key);
                return true;
            });
        } catch {
            return [];
        }
    }

    /** Charge la config Apprise depuis les settings du watcher images (config globale) */
    private async loadAppriseNotifier(): Promise<AppriseNotifier | null> {
        try {
            const fsp  = await import("fs/promises");
            const raw  = await fsp.readFile(WATCHER_SETTINGS_PATH, "utf8");
            const data = JSON.parse(raw) as Record<string, unknown>;
            const serverUrl = typeof data.appriseServerUrl === "string" ? data.appriseServerUrl : "";
            const urls = Array.isArray(data.appriseUrls) ? data.appriseUrls as string[] : [];
            if (!serverUrl) return null;
            return new AppriseNotifier(serverUrl, urls);
        } catch {
            return null;
        }
    }

    private async sendDiscordNotifications(scanResults: ScanResult[]): Promise<void> {
        const appriseNotifier = await this.loadAppriseNotifier();
        if (this.settings.discordWebhooks.length === 0 && !appriseNotifier) return;

        const minLevel = SEVERITY_LEVELS[this.settings.minSeverityAlert];

        // Filtre les résultats qui dépassent le seuil d'alerte
        const alertResults = scanResults.filter(
            r => SEVERITY_LEVELS[r.maxSeverity] >= minLevel
        );

        if (alertResults.length === 0) {
            console.log("[TrivyScanner] Aucune vulnérabilité au-dessus du seuil, pas de notification.");
            return;
        }

        const discordNotifier = this.settings.discordWebhooks.length > 0
            ? new DiscordNotifier(this.settings.discordWebhooks)
            : null;

        // Envoie une notification par image (pour ne pas dépasser les limites Discord)
        for (const result of alertResults) {
            await this.sendImageAlert(discordNotifier, appriseNotifier, result);
            // Petite pause pour éviter le rate-limiting Discord
            await new Promise(res => setTimeout(res, 500));
        }

        // Message récapitulatif global
        await this.sendSummary(discordNotifier, appriseNotifier, scanResults);
    }

    private async sendImageAlert(discord: DiscordNotifier | null, apprise: AppriseNotifier | null, result: ScanResult): Promise<void> {
        const en     = (this.settings.notificationLang ?? "fr") === "en";
        const locale = en ? "en-GB" : "fr-FR";
        const t      = (fr: string, enStr: string) => en ? enStr : fr;
        const hostname: string = await Settings.get("primaryHostname") || "";
        const hostnamePrefix   = hostname ? `[${hostname}] ` : "";
        const footerHost       = hostname ? ` · ${hostname}` : "";

        const fields = [];
        const minLevel = SEVERITY_LEVELS[this.settings.minSeverityAlert];
        const ignoredSet = new Set(this.settings.ignoredCVEs ?? []);

        // Recompute counts excluding ignored CVEs
        const filteredCounts: Record<Severity, number> = { UNKNOWN: 0, LOW: 0, MEDIUM: 0, HIGH: 0, CRITICAL: 0 };
        for (const scanTarget of result.results) {
            for (const v of scanTarget.Vulnerabilities ?? []) {
                if (!ignoredSet.has(v.VulnerabilityID) && SEVERITY_LEVELS[v.Severity] >= minLevel) {
                    filteredCounts[v.Severity] = (filteredCounts[v.Severity] || 0) + 1;
                }
            }
        }

        const countLines = (Object.entries(filteredCounts) as [Severity, number][])
            .filter(([sev, count]) => count > 0 && SEVERITY_LEVELS[sev as Severity] >= minLevel)
            .map(([sev, count]) => `${SEVERITY_EMOJI[sev as Severity]} ${sev}: **${count}**`)
            .join("\n");

        if (countLines) {
            fields.push({ name: t("Résumé", "Summary"), value: countLines, inline: true });
        }

        const allVulns: Vulnerability[] = result.results.flatMap(r => r.Vulnerabilities || []);
        const topVulns = allVulns
            .filter(v => SEVERITY_LEVELS[v.Severity] >= SEVERITY_LEVELS[this.settings.minSeverityAlert])
            .filter(v => !ignoredSet.has(v.VulnerabilityID))
            .sort((a, b) => SEVERITY_LEVELS[b.Severity] - SEVERITY_LEVELS[a.Severity])
            .filter((v, i, arr) => arr.findIndex(x => x.VulnerabilityID === v.VulnerabilityID) === i)
            .slice(0, 5);

        if (topVulns.length > 0) {
            const vulnLines = topVulns.map(v => {
                const fix = v.FixedVersion
                    ? `→ fix: ${v.FixedVersion}`
                    : t("→ pas de fix", "→ no fix");
                const url = v.PrimaryURL ?? `https://nvd.nist.gov/vuln/detail/${v.VulnerabilityID}`;
                return `${SEVERITY_EMOJI[v.Severity]} [${v.VulnerabilityID}](${url}) **${v.PkgName}** ${v.InstalledVersion} ${fix}`;
            }).join("\n");
            fields.push({ name: t("Top vulnérabilités", "Top vulnerabilities"), value: vulnLines, inline: false });
        }

        const uiUrl = this.baseUrl || null;
        const title = `${hostnamePrefix}${SEVERITY_EMOJI[result.maxSeverity]} ${t("Alerte sécurité", "Security alert")} — ${result.image}`;
        const description =
            `${t("Stack", "Stack")} : **${result.stack}**\n${t("Sévérité max", "Max severity")} : **${result.maxSeverity}**` +
            (uiUrl ? `\n\n[${t("Ouvrir Dockge", "Open Dockge")}](${uiUrl})` : "");

        if (discord) {
            await discord.sendEmbed({
                title,
                color: SEVERITY_COLORS[result.maxSeverity],
                url:   uiUrl ?? undefined,
                description,
                fields,
                footer: `Dockge Enhanced — Trivy Scanner${footerHost} • ${new Date().toLocaleString(locale)}`,
            });
        }

        if (apprise) {
            const vulnBody = fields.map(f => `**${f.name}**\n${f.value}`).join("\n\n");
            await apprise.send({
                title,
                body:  `${description}\n\n${vulnBody}`.trim(),
                type:  result.maxSeverity === "CRITICAL" ? "failure" : "warning",
            });
        }
    }

    private async sendSummary(discord: DiscordNotifier | null, apprise: AppriseNotifier | null, results: ScanResult[]): Promise<void> {
        const en     = (this.settings.notificationLang ?? "fr") === "en";
        const locale = en ? "en-GB" : "fr-FR";
        const t      = (fr: string, enStr: string) => en ? enStr : fr;
        const hostname: string = await Settings.get("primaryHostname") || "";
        const hostnamePrefix   = hostname ? `[${hostname}] ` : "";
        const footerHost       = hostname ? ` · ${hostname}` : "";

        const minLevel = SEVERITY_LEVELS[this.settings.minSeverityAlert];
        const ignoredSet = new Set(this.settings.ignoredCVEs ?? []);

        const totalCounts: Record<Severity, number> = {
            UNKNOWN: 0, LOW: 0, MEDIUM: 0, HIGH: 0, CRITICAL: 0
        };

        // Recompute counts excluding ignored CVEs
        for (const r of results) {
            for (const scanTarget of r.results) {
                for (const v of scanTarget.Vulnerabilities ?? []) {
                    if (!ignoredSet.has(v.VulnerabilityID) && SEVERITY_LEVELS[v.Severity] >= minLevel) {
                        totalCounts[v.Severity] = (totalCounts[v.Severity] || 0) + 1;
                    }
                }
            }
        }

        const summaryLines = (Object.entries(totalCounts) as [Severity, number][])
            .filter(([, count]) => count > 0)
            .map(([sev, count]) => `${SEVERITY_EMOJI[sev as Severity]} ${sev}: **${count}**`)
            .join(" | ");

        const hasCritical = totalCounts.CRITICAL > 0 || totalCounts.HIGH > 0;
        const uiUrl = this.baseUrl || null;
        const imagesValue = results.map(r => {
            const header = `${SEVERITY_EMOJI[r.maxSeverity]} \`${r.image}\` (${r.stack})`;
            if (r.error) return `${header}\n  ${t("⚠️ Erreur de scan", "⚠️ Scan error")}`;

            const topVulns = r.results
                .flatMap(res => res.Vulnerabilities || [])
                .filter(v => SEVERITY_LEVELS[v.Severity] >= minLevel)
                .filter(v => !ignoredSet.has(v.VulnerabilityID))
                .sort((a, b) => SEVERITY_LEVELS[b.Severity] - SEVERITY_LEVELS[a.Severity])
                .slice(0, 2);

            if (topVulns.length === 0) return header;

            const vulnLine = topVulns
                .map(v => `${SEVERITY_EMOJI[v.Severity]} \`${v.VulnerabilityID}\` ${v.PkgName}`)
                .join("  |  ");
            return `${header}\n  ${vulnLine}`;
        }).join("\n");

        const title = hasCritical
            ? `${hostnamePrefix}🚨 ${t("Rapport de sécurité — Vulnérabilités détectées", "Security report — Vulnerabilities detected")}`
            : `${hostnamePrefix}✅ ${t(`Rapport de sécurité — ${results.length} image(s) scannée(s)`, `Security report — ${results.length} image(s) scanned`)}`;
        const description =
            (summaryLines || t("Aucune vulnérabilité significative détectée.", "No significant vulnerabilities detected.")) +
            (uiUrl ? `\n\n[${t("Ouvrir Dockge", "Open Dockge")}](${uiUrl})` : "");

        if (discord) {
            await discord.sendEmbed({
                title,
                color: hasCritical ? 0xef4444 : 0x22c55e,
                url:   uiUrl ?? undefined,
                description,
                fields: [
                    {
                        name: t("Images scannées", "Scanned images"),
                        value: imagesValue,
                        inline: false,
                    }
                ],
                footer: `Dockge Enhanced — Trivy Scanner${footerHost} • ${new Date().toLocaleString(locale)}`,
            });
        }

        if (apprise) {
            await apprise.send({
                title,
                body:  `${description}\n\n**${t("Images scannées", "Scanned images")}**\n${imagesValue}`.trim(),
                type:  hasCritical ? "failure" : "success",
            });
        }
    }

    /** Ajoute un CVE ID à la liste d'ignorés globaux (notifications + affichage frontend). */
    async ignoreCVE(cveId: string): Promise<void> {
        const list = this.settings.ignoredCVEs ?? [];
        if (!list.includes(cveId)) {
            this.settings.ignoredCVEs = [...list, cveId];
            const fs = await import("fs/promises");
            await fs.mkdir(DATA_DIR, { recursive: true });
            await fs.writeFile(SETTINGS_PATH, JSON.stringify(this.settings, null, 2));
        }
    }

    /** Retire un CVE ID de la liste d'ignorés. */
    async clearIgnoredCVE(cveId: string): Promise<void> {
        this.settings.ignoredCVEs = (this.settings.ignoredCVEs ?? []).filter(id => id !== cveId);
        const fs = await import("fs/promises");
        await fs.mkdir(DATA_DIR, { recursive: true });
        await fs.writeFile(SETTINGS_PATH, JSON.stringify(this.settings, null, 2));
    }
}
