import express, { Express, NextFunction, Request, Response, Router as ExpressRouter } from "express";
import { setAuditUser, AuditLogger } from "../audit-log";
import { requireHttpAuth } from "../auth";
import { DockgeServer } from "../dockge-server";
import { PlugNPiNManager } from "../integrations/plugnpin-manager";
import { Router } from "../router";

async function audit(
    req: Request,
    action: string,
    status: "success" | "failure" = "success",
    message?: string,
): Promise<void> {
    await AuditLogger.getInstance().logFromRequest(req, {
        action,
        category: "integration",
        targetType: "integration",
        target: "plugnpin",
        status,
        message,
    });
}

export class IntegrationsRouter extends Router {
    create(_app: Express, server: DockgeServer): ExpressRouter {
        const router = express.Router();
        router.use(express.json());
        router.use((req: Request, res: Response, next: NextFunction) => {
            requireHttpAuth(req, res, next, server.jwtSecret, identity => {
                setAuditUser(req, { username: identity.username });
            }).catch(next);
        });

        router.get("/plugnpin/settings", (_req, res) => {
            res.json({ ok: true,
                data: PlugNPiNManager.getInstance().getSettingsSafe() });
        });

        router.put("/plugnpin/settings", async (req, res) => {
            try {
                const data = await PlugNPiNManager.getInstance().saveSettings(req.body ?? {});
                await audit(req, "plugnpin.settings.save");
                res.json({ ok: true,
                    data });
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                await audit(req, "plugnpin.settings.save", "failure", message);
                res.status(400).json({ ok: false,
                    message });
            }
        });

        router.get("/plugnpin/status", async (_req, res) => {
            try {
                res.json({ ok: true,
                    data: await PlugNPiNManager.getInstance().getStatus() });
            } catch (error) {
                res.status(500).json({ ok: false,
                    message: String(error) });
            }
        });

        router.get("/plugnpin/logs", async (req, res) => {
            try {
                const tail = typeof req.query.tail === "string" ? Number(req.query.tail) : 200;
                res.json({ ok: true,
                    data: await PlugNPiNManager.getInstance().getLogs(tail) });
            } catch (error) {
                res.status(404).json({ ok: false,
                    message: String(error) });
            }
        });

        for (const [ route, action ] of [
            [ "start", "start" ],
            [ "stop", "stop" ],
            [ "restart", "restart" ],
        ] as const) {
            router.post(`/plugnpin/${route}`, async (req, res) => {
                try {
                    await PlugNPiNManager.getInstance()[action]();
                    await audit(req, `plugnpin.${action}`);
                    res.json({ ok: true });
                } catch (error) {
                    const message = error instanceof Error ? error.message : String(error);
                    await audit(req, `plugnpin.${action}`, "failure", message);
                    res.status(400).json({ ok: false,
                        message });
                }
            });
        }

        const mountRouter = express.Router();
        mountRouter.use("/api/integrations", router);
        return mountRouter;
    }
}
