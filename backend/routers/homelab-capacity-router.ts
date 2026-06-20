import express, { Express, Router as ExpressRouter, Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { DockgeServer } from "../dockge-server";
import { Router } from "../router";
import { Settings } from "../settings";
import { JWTDecoded } from "../util-server";
import { HomelabCapacityManager } from "../watchers/homelab-capacity-manager";
import { AuditLogger, setAuditUser } from "../audit-log";

async function requireAuth(
    req: Request,
    res: Response,
    next: NextFunction,
    jwtSecret: string
): Promise<void> {
    if (await Settings.get("disableAuth")) {
        setAuditUser(req, { username: "auth-disabled" });
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
        const decoded = jwt.verify(token, jwtSecret) as JWTDecoded;
        setAuditUser(req, { username: decoded.username });
        next();
    } catch {
        res.status(401).json({ ok: false, message: "Token invalide ou expiré" });
    }
}

export class HomelabCapacityRouter extends Router {
    create(app: Express, server: DockgeServer): ExpressRouter {
        const router = express.Router();
        const manager = HomelabCapacityManager.getInstance();
        const audit = AuditLogger.getInstance();

        router.use(express.json());
        router.use((req: Request, res: Response, next: NextFunction) => {
            requireAuth(req, res, next, server.jwtSecret).catch(next);
        });

        router.get("/summary", (_req: Request, res: Response) => {
            try {
                res.json({ ok: true, data: manager.getSummary() });
            } catch (e: any) {
                res.status(500).json({ ok: false, message: e?.message ?? String(e) });
            }
        });

        router.get("/settings", (_req: Request, res: Response) => {
            try {
                res.json({ ok: true, data: manager.getSettings() });
            } catch (e: any) {
                res.status(500).json({ ok: false, message: e?.message ?? String(e) });
            }
        });

        router.post("/settings", async (req: Request, res: Response) => {
            try {
                const settings = await manager.updateSettings({
                    enabled: !!req.body?.enabled,
                    intervalHours: req.body?.intervalHours,
                    historyDays: req.body?.historyDays,
                    runInLowPower: !!req.body?.runInLowPower,
                    includeBindMounts: !!req.body?.includeBindMounts,
                    oldImageDays: req.body?.oldImageDays,
                });
                await audit.logFromRequest(req, {
                    action: "capacity.settings.update",
                    category: "capacity",
                    targetType: "setting",
                    target: "homelabCapacity",
                    metadata: settings,
                });
                res.json({ ok: true, data: manager.getSummary() });
            } catch (e: any) {
                await audit.logFromRequest(req, {
                    action: "capacity.settings.update",
                    category: "capacity",
                    targetType: "setting",
                    target: "homelabCapacity",
                    status: "failure",
                    message: e?.message ?? String(e),
                });
                res.status(400).json({ ok: false, message: e?.message ?? String(e) });
            }
        });

        router.post("/scan", async (req: Request, res: Response) => {
            try {
                const snapshot = await manager.runScan(true);
                await audit.logFromRequest(req, {
                    action: "capacity.scan.run",
                    category: "capacity",
                    targetType: "dashboard",
                    target: "homelabCapacity",
                    message: `${snapshot.totals.totalKnownBytes} bytes tracked`,
                    metadata: {
                        durationMs: snapshot.durationMs,
                        volumes: snapshot.totals.volumes,
                        images: snapshot.totals.images,
                        containers: snapshot.totals.containers,
                        unknownVolumes: snapshot.totals.unknownVolumes,
                    },
                });
                res.json({ ok: true, data: manager.getSummary() });
            } catch (e: any) {
                await audit.logFromRequest(req, {
                    action: "capacity.scan.run",
                    category: "capacity",
                    targetType: "dashboard",
                    target: "homelabCapacity",
                    status: "failure",
                    message: e?.message ?? String(e),
                });
                res.status(500).json({ ok: false, message: e?.message ?? String(e) });
            }
        });

        const mountRouter = express.Router();
        mountRouter.use("/api/capacity", router);
        return mountRouter;
    }
}
