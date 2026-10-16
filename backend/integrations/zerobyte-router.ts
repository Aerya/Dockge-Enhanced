/** Subrouter is mounted AFTER watcher-router JWT authentication. */
import express, { Request, Response } from "express";
import { AuditLogger } from "../audit-log";
import { DockgeServer } from "../dockge-server";
import { zerobyte } from "./zerobyte-manager";
import { installManagedZerobyte, managedZerobyteStatus, updateManagedZerobyteMounts } from "./zerobyte-installer";

export function createZerobyteRouter(server: DockgeServer) {
    const router = express.Router();
    const handler = (fn: (req: Request, res: Response) => Promise<void>) => async (req: Request, res: Response) => {
        try {
            await fn(req, res);
        } catch (error) {
            res.status(400).json({ ok: false,
                message: error instanceof Error ? error.message : "Zerobyte operation failed" });
        }
    };
    async function audit(req: Request, action: string, target: string | null) {
        await AuditLogger.getInstance().logFromRequest(req, {
            action: `zerobyte.${action}`,
            category: "integration",
            targetType: "zerobyte",
            target,
            status: "success",
        });
    }
    router.get("/managed", handler(async (_req, res) => {
        res.json({ ok: true,
            data: await managedZerobyteStatus(server) });
    }));
    router.post("/managed/install", handler(async (req, res) => {
        const data = await installManagedZerobyte(server, req.body);
        await audit(req, "managed-install", data.name);
        res.status(201).json({ ok: true,
            data });
    }));
    router.post("/managed/mounts", handler(async (req, res) => {
        const data = await updateManagedZerobyteMounts(server, req.body);
        await audit(req, "managed-mounts-update", data.name);
        res.json({ ok: true,
            data });
    }));
    router.get("/settings", handler(async (_req, res) => {
        res.json({ ok: true,
            data: await zerobyte.getSafeConfig() });
    }));
    router.post("/settings", handler(async (req, res) => {
        const result = await zerobyte.saveConfig(req.body);
        await audit(req, "settings", result.url);
        res.json({ ok: true,
            data: result });
    }));
    router.post("/test", handler(async (_req, res) => {
        res.json({ ok: true,
            data: await zerobyte.testConnection() });
    }));
    router.get("/overview", handler(async (_req, res) => {
        res.json({ ok: true,
            data: await zerobyte.overview() });
    }));
    router.post("/backups", handler(async (req, res) => {
        await zerobyte.createJob(req.body);
        await audit(req, "job-create-disabled", String(req.body?.name ?? ""));
        res.status(201).json({ ok: true,
            data: { created: true,
                enabled: false } });
    }));
    router.post("/backups/:jobId/run", handler(async (req, res) => {
        if (req.body?.confirmation !== "BACKUP") {
            throw new Error("Backup confirmation required");
        }
        await zerobyte.runBackup(req.params.jobId);
        await audit(req, "job-run", req.params.jobId);
        res.status(202).json({ ok: true,
            data: { started: true } });
    }));
    router.post("/backups/:jobId/forget", handler(async (req, res) => {
        await zerobyte.applyRetention(req.params.jobId, req.body?.confirmation);
        await audit(req, "job-retention", req.params.jobId);
        res.status(202).json({ ok: true,
            data: { started: true } });
    }));
    router.get("/repositories/:repositoryId/snapshots", handler(async (req, res) => {
        res.json({ ok: true,
            data: await zerobyte.snapshots(req.params.repositoryId) });
    }));
    router.post("/repositories/:repositoryId/restore", handler(async (req, res) => {
        const data = await zerobyte.stagedRestore(req.params.repositoryId, req.body?.snapshotId, req.body?.confirmation);
        await audit(req, "staged-restore", req.params.repositoryId);
        res.status(202).json({ ok: true,
            data: { targetPath: data.targetPath,
                started: true } });
    }));
    return router;
}
