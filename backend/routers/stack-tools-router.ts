import express, { Express, NextFunction, Request, Response, Router as ExpressRouter } from "express";
import { AuditLogger, setAuditUser } from "../audit-log";
import { requireHttpAuth } from "../auth";
import { DockgeServer } from "../dockge-server";
import { Router } from "../router";
import { StackGitService } from "../stack-git-service";

async function auditGitOperation(
    req: Request,
    action: string,
    status: "success" | "failure",
    startedAt: number,
    metadata: Record<string, unknown> = {},
    message?: string,
): Promise<void> {
    await AuditLogger.getInstance().logFromRequest(req, {
        action: `stack.git.${action}`,
        category: "git",
        targetType: "stack",
        target: req.params.stack,
        status,
        message,
        metadata: {
            origin: "manual",
            durationMs: Date.now() - startedAt,
            ...metadata,
        },
    });
}

export class StackToolsRouter extends Router {
    create(_app: Express, server: DockgeServer): ExpressRouter {
        const router = express.Router();
        const git = new StackGitService(server);
        router.use(express.json({ limit: "64kb" }));
        router.use((req: Request, res: Response, next: NextFunction) => {
            requireHttpAuth(req, res, next, server.jwtSecret, identity => {
                setAuditUser(req, { username: identity.username });
            }).catch(next);
        });

        const read = (operation: "status" | "diff") => async (req: Request, res: Response) => {
            try {
                const data = await git[operation](req.params.stack);
                res.json({ ok: true,
                    data });
            } catch (error) {
                res.status(400).json({ ok: false,
                    message: error instanceof Error ? error.message : String(error) });
            }
        };
        router.get("/:stack/git/status", read("status"));
        router.get("/:stack/git/diff", read("diff"));

        for (const action of [ "init", "pull", "push" ] as const) {
            router.post(`/:stack/git/${action}`, async (req, res) => {
                const startedAt = Date.now();
                try {
                    const data = await git[action](req.params.stack);
                    await auditGitOperation(req, action, "success", startedAt);
                    res.json({ ok: true,
                        data });
                } catch (error) {
                    const message = error instanceof Error ? error.message : String(error);
                    await auditGitOperation(req, action, "failure", startedAt, {}, message);
                    res.status(400).json({ ok: false,
                        message });
                }
            });
        }

        router.post("/:stack/git/remote", async (req, res) => {
            const startedAt = Date.now();
            try {
                const data = await git.setRemote(req.params.stack, req.body?.remote);
                await auditGitOperation(req, "remote", "success", startedAt);
                res.json({ ok: true,
                    data });
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                await auditGitOperation(req, "remote", "failure", startedAt, {}, message);
                res.status(400).json({ ok: false,
                    message });
            }
        });

        router.post("/:stack/git/commit", async (req, res) => {
            const startedAt = Date.now();
            try {
                const data = await git.commit(req.params.stack, req.body?.message);
                await auditGitOperation(req, "commit", "success", startedAt);
                res.json({ ok: true,
                    data });
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                await auditGitOperation(req, "commit", "failure", startedAt, {}, message);
                res.status(400).json({ ok: false,
                    message });
            }
        });

        router.post("/:stack/git/restore", async (req, res) => {
            const startedAt = Date.now();
            const metadata = {
                ref: String(req.body?.ref ?? "").slice(0, 40),
                rollback: "automatic on invalid Compose",
            };
            try {
                const data = await git.restore(req.params.stack, req.body?.ref);
                await auditGitOperation(req, "restore", "success", startedAt, metadata);
                res.json({ ok: true,
                    data });
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                await auditGitOperation(req, "restore", "failure", startedAt, metadata, message);
                res.status(400).json({ ok: false,
                    message });
            }
        });

        const mount = express.Router();
        mount.use("/api/stack-tools", router);
        return mount;
    }
}
