import { workflowsFor } from "./zerobyte-workflows";
import { localZerobyteSummary, federatedZerobyteOverview } from "./zerobyte-federation";
/** Subrouter is mounted AFTER watcher-router JWT authentication. */
import express, { Request, Response } from "express";
import { AuditLogger } from "../audit-log";
import { DockgeServer } from "../dockge-server";
import { zerobyte } from "./zerobyte-manager";
import { installManagedZerobyte, managedZerobyteStatus, updateManagedZerobyteMounts, managedConnection, managedRestoreRoot } from "./zerobyte-installer";

export function createZerobyteRouter(server: DockgeServer) {
    const router = express.Router();
    const workflows = workflowsFor(server);
    async function trustedMutation() {
        let managed = false;
        try {
            managed = await managedConnection(server);
        } catch { /* External connections do not require Docker access. */ }
        if (!managed && !(await zerobyte.getSafeConfig()).externalRisksAcknowledged) {
            throw new Error("Acknowledge external misconfiguration risks for this URL/API key before performing operations");
        }
        return managed;
    }
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
        await workflows.assertIdle();
        const data = await installManagedZerobyte(server, req.body);
        await audit(req, "managed-install", data.name);
        res.status(201).json({ ok: true,
            data });
    }));
    router.post("/managed/mounts", handler(async (req, res) => {
        await workflows.assertIdle();
        const data = await updateManagedZerobyteMounts(server, req.body);
        await audit(req, "managed-mounts-update", data.name);
        res.json({ ok: true,
            data });
    }));
    router.get("/settings", handler(async (_req, res) => {
        const data = await zerobyte.getSafeConfig();
        try {
            data.restoreEnabled = Boolean(await managedRestoreRoot(server));
        } catch { /* External restore requires explicit settings. */ }
        res.json({ ok: true,
            data });
    }));
    router.post("/settings", handler(async (req, res) => {
        await workflows.assertIdle();
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
        const data = await zerobyte.overview();
        try {
            data.restoreEnabled = Boolean(await managedRestoreRoot(server));
        } catch { /* External restore stays gated. */ }
        res.json({ ok: true,
            data });
    }));
    router.post("/backups", handler(async (req, res) => {
        await trustedMutation();
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
        await trustedMutation();
        await workflows.assertCanRun(req.params.jobId);
        await zerobyte.runBackup(req.params.jobId);
        await audit(req, "job-run", req.params.jobId);
        res.status(202).json({ ok: true,
            data: { started: true } });
    }));
    router.post("/backups/:jobId/forget", handler(async (req, res) => {
        await trustedMutation();
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
        const managed = await trustedMutation();
        const root = managed ? await managedRestoreRoot(server) : undefined;
        const data = await zerobyte.stagedRestore(req.params.repositoryId, req.body?.snapshotId, req.body?.confirmation, root);
        await audit(req, "staged-restore", req.params.repositoryId);
        res.status(202).json({ ok: true,
            data: { targetPath: data.targetPath,
                started: true } });
    }));
    router.get("/workflows", handler(async (_req, res) => {
        res.json({ ok: true,
            data: await workflows.status() });
    }));
    router.get("/workflows/stacks", handler(async (_req, res) => {
        res.json({ ok: true,
            data: await workflows.listStacks() });
    }));
    router.post("/workflows/plan", handler(async (req, res) => {
        res.json({ ok: true,
            data: await workflows.plan(req.body ?? {}) });
    }));
    router.post("/workflows/provision", handler(async (req, res) => {
        const data = await workflows.provision(req.body ?? {});
        await audit(req, "provision", data.id);
        res.status(201).json({ ok: true,
            data });
    }));
    router.post("/workflows/:workflow/acknowledge", handler(async (req, res) => {
        await workflows.acknowledge(req.params.workflow, req.body?.confirmation);
        await audit(req, "workflow-acknowledge", req.params.workflow);
        res.json({ ok: true });
    }));
    router.get("/summary", handler(async (_req, res) => {
        res.json({ ok: true,
            data: await localZerobyteSummary(server) });
    }));
    router.get("/federation", handler(async (_req, res) => {
        res.json({ ok: true,
            data: await federatedZerobyteOverview(server) });
    }));
    return router;
}
