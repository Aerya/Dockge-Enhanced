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
import { requireHttpAuth } from "../auth";

const execAsync = promisify(exec);

// ─── CPU sampling via /proc/stat ─────────────────────────────────

interface CpuTimes {
    total: number;
    idle: number;
}

interface HostDetails {
    cpuModel: string;
    cpuCores: number;
    perCoreCpu: number[];
    loadAverage: number[];
    processCount: number | null;
    uptimeSeconds: number;
    temperatures: {
        cpu: { label: string; celsius: number }[];
        disks: { label: string; celsius: number }[];
    };
    updates: {
        available: number | null;
        security: number | null;
        manager: string | null;
        error?: string;
    };
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

async function readAllCpuTimes(): Promise<CpuTimes[]> {
    try {
        const content = await fs.readFile("/proc/stat", "utf8");
        return content.split("\n")
            .filter(line => /^cpu\d+\s/.test(line))
            .map((line) => {
                const parts = line.trim().split(/\s+/).slice(1).map(Number);
                const idle = (parts[3] ?? 0) + (parts[4] ?? 0);
                const total = parts.reduce((a, b) => a + b, 0);
                return { total, idle };
            });
    } catch {
        return [];
    }
}

// ─── CPU : échantillonnage LAZY (piloté par les requêtes /stats) ──
// Pas de setInterval permanent : on échantillonne seulement quand un client
// poll réellement, au maximum 1×/intervalle. Aucun client → aucun calcul.
let cpuPercent = 0;
let lastCpuTimes: CpuTimes | null = null;
let perCoreCpuPercent: number[] = [];
let lastPerCoreCpuTimes: CpuTimes[] = [];
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

    const cores = await readAllCpuTimes();
    if (lastPerCoreCpuTimes.length === cores.length) {
        perCoreCpuPercent = cores.map((core, index) => {
            const previous = lastPerCoreCpuTimes[index];
            const totalDiff = core.total - previous.total;
            const idleDiff = core.idle - previous.idle;
            if (totalDiff <= 0) return 0;
            return Math.max(0, Math.min(100, Math.round((totalDiff - idleDiff) / totalDiff * 100)));
        });
    }
    lastPerCoreCpuTimes = cores;
    lastCpuSampleAt = Date.now();
}

let hostDetailsCache: { at: number; data: HostDetails } | null = null;

async function readHostDetails(): Promise<HostDetails> {
    if (hostDetailsCache && Date.now() - hostDetailsCache.at < 60_000) {
        return hostDetailsCache.data;
    }

    const cpus = os.cpus();
    const data: HostDetails = {
        cpuModel: cpus[0]?.model ?? "",
        cpuCores: cpus.length,
        perCoreCpu: perCoreCpuPercent,
        loadAverage: os.loadavg(),
        processCount: await readProcessCount(),
        uptimeSeconds: os.uptime(),
        temperatures: await readTemperatures(),
        updates: await readOsUpdates(),
    };
    hostDetailsCache = { at: Date.now(), data };
    return data;
}

async function readProcessCount(): Promise<number | null> {
    try {
        const entries = await fs.readdir("/proc");
        return entries.filter(name => /^\d+$/.test(name)).length;
    } catch {
        return null;
    }
}

async function readTemperatures(): Promise<HostDetails["temperatures"]> {
    const cpu: { label: string; celsius: number }[] = [];
    const disks: { label: string; celsius: number }[] = [];

    try {
        const zones = await fs.readdir("/sys/class/thermal");
        for (const zone of zones.filter(z => z.startsWith("thermal_zone"))) {
            const base = `/sys/class/thermal/${zone}`;
            const [type, tempRaw] = await Promise.all([
                fs.readFile(`${base}/type`, "utf8").catch(() => zone),
                fs.readFile(`${base}/temp`, "utf8").catch(() => ""),
            ]);
            const milli = Number.parseInt(tempRaw.trim(), 10);
            if (Number.isFinite(milli) && milli > 0) {
                cpu.push({ label: type.trim(), celsius: Math.round(milli / 100) / 10 });
            }
        }
    } catch { /* not available */ }

    try {
        const { stdout } = await execAsync("command -v sensors >/dev/null 2>&1 && sensors -j", { timeout: 5000 });
        const parsed = JSON.parse(stdout);
        let index = 1;
        for (const chip of Object.values(parsed) as any[]) {
            for (const [label, values] of Object.entries(chip) as any[]) {
                const input = values?.temp1_input ?? values?.temp2_input ?? values?.Package_id_0_input;
                if (typeof input === "number" && !cpu.some(t => t.label === label)) {
                    cpu.push({ label: label || `Core ${index++}`, celsius: Math.round(input * 10) / 10 });
                }
            }
        }
    } catch { /* optional */ }

    try {
        const block = await fs.readdir("/sys/block");
        await Promise.all(block.filter(name => /^(sd|nvme|vd|xvd)/.test(name)).map(async (dev) => {
            try {
                const { stdout } = await execAsync(`smartctl -A /dev/${dev} 2>/dev/null | awk '/Temperature|Temperature_Celsius/ {print $10; exit}'`, { timeout: 5000 });
                const value = Number.parseInt(stdout.trim(), 10);
                if (Number.isFinite(value) && value > 0) {
                    disks.push({ label: dev, celsius: value });
                }
            } catch { /* optional */ }
        }));
    } catch { /* optional */ }

    return { cpu, disks };
}

async function readOsUpdates(): Promise<HostDetails["updates"]> {
    const checks = [
        { manager: "apt", command: "command -v apt >/dev/null 2>&1 && apt list --upgradable 2>/dev/null | tail -n +2" },
        { manager: "apk", command: "command -v apk >/dev/null 2>&1 && apk version -l '<'" },
        { manager: "dnf", command: "command -v dnf >/dev/null 2>&1 && dnf check-update -q || true" },
    ];
    for (const check of checks) {
        try {
            const { stdout } = await execAsync(check.command, { timeout: 15_000, maxBuffer: 1024 * 1024 });
            const lines = stdout.split(/\r?\n/).filter(line => line.trim() && !line.startsWith("Listing"));
            return { available: lines.length, security: null, manager: check.manager };
        } catch { /* try next */ }
    }
    return { available: null, security: null, manager: null };
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
            requireHttpAuth(req, res, next, server.jwtSecret);

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
                        host: await readHostDetails(),
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
