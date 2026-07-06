import express, { Express, Router as ExpressRouter, Request, Response, NextFunction } from "express";
import { DockgeServer } from "../dockge-server";
import { Router } from "../router";
import { AuditLogger, setAuditUser } from "../audit-log";
import { requireHttpAuth } from "../auth";

export class AuditLogRouter extends Router {
    create(app: Express, server: DockgeServer): ExpressRouter {
        const router = express.Router();
        const audit = AuditLogger.getInstance();

        router.use(express.json());
        router.use((req: Request, res: Response, next: NextFunction) => {
            requireHttpAuth(req, res, next, server.jwtSecret, (identity) => {
                setAuditUser(req, { username: identity.username });
            }).catch(next);
        });

        router.get("/entries", async (req: Request, res: Response) => {
            try {
                const result = await audit.list({
                    q: typeof req.query.q === "string" ? req.query.q : undefined,
                    action: typeof req.query.action === "string" ? req.query.action : undefined,
                    category: typeof req.query.category === "string" ? req.query.category : undefined,
                    status: typeof req.query.status === "string" ? req.query.status : undefined,
                    from: typeof req.query.from === "string" ? req.query.from : undefined,
                    to: typeof req.query.to === "string" ? req.query.to : undefined,
                    limit: Number(req.query.limit) || undefined,
                    offset: Number(req.query.offset) || undefined,
                });
                res.json({ ok: true, ...result });
            } catch (e) {
                res.status(500).json({ ok: false, message: String(e) });
            }
        });

        router.get("/facets", async (_req: Request, res: Response) => {
            try {
                res.json({ ok: true, data: await audit.getFacets() });
            } catch (e) {
                res.status(500).json({ ok: false, message: String(e) });
            }
        });

        router.get("/settings", async (_req: Request, res: Response) => {
            try {
                res.json({ ok: true, data: await audit.getSettings() });
            } catch (e) {
                res.status(500).json({ ok: false, message: String(e) });
            }
        });

        router.post("/settings", async (req: Request, res: Response) => {
            try {
                const data = await audit.saveSettings({
                    retentionDays: req.body?.retentionDays ?? null,
                });
                await audit.logFromRequest(req, {
                    action: "audit.retention.update",
                    category: "audit",
                    targetType: "setting",
                    target: "adminAuditLogRetentionDays",
                    metadata: data,
                });
                res.json({ ok: true, data });
            } catch (e) {
                await audit.logFromRequest(req, {
                    action: "audit.retention.update",
                    category: "audit",
                    targetType: "setting",
                    target: "adminAuditLogRetentionDays",
                    status: "failure",
                    message: String(e),
                });
                res.status(400).json({ ok: false, message: String(e) });
            }
        });

        const mountRouter = express.Router();
        mountRouter.use("/api/audit", router);
        return mountRouter;
    }
}
