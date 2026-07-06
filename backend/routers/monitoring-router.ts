/**
 * MonitoringRouter — API pour l'onglet Monitoring.
 * Routes : settings, overview, crash events, stacks list.
 */

import { DockgeServer } from "../dockge-server";
import { Router } from "../router";
import express, { Express, Request, Response, NextFunction } from "express";
import { MonitoringWatcher, MonitoringSettings, CrashExclusion } from "../watchers/monitoring-watcher";
import { BackupManager } from "../watchers/backup-manager";
import { TrivyScanner } from "../watchers/trivy-scanner";
import { imageStatusStore } from "../watchers/image-watcher";
import { Settings } from "../settings";
import { requireHttpAuth } from "../auth";

// ─── Router ───────────────────────────────────────────────────────

export class MonitoringRouter extends Router {
    create(_app: Express, server: DockgeServer): express.Router {
        const router = express.Router();
        MonitoringWatcher.getInstance().setServer(server);
        router.use(express.json());

        // Auth middleware on all routes — uses server.jwtSecret like WatcherRouter
        router.use((req: Request, res: Response, next: NextFunction) => {
            requireHttpAuth(req, res, next, server.jwtSecret).catch(next);
        });

        // ── Settings ──────────────────────────────────────────────

        router.get("/monitoring/settings", (_req: Request, res: Response) => {
            res.json({ ok: true, data: MonitoringWatcher.getInstance().getSettingsSafe() });
        });

        router.post("/monitoring/settings", async (req: Request, res: Response) => {
            try {
                const partial = req.body as Partial<MonitoringSettings>;
                await MonitoringWatcher.getInstance().saveSettings(partial);
                res.json({ ok: true });
            } catch (e) {
                res.status(500).json({ ok: false, message: String(e) });
            }
        });

        // ── Display settings (disk partitions / navbar render mode) ───

        router.post("/monitoring/display-settings", async (req: Request, res: Response) => {
            try {
                const { diskPartitions, diskDisplayMode } = req.body as {
                    diskPartitions?: string[];
                    diskDisplayMode?: string;
                };
                if (Array.isArray(diskPartitions)) {
                    await Settings.set("diskPartitions", JSON.stringify(diskPartitions));
                }
                if (diskDisplayMode === "compact" || diskDisplayMode === "bar") {
                    await Settings.set("diskDisplayMode", diskDisplayMode);
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
            res.json({ ok: true, data: { diskPartitions, diskDisplayMode } });
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

        // Mount under /api — final paths: /api/monitoring/*
        const mountRouter = express.Router();
        mountRouter.use("/api", router);
        return mountRouter;
    }
}
