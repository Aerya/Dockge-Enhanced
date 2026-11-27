import { packageChanges } from "./history";
import { AuditLogger } from "../audit-log";
import { DEFAULT_HOST_EVENTS, HOST_EVENTS, notifyDetection, operationNotification, sendHostNotification, type HostNotificationEvents } from "./notifications";
import { EMPTY_OPERATIONS, hostOperationStatus, type HostOperationEvent } from "./operations";
import { scanHost, type HostSecurity } from "./security";
import { hubOnly } from "../hub-mode";
import { R } from "redbean-node";
import { Settings } from "../settings";
import { inventoryHash, parseReport, readReport, reportState, type HostReport } from "./report";

export interface HostSettings {
    enabled: boolean;
    staleHours: number;
    retentionDays: number;
    cveEnabled: boolean;
    notifications: boolean;
    notificationEvents: HostNotificationEvents;
    notificationSeverity: string;
}
export const HOST_DEFAULTS: HostSettings = { enabled: false,
    staleHours: 12,
    retentionDays: 90,
    cveEnabled: false,
    notifications: false,
    notificationEvents: { ...DEFAULT_HOST_EVENTS },
    notificationSeverity: "HIGH" };
export function hostSettings(value: unknown): HostSettings {
    const s = value as HostSettings;
    if (!s || typeof s.enabled !== "boolean" || typeof s.cveEnabled !== "boolean" || typeof s.notifications !== "boolean" ||
        !Number.isInteger(s.staleHours) || s.staleHours < 6 || s.staleHours > 168 ||
        !Number.isInteger(s.retentionDays) || s.retentionDays < 1 || s.retentionDays > 365) {
        throw new Error("hosts.invalidSettings");
    }
    const notificationEvents = s.notificationEvents ?? DEFAULT_HOST_EVENTS;
    if (!notificationEvents || HOST_EVENTS.some(k => typeof notificationEvents[k] !== "boolean") ||
        ![ "LOW", "MEDIUM", "HIGH", "CRITICAL" ].includes(s.notificationSeverity ?? "HIGH")) {
        throw new Error("hosts.invalidSettings");
    }
    return { enabled: s.enabled,
        staleHours: s.staleHours,
        retentionDays: s.retentionDays,
        cveEnabled: s.cveEnabled,
        notifications: s.notifications,
        notificationEvents: Object.fromEntries(HOST_EVENTS.map(k => [ k, notificationEvents[k] ])) as HostNotificationEvents,
        notificationSeverity: s.notificationSeverity ?? "HIGH" };
}
export class HostManager {
    static instance = new HostManager();
    private running: Promise<void> | null = null;
    private report: HostReport | null = null;
    private failed = false;
    private lastRead = 0;
    private security: HostSecurity = { state: "unavailable",
        findings: [] };

    private scanning = false;
    private lastScan = 0;
    private operationRead = 0;
    private timer: NodeJS.Timeout | null = null;
    start() {
        if (this.timer) {
            return;
        }
        this.timer = setInterval(() => {
            void this.refresh().then(() => this.pollOperations()).catch(() => {});
        }, 15000);
        this.timer.unref();
    }

    async settings(): Promise<HostSettings> {
        return { ...HOST_DEFAULTS,
            ...await Settings.get("hostManagement") };
    }

    async save(value: unknown) {
        const config = hostSettings(value);
        if (!config.enabled && this.report) {
            const operations = await hostOperationStatus(this.report.hostId);
            if (operations.schedule?.enabled || operations.result?.state === "running") {
                throw new Error("hosts.scheduleActive");
            }
        }
        await Settings.set("hostManagement", config);
        if (!config.enabled) {
            this.report = null;
        }
        this.lastRead = 0;
        return config;
    }

    async refresh() {
        if (this.running) {
            return this.running;
        }
        this.running = this.collect().finally(() => {
            this.running = null;
        });
        return this.running;
    }

    private async collect() {
        const settings = await this.settings();
        if (!settings.enabled) {
            this.report = null;
            return;
        }
        if (Date.now() - this.lastRead < 60000) {
            return;
        }
        this.lastRead = Date.now();
        try {
            const report = await readReport(process.env.DOCKGE_HOST_REPORT_DIR || "/host-reports");
            const fingerprint = inventoryHash(report);
            const timestamp = Date.parse(report.collectedAt);
            const previous = await R.getRow("SELECT collected_at FROM host_history ORDER BY collected_at DESC LIMIT 1");
            if (previous && Number(previous.collected_at) > timestamp) {
                throw new Error("hosts.invalidReport");
            }
            const summary = JSON.stringify({ host: report.host,
                kernel: report.kernel,
                reboot: report.reboot,
                packages: report.packages.length,
                updates: report.packages.filter(p => p.available).length });
            await R.exec("INSERT INTO host_inventory (fingerprint, report, last_seen) VALUES (?, ?, ?) ON CONFLICT(fingerprint) DO UPDATE SET last_seen = excluded.last_seen",
                [ fingerprint, JSON.stringify(report), timestamp ]);
            await R.exec("INSERT OR IGNORE INTO host_history (collected_at, fingerprint, summary) VALUES (?, ?, ?)", [ timestamp, fingerprint, summary ]);
            const cutoff = Date.now() - settings.retentionDays * 86400000;
            await R.exec("DELETE FROM host_history WHERE collected_at < ?", [ cutoff ]);
            await R.exec("DELETE FROM host_inventory WHERE last_seen < ? AND fingerprint NOT IN (SELECT fingerprint FROM host_history)", [ cutoff ]);
            this.report = report;
            this.failed = false;
            if (settings.cveEnabled && !hubOnly() && !this.scanning && reportState(report, settings.staleHours) === "fresh" &&
                (this.security.fingerprint !== fingerprint || Date.now() - this.lastScan > 24 * 3600000) && Date.now() - this.lastScan > 3600000) {
                this.scanning = true;
                this.lastScan = Date.now();
                void scanHost(report).then(result => {
                    this.security = result;
                }).catch(() => {
                    this.security = { ...this.security,
                        state: "unavailable" };
                }).finally(() => {
                    this.scanning = false;
                });
            }
        } catch {
            this.failed = true;
        }
        if (settings.notifications) {
            const host = this.report?.host ?? "";
            const severity = [ "LOW", "MEDIUM", "HIGH", "CRITICAL" ];
            const findings = settings.cveEnabled && this.security.fingerprint === (this.report ? inventoryHash(this.report) : "") ? this.security.findings : [];
            const detections = {
                updates: this.report?.packages.filter(p => p.available).map(p => `${p.name}: ${p.version} → ${p.available}`) ?? [],
                security: findings.filter(v => severity.indexOf(v.severity) >= severity.indexOf(settings.notificationSeverity)).map(v => `${v.id} · ${v.pkg} · ${v.severity}`),
                fix: findings.filter(v => v.fix === "available").map(v => `${v.id} · ${v.pkg} → ${v.fixed}`),
                reboot: this.report?.reboot === "required" ? [ "reboot-required" ] : [],
                collector: this.failed || reportState(this.report, settings.staleHours) !== "fresh" ? [ this.failed ? "unavailable" : reportState(this.report, settings.staleHours) ] : [],
                securityData: settings.cveEnabled && (this.security.state === "unavailable" || Date.now() - Date.parse(this.security.scannedAt || "1970-01-01") > 48 * 3600000) ? [ "unavailable-or-stale" ] : [],
            };
            for (const kind of [ "updates", "security", "fix", "reboot", "collector", "securityData" ] as const) {
                if (settings.notificationEvents[kind]) {
                    await notifyDetection(kind, host, detections[kind]).catch(() => {});
                }
            }
        }
    }

    async pollOperations() {
        if (Date.now() - this.operationRead < 10000) {
            return;
        }
        this.operationRead = Date.now();
        const settings = await this.settings();
        if (!settings.enabled || !this.report) {
            return;
        }
        const operations = await hostOperationStatus(this.report.hostId).catch(() => ({ ...EMPTY_OPERATIONS }));
        for (const event of operations.events) {
            const key = `${event.hostId}:${event.id}:${event.state}`;
            await R.exec("INSERT OR IGNORE INTO host_operations (event_key, at, event, notified, audited) VALUES (?, ?, ?, 0, 0)", [ key, Math.floor(event.at * 1000), JSON.stringify(event) ]);
        }
        const rows = await R.getAll("SELECT * FROM host_operations WHERE notified = 0 OR audited = 0 ORDER BY at ASC LIMIT 20");
        for (const row of rows) {
            const event = JSON.parse(row.event) as HostOperationEvent;
            if (!row.audited) {
                await AuditLogger.getInstance().log({ action: `hosts.operation.${event.state}`,
                    category: "host",
                    target: event.id,
                    status: event.state === "failed" ? "failure" : "success" });
                await R.exec("UPDATE host_operations SET audited = 1 WHERE event_key = ?", [ row.event_key ]);
            }
            const kind = operationNotification(event);
            if (!row.notified && (!kind || !settings.notifications || !settings.notificationEvents[kind] ||
                await sendHostNotification(kind, this.report.host, "", event).catch(() => false))) {
                await R.exec("UPDATE host_operations SET notified = 1 WHERE event_key = ?", [ row.event_key ]);
            }
        }
        await R.exec("DELETE FROM host_operations WHERE at < ?", [ Date.now() - settings.retentionDays * 86400000 ]);
    }

    async snapshot() {
        await this.refresh();
        const settings = await this.settings();
        const report = settings.enabled ? this.report : null;
        await this.pollOperations();
        const operations = settings.enabled ? await hostOperationStatus(report?.hostId).catch(() => ({ ...EMPTY_OPERATIONS })) : { ...EMPTY_OPERATIONS };
        return { protocol: 1,
            settings,
            report: report ? { ...report,
                packages: report.packages.slice(0, 500),
                packageCount: report.packages.length,
                kernelPackages: report.packages.filter(p => /^(linux-image-|linux(?:-lts|-zen|-hardened)?$)/.test(p.name)).map(p => `${p.name}: ${p.version}`).slice(0, 100),
                updateCount: report.packages.filter(p => p.available).length } : null,
            state: !settings.enabled ? "disabled" : this.failed ? "unavailable" : reportState(report, settings.staleHours),
            collectorFailed: settings.enabled && this.failed,
            operations,
            operationHistory: settings.enabled ? (await R.getAll("SELECT event FROM host_operations ORDER BY at DESC LIMIT 100")).map(r => JSON.parse(r.event)) : [],
            modes: [ "disabled", "monitor" ],
            security: !settings.cveEnabled || !report || this.security.fingerprint !== inventoryHash(report) ? { state: "unavailable",
                findings: [] } : {
                ...this.security,
                findings: [ ...this.security.findings ].sort((a, b) => [ "CRITICAL", "HIGH", "MEDIUM", "LOW", "UNKNOWN" ].indexOf(a.severity) - [ "CRITICAL", "HIGH", "MEDIUM", "LOW", "UNKNOWN" ].indexOf(b.severity)).slice(0, 500),
                totalFindings: this.security.findings.length,
                state: Date.now() - Date.parse(this.security.scannedAt || "") > 48 * 3600000 ? "stale" : this.security.state },
            scanning: this.scanning,
            history: settings.enabled ? await R.getAll("SELECT collected_at, fingerprint, summary FROM host_history ORDER BY collected_at DESC LIMIT 100") : [] };
    }

    async history(value: unknown) {
        const timestamp = (value as { timestamp?: unknown })?.timestamp;
        if (typeof timestamp !== "number" || !Number.isSafeInteger(timestamp) || !(await this.settings()).enabled) {
            throw new Error("hosts.invalidOperation");
        }
        const current = await R.getRow("SELECT report FROM host_inventory WHERE fingerprint = (SELECT fingerprint FROM host_history WHERE collected_at = ?)", [ timestamp ]);
        const previous = await R.getRow("SELECT report FROM host_inventory WHERE fingerprint = (SELECT fingerprint FROM host_history WHERE collected_at < ? ORDER BY collected_at DESC LIMIT 1)", [ timestamp ]);
        if (!current || !previous) {
            return { baseline: false,
                changes: [],
                total: 0 };
        }
        return { baseline: true,
            ...packageChanges(parseReport(JSON.parse(previous.report)).packages, parseReport(JSON.parse(current.report)).packages) };
    }

    async operationAuthority(cancelSchedule = false) {
        await this.refresh();
        const settings = await this.settings();
        if (!settings.enabled || !this.report || this.report.provider !== "apt" || (!cancelSchedule && (this.failed || reportState(this.report, settings.staleHours) !== "fresh"))) {
            throw new Error("hosts.operationsUnavailable");
        }
        return this.report.hostId;
    }

    async packages(value: unknown) {
        const request = value as { search?: unknown;
            updatesOnly?: unknown };
        if (!request || typeof request.search !== "string" || request.search.length > 200 || typeof request.updatesOnly !== "boolean") {
            throw new Error("hosts.invalidOperation");
        }
        if (!(await this.settings()).enabled) {
            return [];
        }
        await this.refresh();
        const query = request.search.toLowerCase();
        return (this.report?.packages || []).filter(p => (!request.updatesOnly || p.available) &&
            `${p.name} ${p.version} ${p.arch} ${p.origin}`.toLowerCase().includes(query))
            .sort((a, b) => a.name.localeCompare(b.name)).slice(0, 500);
    }

    async summary() {
        const s = await this.snapshot();
        const updates = s.report?.updateCount ?? null;
        return { enabled: s.settings.enabled,
            protocol: 1,
            hosts: s.report ? 1 : 0,
            state: s.state,
            count: s.state === "fresh" && ((updates ?? 0) > 0 || s.report?.metadata === "refreshed") ? updates : null,
            updates,
            security: s.security.state === "unavailable" ? null : this.security.findings.filter(v => v.fix === "available").length,
            critical: s.security.state === "unavailable" ? null : this.security.findings.filter(v => v.severity === "CRITICAL").length,
            high: s.security.state === "unavailable" ? null : this.security.findings.filter(v => v.severity === "HIGH").length,
            reboot: s.report?.reboot === "required" ? 1 : null };
    }
}
