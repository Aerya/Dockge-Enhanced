/**
 * MonitoringRouter — API pour l'onglet Monitoring.
 * Routes : settings, overview, crash events, stacks list.
 */

import { DockgeServer } from "../dockge-server";
import { Router } from "../router";
import express, { Express, Request, Response } from "express";
import { MonitoringWatcher, MonitoringSettings } from "../watchers/monitoring-watcher";
import { BackupManager } from "../watchers/backup-manager";
import { TrivyScanner } from "../watchers/trivy-scanner";
import { imageStatusStore } from "../watchers/image-watcher";
import { Settings } from "../settings";
import jwt from "jsonwebtoken";
import { JWTDecoded } from "../util-server";

// ─── Auth middleware (même pattern que watcher-router) ────────────

function requireAuth(req: Request, res: Response, next: () => void): void {
    const token =
        (req.headers.authorization?.startsWith("Bearer ")
            ? req.headers.authorization.slice(7)
            : null) ?? (req.query.token as string | undefined);

    if (!token) {
        res.status(401).json({ ok: false, message: "Unauthorized" });
        return;
    }
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET ?? "dockge") as JWTDecoded;
        if (!decoded?.username) throw new Error("Invalid token");
        next();
    } catch {
        res.status(401).json({ ok: false, message: "Unauthorized" });
    }
}

// ─── Router ───────────────────────────────────────────────────────

export class MonitoringRouter extends Router {
    create(_app: Express, _server: DockgeServer): express.Router {
        const router = express.Router();
        router.use(express.json());

        // ── Settings ──────────────────────────────────────────────

        router.get("/monitoring/settings", requireAuth, (_req: Request, res: Response) => {
            res.json({ ok: true, data: MonitoringWatcher.getInstance().getSettingsSafe() });
        });

        router.post("/monitoring/settings", requireAuth, async (req: Request, res: Response) => {
            try {
                const partial = req.body as Partial<MonitoringSettings>;
                await MonitoringWatcher.getInstance().saveSettings(partial);
                res.json({ ok: true });
            } catch (e) {
                res.status(500).json({ ok: false, message: String(e) });
            }
        });

        // ── Display settings (diskPartition — stored in SQLite) ───

        router.post("/monitoring/display-settings", requireAuth, async (req: Request, res: Response) => {
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

        router.get("/monitoring/display-settings", requireAuth, async (_req: Request, res: Response) => {
            const diskPartition = await Settings.get("diskPartition") ?? "/";
            res.json({ ok: true, data: { diskPartition } });
        });

        // ── Overview (dashboard cards) ────────────────────────────

        router.get("/monitoring/overview", requireAuth, async (_req: Request, res: Response) => {
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
            const trivyStatus    = TrivyScanner.getInstance().getStatus();
            const criticalImages = (trivyStatus.lastResults ?? [])
                .filter((r: { maxSeverity?: string }) =>
                    r.maxSeverity === "CRITICAL" || r.maxSeverity === "HIGH",
                );

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
                        nextScanAt: (trivyStatus as { nextScanAt?: string | null }).nextScanAt ?? null,
                    },
                    crashes,
                },
            });
        });

        // ── Recent crash events ───────────────────────────────────

        router.get("/monitoring/crash-events", requireAuth, (_req: Request, res: Response) => {
            res.json({ ok: true, data: MonitoringWatcher.getInstance().getRecentCrashEvents() });
        });

        // ── Stack list (for threshold config UI) ──────────────────

        router.get("/monitoring/stacks", requireAuth, async (_req: Request, res: Response) => {
            try {
                const stacks = await BackupManager.getInstance().listStacks();
                res.json({ ok: true, data: stacks });
            } catch (e) {
                res.status(500).json({ ok: false, message: String(e) });
            }
        });

        // Mount under /api (same pattern as WatcherRouter → /api/watcher)
        // Routes are defined as /monitoring/*, so final paths: /api/monitoring/*
        const mountRouter = express.Router();
        mountRouter.use("/api", router);
        return mountRouter;
    }
}
