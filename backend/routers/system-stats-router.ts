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
import { isLowPower, intervals } from "../low-power";
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

// ─── CPU : échantillonnage LAZY (piloté par les requêtes /stats) ──
// Pas de setInterval permanent : on échantillonne seulement quand un client
// poll réellement, au maximum 1×/intervalle. Aucun client → aucun calcul.
let cpuPercent = 0;
let lastCpuTimes: CpuTimes | null = null;
let lastCpuSampleAt = 0;

async function sampleCpuIfDue(): Promise<void> {
    const due = intervals().cpuSample;
    if (Date.now() - lastCpuSampleAt < due) return;

    const current = await readCpuTimes();
    if (lastCpuTimes) {
        const totalDiff = current.total - lastCpuTimes.total;
        const idleDiff  = current.idle  - lastCpuTimes.idle;
        if (totalDiff > 0) {
            cpuPercent = Math.round((totalDiff - idleDiff) / totalDiff * 100);
            cpuPercent = Math.max(0, Math.min(100, cpuPercent));
        }
    }
    lastCpuTimes   = current;
    lastCpuSampleAt = Date.now();
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
let lastStackCollectAt = 0;
let stackCollectInFlight: Promise<void> | null = null;

async function updateStackStats(): Promise<void> {
    try {
        const [{ stdout: statsOut }, { stdout: psOut }] = await Promise.all([
            execAsync("docker stats --no-stream --format '{{json .}}'"),
            execAsync("docker ps --format '{{json .}}'"),
        ]);

        // Index : short ID ET noms de container → stackName
        // Robuste face aux socket-proxies qui peuvent changer le format de l'ID
        const containerToStack = new Map<string, string>();
        for (const line of psOut.trim().split("\n")) {
            if (!line.trim()) continue;
            try {
                const c = JSON.parse(line);
                const labels: string = c["Labels"] ?? "";
                const m = labels.match(/com\.docker\.compose\.project=([^,]+)/);
                if (!m) continue;
                const stackName = m[1].trim();

                // Par ID court (12 chars)
                if (c["ID"]) containerToStack.set((c["ID"] as string).trim(), stackName);

                // Par nom(s) — docker ps retourne parfois "/nom1,/nom2"
                const names: string = c["Names"] ?? "";
                for (const n of names.split(",")) {
                    const clean = n.trim().replace(/^\//, "");
                    if (clean) containerToStack.set(clean, stackName);
                }
            } catch { /* ligne invalide */ }
        }

        // Agrégation par stack — cherche le stackName par ID, Container ou Name
        const aggr = new Map<string, StackStat>();
        for (const line of statsOut.trim().split("\n")) {
            if (!line.trim()) continue;
            try {
                const s = JSON.parse(line);

                const candidates = [
                    s["ID"],
                    s["Container"],
                    s["Name"],
                ].map((v: unknown) => (typeof v === "string" ? v.replace(/^\//, "").trim() : ""))
                    .filter(Boolean);

                let stackName: string | undefined;
                for (const key of candidates) {
                    stackName = containerToStack.get(key);
                    if (stackName) break;
                }
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

/** Collecte unique, dédupliquée (un seul `docker stats` global en vol à la fois). */
function collectStackStats(): Promise<void> {
    if (stackCollectInFlight) return stackCollectInFlight;
    stackCollectInFlight = updateStackStats()
        .catch(() => { /* docker non dispo */ })
        .finally(() => {
            lastStackCollectAt   = Date.now();
            stackCollectInFlight = null;
        });
    return stackCollectInFlight;
}

/**
 * Déclenche une collecte SEULEMENT si le cache est périmé (lazy + throttle).
 * Piloté par les requêtes HTTP : aucun client ne poll → aucune collecte.
 * Premier chargement (cache vide) : on attend pour ne pas renvoyer du vide ;
 * sinon on rafraîchit en arrière-plan sans bloquer la réponse.
 */
async function collectStackStatsIfDue(): Promise<void> {
    const due = intervals().stackStats;
    if (Date.now() - lastStackCollectAt < due) return;

    if (stackStatsCache.size === 0) {
        await collectStackStats();
    } else {
        void collectStackStats();
    }
}

// ─── Router ───────────────────────────────────────────────────────

export class SystemStatsRouter extends Router {
    create(app: Express, server: DockgeServer): ExpressRouter {
        const router = express.Router();
        router.use(express.json());

        // Pas de collecteur en arrière-plan : tout est lazy, piloté par les
        // requêtes des clients (cf. low-power.ts). Aucun onglet ouvert →
        // aucun poll → aucun `docker stats` / `df` / lecture /proc/stat.

        const auth = (req: Request, res: Response, next: NextFunction) =>
            requireAuth(req, res, next, server.jwtSecret);

        router.get("/stats", auth, async (_req: Request, res: Response) => {
            try {
                // CPU — échantillonné à la demande, throttlé selon le mode
                await sampleCpuIfDue();

                // RAM
                const totalMem = os.totalmem();
                const freeMem  = os.freemem();
                const usedMem  = totalMem - freeMem;

                // Disques — support multi-partitions
                // Lit diskPartitions (tableau JSON) ou diskPartition (ancien scalaire) en fallback
                let partitions: string[] = [];
                const rawArr = await Settings.get("diskPartitions");
                if (rawArr) {
                    try { partitions = JSON.parse(rawArr) as string[]; } catch { /* ignore */ }
                }
                if (partitions.length === 0) {
                    const single = (await Settings.get("diskPartition")) || "/";
                    partitions = [single];
                }
                const rawDisplayMode = await Settings.get("diskDisplayMode");
                const diskDisplayMode = rawDisplayMode === "bar" ? "bar" : "compact";

                const disks = await Promise.all(partitions.map(async (mount) => {
                    try {
                        const { stdout } = await execAsync(
                            `df -B1 "${mount.replace(/"/g, "")}" 2>/dev/null | tail -1`
                        );
                        const parts = stdout.trim().split(/\s+/);
                        const total   = parseInt(parts[1] ?? "0", 10) || 0;
                        const used    = parseInt(parts[2] ?? "0", 10) || 0;
                        const percent = total > 0 ? Math.round(used / total * 100) : 0;
                        return { mount, used, total, percent };
                    } catch {
                        return { mount, used: 0, total: 0, percent: 0 };
                    }
                }));

                res.json({
                    ok: true,
                    data: {
                        cpu: cpuPercent,
                        ram: {
                            used:    usedMem,
                            total:   totalMem,
                            percent: Math.round(usedMem / totalMem * 100),
                        },
                        // disk kept for backward compat (first partition)
                        disk:  disks[0] ?? { mount: "/", used: 0, total: 0, percent: 0 },
                        disks,
                        diskDisplayMode,
                    },
                    lowPowerMode: isLowPower(),
                });
            } catch (e: any) {
                res.status(500).json({ ok: false, message: e.message });
            }
        });

        // ── Stats par stack ───────────────────────────────────────

        router.get("/stack-stats", auth, async (_req: Request, res: Response) => {
            // Collecte lazy : ne lance `docker stats` que si le cache est périmé
            await collectStackStatsIfDue();
            const data: Record<string, StackStat> = {};
            for (const [k, v] of stackStatsCache) data[k] = v;
            res.json({ ok: true, data, lowPowerMode: isLowPower() });
        });

        const mountRouter = express.Router();
        mountRouter.use("/api/system", router);
        return mountRouter;
    }
}
