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
import jwt from "jsonwebtoken";
import { JWTDecoded } from "../util-server";

// ─── Auth middleware (même pattern exact que watcher-router) ──────

async function requireAuth(
    req: Request,
    res: Response,
    next: NextFunction,
    jwtSecret: string
): Promise<void> {
    if (await Settings.get("disableAuth")) {
        next();
        return;
    }

    const authHeader = req.headers["authorization"];
    const token =
        (authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : undefined) ??
        (typeof req.query.token === "string" ? req.query.token : undefined);

    if (!token) {
        res.status(401).json({ ok: false, message: "Authentification requise" });
        return;
    }

    try {
        jwt.verify(token, jwtSecret) as JWTDecoded;
        next();
    } catch {
        res.status(401).json({ ok: false, message: "Token invalide ou expiré" });
    }
}

// ─── Router ───────────────────────────────────────────────────────

export class MonitoringRouter extends Router {
    create(_app: Express, server: DockgeServer): express.Router {
        const router = express.Router();
        router.use(express.json());

        // Auth middleware on all routes — uses server.jwtSecret like WatcherRouter
        router.use((req: Request, res: Response, next: NextFunction) => {
            requireAuth(req, res, next, server.jwtSecret).catch(next);
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

        // ── Display settings (diskPartition — stored in SQLite) ───

        router.post("/monitoring/display-settings", async (req: Request, res: Response) => {
            try {
                const { diskPartition } = req.body as { diskPartition?: string };
                if (diskPartition !== undefined) {
                    await Settings.set("diskPartition", diskPartition);
                }
                res.json({ ok: true });
            } catch (e) {
                res.status(500).json({ ok: false, message: String(e) });
            }
        });

        router.get("/monitoring/display-settings", async (_req: Request, res: Response) => {
            const diskPartition = await Settings.get("diskPartition") ?? "/";
            res.json({ ok: true, data: { diskPartition } });
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

            // Crash events
            const crashes = MonitoringWatcher.getInstance().getRecentCrashEvents().slice(0, 10);

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
                },
            });
        });

        // ── Recent crash events ───────────────────────────────────

        router.get("/monitoring/crash-events", (_req: Request, res: Response) => {
            res.json({ ok: true, data: MonitoringWatcher.getInstance().getRecentCrashEvents() });
        });

        // Mount under /api — final paths: /api/monitoring/*
        const mountRouter = express.Router();
        mountRouter.use("/api", router);
        return mountRouter;
    }
}
