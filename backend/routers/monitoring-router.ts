/**
 * MonitoringRouter — API pour l'onglet Monitoring.
 * Routes : settings, overview, crash events, stacks list.
 */

import { DockgeServer } from "../dockge-server";
import { Router } from "../router";
import express, { Express, Request, Response, NextFunction } from "express";
import { MonitoringWatcher, MonitoringSettings } from "../watchers/monitoring-watcher";
import { BackupManager } from "../watchers/backup-manager";
import { TrivyScanner } from "../watchers/trivy-scanner";
import { imageStatusStore } from "../watchers/image-watcher";
import { Settings } from "../settings";
import { requireHttpAuth } from "../auth";
import { historyStartDate, MonitoringHistoryCollector, MonitoringHistoryRange } from "../monitoring-history";

export function parseMonitoringHistoryRange(query: Request["query"], now = new Date()): MonitoringHistoryRange {
    const preset = typeof query.preset === "string" ? query.preset : undefined;
    let amount: number;
    let unit: MonitoringHistoryRange["unit"];
    if (preset) {
        const presets: Record<string, [number, MonitoringHistoryRange["unit"]]> = {
            "24h": [ 1, "days" ],
            "7d": [ 7, "days" ],
            "1m": [ 1, "months" ],
        };
        const selected = presets[preset];
        if (!selected) {
            throw new Error("preset invalide");
        }
        [ amount, unit ] = selected;
    } else {
        const rawAmount = typeof query.amount === "string" ? query.amount : "";
        const rawUnit = typeof query.unit === "string" ? query.unit : "";
        if (!/^[1-9]\d*$/.test(rawAmount) || ![ "days", "weeks", "months", "years" ].includes(rawUnit)) {
            throw new Error("amount et unit sont requis");
        }
        amount = Number(rawAmount);
        unit = rawUnit as MonitoringHistoryRange["unit"];
        const maximums: Record<MonitoringHistoryRange["unit"], number> = {
            days: 3650,
            weeks: 520,
            months: 120,
            years: 10,
        };
        if (!Number.isSafeInteger(amount) || amount > maximums[unit]) {
            throw new Error("plage historique trop grande");
        }
    }
    return {
        amount,
        unit,
        from: historyStartDate(amount, unit, now),
        to: new Date(now),
    };
}

// ─── Router ───────────────────────────────────────────────────────

export class MonitoringRouter extends Router {
    create(_app: Express, server: DockgeServer): express.Router {
        const router = express.Router();
        MonitoringWatcher.getInstance().setServer(server);
        router.use(express.json());

        // Auth middleware on all routes — uses server.jwtSecret like WatcherRouter
        router.use("/monitoring", (req: Request, res: Response, next: NextFunction) => {
            requireHttpAuth(req, res, next, server.jwtSecret).catch(next);
        });

        // ── Settings ──────────────────────────────────────────────

        router.get("/monitoring/settings", (_req: Request, res: Response) => {
            res.json({
                ok: true,
                data: MonitoringWatcher.getInstance().getSettingsSafe(),
            });
        });

        router.post("/monitoring/settings", async (req: Request, res: Response) => {
            try {
                const partial = req.body as Partial<MonitoringSettings>;
                if (partial.historyEnabled !== undefined && typeof partial.historyEnabled !== "boolean") {
                    res.status(400).json({
                        ok: false,
                        message: "historyEnabled doit être un booléen",
                    });
                    return;
                }
                if (partial.historyPreset !== undefined && ![ "24h", "7d", "1m", "custom" ].includes(partial.historyPreset)) {
                    res.status(400).json({
                        ok: false,
                        message: "historyPreset invalide",
                    });
                    return;
                }
                if (partial.historyUnit !== undefined && ![ "days", "weeks", "months", "years" ].includes(partial.historyUnit)) {
                    res.status(400).json({
                        ok: false,
                        message: "historyUnit invalide",
                    });
                    return;
                }
                if (partial.historyAmount !== undefined) {
                    const amount = Number(partial.historyAmount);
                    const unit = partial.historyUnit ?? MonitoringWatcher.getInstance().getSettingsSafe().historyUnit;
                    const maximums: Record<NonNullable<MonitoringSettings["historyUnit"]>, number> = {
                        days: 3650,
                        weeks: 520,
                        months: 120,
                        years: 10,
                    };
                    if (!Number.isSafeInteger(amount) || amount < 1 || amount > maximums[unit]) {
                        res.status(400).json({
                            ok: false,
                            message: "historyAmount invalide",
                        });
                        return;
                    }
                }
                await MonitoringWatcher.getInstance().saveSettings(partial);
                res.json({
                    ok: true,
                });
            } catch (e) {
                res.status(500).json({
                    ok: false,
                    message: String(e),
                });
            }
        });

        router.get("/monitoring/history", async (req: Request, res: Response) => {
            try {
                const range = parseMonitoringHistoryRange(req.query);
                res.json({
                    ok: true,
                    data: await MonitoringHistoryCollector.getInstance().read(range),
                });
            } catch (error) {
                res.status(400).json({
                    ok: false,
                    message: error instanceof Error ? error.message : String(error),
                });
            }
        });

        router.delete("/monitoring/history", async (_req: Request, res: Response) => {
            try {
                await MonitoringHistoryCollector.getInstance().clear();
                res.json({
                    ok: true,
                });
            } catch (error) {
                res.status(500).json({
                    ok: false,
                    message: error instanceof Error ? error.message : String(error),
                });
            }
        });

        // ── Display settings (disk partitions / navbar render mode) ───

        router.post("/monitoring/display-settings", async (req: Request, res: Response) => {
            try {
                const { diskPartitions, diskDisplayMode, hostNavbarDisplay, stackStatsEnabled } = req.body as {
                    diskPartitions?: string[];
                    diskDisplayMode?: string;
                    hostNavbarDisplay?: Record<string, unknown>;
                    stackStatsEnabled?: boolean;
                };
                if (Array.isArray(diskPartitions)) {
                    await Settings.set("diskPartitions", JSON.stringify(diskPartitions));
                }
                if (diskDisplayMode === "compact" || diskDisplayMode === "bar") {
                    await Settings.set("diskDisplayMode", diskDisplayMode);
                }
                if (typeof stackStatsEnabled === "boolean") {
                    await Settings.set("stackStatsEnabled", stackStatsEnabled, "general");
                }
                if (hostNavbarDisplay && typeof hostNavbarDisplay === "object") {
                    await Settings.set("hostNavbarDisplay", JSON.stringify({
                        cpuModel: Boolean(hostNavbarDisplay.cpuModel),
                        perCoreCpu: Boolean(hostNavbarDisplay.perCoreCpu),
                        uptime: Boolean(hostNavbarDisplay.uptime),
                        cpuTemperatures: Boolean(hostNavbarDisplay.cpuTemperatures),
                        diskTemperatures: Boolean(hostNavbarDisplay.diskTemperatures),
                        navbarPosition: hostNavbarDisplay.navbarPosition === "top" ? "top" : "bottom",
                    }));
                }
                res.json({ ok: true });
            } catch (e) {
                res.status(500).json({ ok: false, message: String(e) });
            }
        });

        router.get("/monitoring/display-settings", async (_req: Request, res: Response) => {
            let diskPartitions: string[] = [];
            const rawArr = await Settings.get("diskPartitions");
            if (rawArr) {
                try { diskPartitions = JSON.parse(rawArr) as string[]; } catch { /* ignore */ }
            }
            // Migrate old single-partition setting
            if (diskPartitions.length === 0) {
                const single = await Settings.get("diskPartition");
                diskPartitions = [single || "/"];
            }
            const rawDisplayMode = await Settings.get("diskDisplayMode");
            const diskDisplayMode = rawDisplayMode === "bar" ? "bar" : "compact";
            const stackStatsEnabled = (await Settings.get("stackStatsEnabled")) === true;
            const hostNavbarDisplay = {
                cpuModel: false,
                perCoreCpu: false,
                uptime: false,
                cpuTemperatures: false,
                diskTemperatures: false,
                navbarPosition: "bottom",
            };
            const rawHostNavbar = await Settings.get("hostNavbarDisplay");
            if (rawHostNavbar) {
                try {
                    Object.assign(hostNavbarDisplay, JSON.parse(rawHostNavbar));
                } catch { /* ignore */ }
            }
            res.json({ ok: true, data: { diskPartitions, diskDisplayMode, hostNavbarDisplay, stackStatsEnabled } });
        });

        // ── Overview (dashboard cards) ────────────────────────────

        router.get("/monitoring/overview", async (_req: Request, res: Response) => {
            // Backup
            const history    = BackupManager.getInstance().getHistory();
            const lastBackup = history[0] ?? null;
            const ageMinutes = lastBackup
                ? Math.floor((Date.now() - new Date(lastBackup.timestamp).getTime()) / 60_000)
                : null;

            // Images with pending updates
            const allStatuses    = [...imageStatusStore.values()];
            const pendingImages  = allStatuses.filter(s => s.hasUpdate);

            // Trivy
            const trivyScanner   = TrivyScanner.getInstance();
            const trivyStatus    = trivyScanner.getStatus();
            const trivySettings  = trivyScanner.settings;
            const criticalImages = (trivyStatus.lastResults ?? [])
                .filter((r: { maxSeverity?: string }) =>
                    r.maxSeverity === "CRITICAL" || r.maxSeverity === "HIGH",
                );

            // nextScanAt: same formula as WatcherSettings.vue (lastScanAt + intervalHours)
            const nextScanAt = (trivySettings.enabled && trivyStatus.lastScanAt)
                ? new Date(new Date(trivyStatus.lastScanAt).getTime() + trivySettings.intervalHours * 3_600_000).toISOString()
                : null;

            // Crash and health events
            const crashes = MonitoringWatcher.getInstance().getRecentCrashEvents().slice(0, 10);
            const health = MonitoringWatcher.getInstance().getRecentHealthEvents().slice(0, 10);

            res.json({
                ok: true,
                data: {
                    backup: {
                        lastTimestamp: lastBackup?.timestamp ?? null,
                        ageMinutes,
                        success: lastBackup?.success ?? null,
                    },
                    images: {
                        pendingCount:  pendingImages.length,
                        pendingImages: pendingImages.map((s: { image: string; stack: string }) => ({
                            image: s.image,
                            stack: s.stack,
                        })),
                    },
                    trivy: {
                        criticalCount:  criticalImages.length,
                        criticalImages: criticalImages.map((r: { image: string; stack: string; maxSeverity: string }) => ({
                            image: r.image,
                            stack: r.stack,
                            maxSeverity: r.maxSeverity,
                        })),
                        lastScanAt: trivyStatus.lastScanAt ?? null,
                        nextScanAt,
                    },
                    crashes,
                    health,
                },
            });
        });

        // ── Recent crash events ───────────────────────────────────

        router.get("/monitoring/crash-events", (_req: Request, res: Response) => {
            res.json({ ok: true, data: MonitoringWatcher.getInstance().getRecentCrashEvents() });
        });

        // Effacer la liste des crash events (en mémoire)
        router.delete("/monitoring/crash-events", (_req: Request, res: Response) => {
            MonitoringWatcher.getInstance().clearCrashEvents();
            res.json({ ok: true });
        });

        router.get("/monitoring/health-events", (_req: Request, res: Response) => {
            res.json({ ok: true, data: MonitoringWatcher.getInstance().getRecentHealthEvents() });
        });

        router.delete("/monitoring/health-events", (_req: Request, res: Response) => {
            MonitoringWatcher.getInstance().clearHealthEvents();
            res.json({ ok: true });
        });

        // ── Crash exclusions ──────────────────────────────────────

        router.get("/monitoring/crash-exclusions", async (_req: Request, res: Response) => {
            try {
                const data = await MonitoringWatcher.getInstance().getExclusions();
                res.json({ ok: true, data });
            } catch (e) {
                res.status(500).json({ ok: false, message: String(e) });
            }
        });

        // Ajouter / mettre à jour une exclusion
        // body: { containerName: string, durationHours: number | null }
        router.post("/monitoring/crash-exclusions", async (req: Request, res: Response) => {
            try {
                const { containerName, durationHours } = req.body as {
                    containerName: string;
                    durationHours: number | null;
                };
                if (!containerName) {
                    res.status(400).json({ ok: false, message: "containerName requis" });
                    return;
                }
                await MonitoringWatcher.getInstance().addExclusion(containerName, durationHours ?? null);
                res.json({ ok: true });
            } catch (e) {
                res.status(500).json({ ok: false, message: String(e) });
            }
        });

        // Supprimer une exclusion spécifique
        router.delete("/monitoring/crash-exclusions/:containerName", async (req: Request, res: Response) => {
            try {
                await MonitoringWatcher.getInstance().removeExclusion(req.params.containerName);
                res.json({ ok: true });
            } catch (e) {
                res.status(500).json({ ok: false, message: String(e) });
            }
        });

        // Supprimer toutes les exclusions
        router.delete("/monitoring/crash-exclusions", async (_req: Request, res: Response) => {
            try {
                await MonitoringWatcher.getInstance().clearExclusions();
                res.json({ ok: true });
            } catch (e) {
                res.status(500).json({ ok: false, message: String(e) });
            }
        });

        // Mount under /api: final paths: /api/monitoring/*
        const mountRouter = express.Router();
        mountRouter.use("/api", router);
        return mountRouter;
    }
}
