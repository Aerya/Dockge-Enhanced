/**
 * SystemStatsRouter — CPU, RAM, espace disque du serveur hôte.
 *
 * GET /api/system/stats → { cpu, ram: { used, total, percent }, disk: { used, total, percent, mount } }
 *
 * CPU calculé via /proc/stat (2 échantillons, intervalle 3 s en background).
 * RAM via os.totalmem() / os.freemem().
 * Disque via `df -B1 <partition>` — partition configurable dans les settings (clé: diskPartition, défaut: /).
 */

import os from "os";
import * as fs from "fs/promises";
import { exec } from "child_process";
import { promisify } from "util";
import { Router } from "../router";
import express, { Express, Router as ExpressRouter, Request, Response, NextFunction } from "express";
import { DockgeServer } from "../dockge-server";
import { Settings } from "../settings";
import jwt from "jsonwebtoken";
import { JWTDecoded } from "../util-server";

const execAsync = promisify(exec);

// ─── CPU sampling via /proc/stat ─────────────────────────────────

interface CpuTimes {
    total: number;
    idle: number;
}

async function readCpuTimes(): Promise<CpuTimes> {
    try {
        const content = await fs.readFile("/proc/stat", "utf8");
        const firstLine = content.split("\n")[0]; // "cpu  u n s id iw ..."
        const parts = firstLine.trim().split(/\s+/).slice(1).map(Number);
        const idle = (parts[3] ?? 0) + (parts[4] ?? 0); // idle + iowait
        const total = parts.reduce((a, b) => a + b, 0);
        return { total, idle };
    } catch {
        return { total: 0, idle: 0 };
    }
}

// Cache mis à jour toutes les 3 s en background
let cpuPercent = 0;
let lastCpuTimes: CpuTimes | null = null;
let collectorStarted = false;

function startCpuCollector(): void {
    if (collectorStarted) return;
    collectorStarted = true;

    readCpuTimes().then(t => { lastCpuTimes = t; }).catch(() => {});

    setInterval(async () => {
        const current = await readCpuTimes();
        if (lastCpuTimes) {
            const totalDiff = current.total - lastCpuTimes.total;
            const idleDiff  = current.idle  - lastCpuTimes.idle;
            if (totalDiff > 0) {
                cpuPercent = Math.round((totalDiff - idleDiff) / totalDiff * 100);
                cpuPercent = Math.max(0, Math.min(100, cpuPercent));
            }
        }
        lastCpuTimes = current;
    }, 3000);
}

// ─── Auth (même pattern que les autres routers Enhanced) ─────────

async function requireAuth(
    req: Request,
    res: Response,
    next: NextFunction,
    jwtSecret: string
): Promise<void> {
    if (await Settings.get("disableAuth")) { next(); return; }

    const authHeader = req.headers["authorization"];
    const token =
        (authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : undefined) ??
        (typeof req.query["token"] === "string" ? req.query["token"] : undefined);

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

export class SystemStatsRouter extends Router {
    create(app: Express, server: DockgeServer): ExpressRouter {
        const router = express.Router();
        router.use(express.json());

        startCpuCollector();

        const auth = (req: Request, res: Response, next: NextFunction) =>
            requireAuth(req, res, next, server.jwtSecret);

        router.get("/stats", auth, async (_req: Request, res: Response) => {
            try {
                // RAM
                const totalMem = os.totalmem();
                const freeMem  = os.freemem();
                const usedMem  = totalMem - freeMem;

                // Disque
                const partition = (await Settings.get("diskPartition")) || "/";
                let diskUsed = 0, diskTotal = 0, diskPercent = 0;
                try {
                    const { stdout } = await execAsync(
                        `df -B1 "${partition.replace(/"/g, "")}" 2>/dev/null | tail -1`
                    );
                    const parts = stdout.trim().split(/\s+/);
                    // Filesystem  1B-blocks  Used  Available  Use%  Mounted
                    diskTotal   = parseInt(parts[1] ?? "0", 10) || 0;
                    diskUsed    = parseInt(parts[2] ?? "0", 10) || 0;
                    diskPercent = diskTotal > 0
                        ? Math.round(diskUsed / diskTotal * 100)
                        : 0;
                } catch { /* df non dispo ou partition introuvable */ }

                res.json({
                    ok: true,
                    data: {
                        cpu: cpuPercent,
                        ram: {
                            used:    usedMem,
                            total:   totalMem,
                            percent: Math.round(usedMem / totalMem * 100),
                        },
                        disk: {
                            used:    diskUsed,
                            total:   diskTotal,
                            percent: diskPercent,
                            mount:   partition,
                        },
                    },
                });
            } catch (e: any) {
                res.status(500).json({ ok: false, message: e.message });
            }
        });

        const mountRouter = express.Router();
        mountRouter.use("/api/system", router);
        return mountRouter;
    }
}
