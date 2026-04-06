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

// ─── Stack stats collector ───────────────────────────────────────

interface StackStat {
    cpu:     number; // % cumulé des conteneurs du stack
    memUsed: number; // bytes cumulés
}

/** Convertit "128MiB", "1.2GiB", "500kB"… en bytes */
function parseDockerBytes(str: string): number {
    const s = str.trim();
    const units: Record<string, number> = {
        B: 1,
        kB: 1e3, KB: 1e3,
        MB: 1e6, MiB: 1024 ** 2,
        GB: 1e9, GiB: 1024 ** 3,
        TB: 1e12, TiB: 1024 ** 4,
    };
    const m = s.match(/^([\d.]+)\s*([A-Za-z]+)$/);
    if (!m) return 0;
    return Math.round(parseFloat(m[1]) * (units[m[2]] ?? 1));
}

const stackStatsCache = new Map<string, StackStat>();
let stackCollectorStarted = false;

async function updateStackStats(): Promise<void> {
    try {
        const [{ stdout: statsOut }, { stdout: psOut }] = await Promise.all([
            execAsync("docker stats --no-stream --format '{{json .}}' 2>/dev/null"),
            execAsync("docker ps --format '{{json .}}' 2>/dev/null"),
        ]);

        // containerID (short) → stackName
        const idToStack = new Map<string, string>();
        for (const line of psOut.trim().split("\n")) {
            if (!line) continue;
            try {
                const c = JSON.parse(line);
                const labels: string = c["Labels"] ?? "";
                const m = labels.match(/com\.docker\.compose\.project=([^,]+)/);
                if (m) idToStack.set(c["ID"], m[1].trim());
            } catch { /* ligne invalide */ }
        }

        // Agrégation par stack
        const aggr = new Map<string, StackStat>();
        for (const line of statsOut.trim().split("\n")) {
            if (!line) continue;
            try {
                const s = JSON.parse(line);
                const stackName = idToStack.get(s["ID"]) ?? idToStack.get(s["Container"]);
                if (!stackName) continue;

                const cpu     = parseFloat((s["CPUPerc"] ?? "0").replace("%", "")) || 0;
                const memUsed = parseDockerBytes((s["MemUsage"] ?? "0B / 0B").split("/")[0]);

                const cur = aggr.get(stackName);
                if (cur) { cur.cpu += cpu; cur.memUsed += memUsed; }
                else aggr.set(stackName, { cpu, memUsed });
            } catch { /* ligne invalide */ }
        }

        stackStatsCache.clear();
        for (const [name, stat] of aggr) {
            stackStatsCache.set(name, {
                cpu:     Math.round(stat.cpu * 10) / 10,
                memUsed: stat.memUsed,
            });
        }
    } catch { /* docker non dispo */ }
}

function startStackCollector(): void {
    if (stackCollectorStarted) return;
    stackCollectorStarted = true;
    updateStackStats().catch(() => {});
    setInterval(() => updateStackStats().catch(() => {}), 10000);
}

// ─── Router ───────────────────────────────────────────────────────

export class SystemStatsRouter extends Router {
    create(app: Express, server: DockgeServer): ExpressRouter {
        const router = express.Router();
        router.use(express.json());

        startCpuCollector();
        startStackCollector();

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

        // ── Stats par stack ───────────────────────────────────────

        router.get("/stack-stats", auth, (_req: Request, res: Response) => {
            const data: Record<string, StackStat> = {};
            for (const [k, v] of stackStatsCache) data[k] = v;
            res.json({ ok: true, data });
        });

        const mountRouter = express.Router();
        mountRouter.use("/api/system", router);
        return mountRouter;
    }
}
