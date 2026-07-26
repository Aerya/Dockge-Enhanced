import express, {
    Express,
    NextFunction,
    Request,
    Response,
    Router as ExpressRouter,
} from "express";
import { AuditLogger, setAuditUser } from "../audit-log";
import {
    AutomationAuthenticationError,
    AutomationAuthorizationError,
    AutomationIdentity,
    AutomationManager,
    AutomationRateLimitError,
    registerAutomationServer,
    STACK_ACTIONS,
    StackAutomationAction,
} from "../automation/automation-manager";
import { requireHttpAuth } from "../auth";
import { DockgeServer } from "../dockge-server";
import { Router } from "../router";

type AutomationRequest = Request & { automationIdentity?: AutomationIdentity };

function numericId(value: string): number {
    const id = Number(value);
    if (!Number.isInteger(id) || id < 1) {
        throw new Error("Invalid identifier");
    }
    return id;
}

function statusForError(error: unknown): number {
    if (error instanceof AutomationAuthenticationError) {
        return 401;
    }
    if (error instanceof AutomationAuthorizationError) {
        return 403;
    }
    if (error instanceof AutomationRateLimitError) {
        return 429;
    }
    return 400;
}

function errorResponse(res: Response, error: unknown): void {
    const status = statusForError(error);
    if (status === 429) {
        res.setHeader("Retry-After", "60");
    }
    res.status(status).json({
        ok: false,
        error: error instanceof Error ? error.message : String(error),
    });
}

export class AutomationRouter extends Router {
    create(_app: Express, server: DockgeServer): ExpressRouter {
        registerAutomationServer(server);
        const manager = AutomationManager.getInstance();
        const mount = express.Router();

        const admin = express.Router();
        admin.use(express.json({ limit: "64kb" }));
        admin.use((req: Request, res: Response, next: NextFunction) => {
            requireHttpAuth(req, res, next, server.jwtSecret, identity => {
                setAuditUser(req, { username: identity.username });
            }).catch(next);
        });

        admin.get("/stacks", async (_req, res) => {
            try {
                res.json({ ok: true,
                    data: await manager.listStacks(server) });
            } catch (error) {
                errorResponse(res, error);
            }
        });

        admin.get("/tokens", async (_req, res) => {
            try {
                res.json({ ok: true,
                    data: await manager.listTokens() });
            } catch (error) {
                errorResponse(res, error);
            }
        });

        admin.post("/tokens", async (req, res) => {
            try {
                const data = await manager.createToken(req.body ?? {});
                await AuditLogger.getInstance().logFromRequest(req, {
                    action: "automation.token.create",
                    category: "automation",
                    targetType: "api-token",
                    target: data.item.prefix,
                    metadata: {
                        permissions: data.item.permissions,
                        stacks: data.item.stacks,
                        expiresAt: data.item.expiresAt,
                    },
                });
                res.status(201).json({ ok: true,
                    data });
            } catch (error) {
                errorResponse(res, error);
            }
        });

        admin.delete("/tokens/:id", async (req, res) => {
            try {
                const data = await manager.revokeToken(numericId(req.params.id));
                await AuditLogger.getInstance().logFromRequest(req, {
                    action: "automation.token.revoke",
                    category: "automation",
                    targetType: "api-token",
                    target: data.prefix,
                });
                res.json({ ok: true,
                    data });
            } catch (error) {
                errorResponse(res, error);
            }
        });

        admin.get("/webhooks", async (_req, res) => {
            try {
                res.json({ ok: true,
                    data: await manager.listWebhooks() });
            } catch (error) {
                errorResponse(res, error);
            }
        });

        admin.post("/webhooks", async (req, res) => {
            try {
                const data = await manager.createWebhook(req.body ?? {});
                await AuditLogger.getInstance().logFromRequest(req, {
                    action: "automation.webhook.create",
                    category: "automation",
                    targetType: "webhook",
                    target: data.item.prefix,
                    metadata: {
                        stack: data.item.stack,
                        actions: data.item.actions,
                        expiresAt: data.item.expiresAt,
                    },
                });
                res.status(201).json({ ok: true,
                    data });
            } catch (error) {
                errorResponse(res, error);
            }
        });

        admin.post("/webhooks/:id/rotate", async (req, res) => {
            try {
                const data = await manager.rotateWebhook(numericId(req.params.id));
                await AuditLogger.getInstance().logFromRequest(req, {
                    action: "automation.webhook.rotate",
                    category: "automation",
                    targetType: "webhook",
                    target: data.item.prefix,
                });
                res.json({ ok: true,
                    data });
            } catch (error) {
                errorResponse(res, error);
            }
        });

        admin.patch("/webhooks/:id", async (req, res) => {
            try {
                if (typeof req.body?.enabled !== "boolean") {
                    throw new Error("enabled must be a boolean");
                }
                const data = await manager.setWebhookEnabled(numericId(req.params.id), req.body.enabled);
                await AuditLogger.getInstance().logFromRequest(req, {
                    action: req.body.enabled ? "automation.webhook.enable" : "automation.webhook.disable",
                    category: "automation",
                    targetType: "webhook",
                    target: data.prefix,
                });
                res.json({ ok: true,
                    data });
            } catch (error) {
                errorResponse(res, error);
            }
        });

        mount.use("/api/automation", admin);

        const api = express.Router();
        api.use(express.json({ limit: "64kb" }));
        api.use(async (req: AutomationRequest, res, next) => {
            try {
                req.automationIdentity = await manager.authenticateToken(req);
                next();
            } catch (error) {
                errorResponse(res, error);
            }
        });

        api.get("/stacks", async (req: AutomationRequest, res) => {
            try {
                const identity = req.automationIdentity!;
                manager.assertAccess(identity, "stack:read");
                const stacks = await manager.listStacks(server);
                const allowed = identity.stacks.includes("*")
                    ? stacks
                    : stacks.filter(stack => identity.stacks.includes((stack as { name: string }).name));
                res.json({ ok: true,
                    data: allowed });
            } catch (error) {
                errorResponse(res, error);
            }
        });

        api.get("/stacks/:name", async (req: AutomationRequest, res) => {
            try {
                const identity = req.automationIdentity!;
                manager.assertAccess(identity, "stack:read", req.params.name);
                res.json({ ok: true,
                    data: await manager.getStack(server, req.params.name) });
            } catch (error) {
                errorResponse(res, error);
            }
        });

        api.post("/stacks/:name/actions/:action", async (req: AutomationRequest, res) => {
            try {
                const identity = req.automationIdentity!;
                const action = req.params.action as StackAutomationAction;
                if (!STACK_ACTIONS.includes(action)) {
                    throw new Error("Unsupported stack action");
                }
                manager.assertAccess(identity, `stack:${action}`, req.params.name);
                const data = await manager.runStackAction(server, req.params.name, action, {
                    origin: "api",
                    actor: `api:${identity.name}`,
                    ip: req.ip,
                    endpoint: `POST /api/v1/stacks/:name/actions/${action}`,
                });
                res.json({ ok: true,
                    data });
            } catch (error) {
                errorResponse(res, error);
            }
        });

        api.get("/history", async (req: AutomationRequest, res) => {
            try {
                const identity = req.automationIdentity!;
                manager.assertAccess(identity, "history:read");
                const requestedStack = typeof req.query.stack === "string" ? req.query.stack : undefined;
                if (requestedStack) {
                    manager.assertAccess(identity, "history:read", requestedStack);
                }
                if (!requestedStack && !identity.stacks.includes("*")) {
                    throw new AutomationAuthorizationError("A stack filter is required for a scoped token");
                }
                const data = await AuditLogger.getInstance().list({
                    category: "automation",
                    target: requestedStack,
                    limit: Number(req.query.limit) || 100,
                    offset: Number(req.query.offset) || 0,
                });
                res.json({ ok: true,
                    data });
            } catch (error) {
                errorResponse(res, error);
            }
        });

        mount.use("/api/v1", api);

        mount.post("/api/webhooks/:token/:action", express.json({ limit: "16kb" }), async (req, res) => {
            try {
                const action = req.params.action as StackAutomationAction;
                const identity = await manager.authenticateWebhook(req.params.token, action);
                const data = await manager.runStackAction(server, identity.stack, action, {
                    origin: "webhook",
                    actor: `webhook:${identity.name}`,
                    ip: req.ip,
                    endpoint: `POST /api/webhooks/:token/${action}`,
                });
                res.json({ ok: true,
                    data });
            } catch (error) {
                errorResponse(res, error);
            }
        });

        return mount;
    }
}
