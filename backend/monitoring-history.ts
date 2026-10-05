import fs from "node:fs/promises";
import os from "node:os";
import { R } from "redbean-node";
import { log } from "./log";

const SAMPLE_INTERVAL_MS = 5 * 60_000;
const MAX_POINTS = 750;

export interface CpuTimes {
    idle: number;
    total: number;
}

export interface MonitoringHistoryRange {
    from: Date;
    to: Date;
    amount: number;
    unit: "days" | "weeks" | "months" | "years";
}

export interface MonitoringHistoryPoint {
    sampledAt: string;
    cpuPercent: number;
    ramPercent: number;
    ramUsed: number;
    ramTotal: number;
}

export function cpuPercentFromDelta(previous: CpuTimes, current: CpuTimes): number | null {
    const totalDelta = current.total - previous.total;
    const idleDelta = current.idle - previous.idle;
    if (totalDelta <= 0 || idleDelta < 0) {
        return null;
    }
    return Math.max(0, Math.min(100, ((totalDelta - idleDelta) / totalDelta) * 100));
}

export async function readHostCpuTimes(): Promise<CpuTimes> {
    const line = (await fs.readFile("/proc/stat", "utf8")).split("\n").find(value => value.startsWith("cpu "));
    if (!line) {
        throw new Error("/proc/stat ne contient pas la ligne CPU agrégée");
    }
    const values = line.trim().split(/\s+/).slice(1).map(Number);
    if (values.length < 4 || values.some(value => !Number.isFinite(value))) {
        throw new Error("Données CPU invalides");
    }
    return {
        idle: (values[3] ?? 0) + (values[4] ?? 0),
        total: values.reduce((sum, value) => sum + value, 0),
    };
}

export function historyStartDate(amount: number, unit: MonitoringHistoryRange["unit"], now = new Date()): Date {
    const from = new Date(now);
    if (unit === "days") {
        from.setUTCDate(from.getUTCDate() - amount);
    } else if (unit === "weeks") {
        from.setUTCDate(from.getUTCDate() - amount * 7);
    } else {
        const day = from.getUTCDate();
        const months = unit === "months" ? amount : amount * 12;
        from.setUTCDate(1);
        from.setUTCMonth(from.getUTCMonth() - months);
        const lastDay = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + 1, 0)).getUTCDate();
        from.setUTCDate(Math.min(day, lastDay));
    }
    return from;
}

export function historyBucketSeconds(from: Date, to: Date): number {
    const durationSeconds = Math.max(300, Math.ceil((to.getTime() - from.getTime()) / 1000));
    return Math.max(300, Math.ceil(durationSeconds / MAX_POINTS / 300) * 300);
}

export class MonitoringHistoryCollector {
    private static instance: MonitoringHistoryCollector;
    private timer: NodeJS.Timeout | null = null;
    private previousCpu: CpuTimes | null = null;
    private sampling = false;

    static getInstance(): MonitoringHistoryCollector {
        MonitoringHistoryCollector.instance ??= new MonitoringHistoryCollector();
        return MonitoringHistoryCollector.instance;
    }

    async setEnabled(enabled: boolean): Promise<void> {
        if (this.timer) {
            clearInterval(this.timer);
        }
        this.timer = null;
        this.previousCpu = null;
        if (!enabled) {
            return;
        }
        try {
            this.previousCpu = await readHostCpuTimes();
        } catch (error) {
            log.warn("MonitoringHistory", `Initialisation CPU impossible : ${String(error)}`);
        }
        this.timer = setInterval(() => this.sample().catch(error => {
            log.warn("MonitoringHistory", `Échantillon ignoré : ${String(error)}`);
        }), SAMPLE_INTERVAL_MS);
        this.timer.unref?.();
    }

    async sample(): Promise<void> {
        if (this.sampling) {
            return;
        }
        this.sampling = true;
        try {
            const currentCpu = await readHostCpuTimes();
            const previousCpu = this.previousCpu;
            this.previousCpu = currentCpu;
            if (!previousCpu) {
                return;
            }
            const cpuPercent = cpuPercentFromDelta(previousCpu, currentCpu);
            if (cpuPercent === null) {
                return;
            }
            const ramTotal = os.totalmem();
            const ramUsed = ramTotal - os.freemem();
            const ramPercent = ramTotal > 0 ? (ramUsed / ramTotal) * 100 : 0;
            await R.exec(
                `INSERT INTO monitoring_history (sampled_at, cpu_percent, ram_percent, ram_used, ram_total)
                 VALUES (?, ?, ?, ?, ?)`,
                [ new Date().toISOString(), cpuPercent, ramPercent, ramUsed, ramTotal ],
            );
        } finally {
            this.sampling = false;
        }
    }

    async read(range: MonitoringHistoryRange): Promise<{
        points: MonitoringHistoryPoint[];
        stats: { cpuAverage: number;
            cpuMax: number;
            ramAverage: number;
            ramMax: number };
        from: string;
        to: string;
        bucketSeconds: number;
    }> {
        const fromIso = range.from.toISOString();
        const toIso = range.to.toISOString();
        const bucketSeconds = historyBucketSeconds(range.from, range.to);
        const fromEpoch = Math.floor(range.from.getTime() / 1000);
        const rows = await R.getAll(
            `SELECT MIN(sampled_at) AS sampled_at,
                    AVG(cpu_percent) AS cpu_percent,
                    AVG(ram_percent) AS ram_percent,
                    AVG(ram_used) AS ram_used,
                    AVG(ram_total) AS ram_total
             FROM monitoring_history
             WHERE sampled_at >= ? AND sampled_at <= ?
             GROUP BY CAST((strftime('%s', sampled_at) - ?) / ? AS INTEGER)
             ORDER BY sampled_at ASC`,
            [ fromIso, toIso, fromEpoch, bucketSeconds ],
        ) as Array<Record<string, string | number>>;
        const aggregate = await R.getRow(
            `SELECT AVG(cpu_percent) AS cpu_average, MAX(cpu_percent) AS cpu_max,
                    AVG(ram_percent) AS ram_average, MAX(ram_percent) AS ram_max
             FROM monitoring_history WHERE sampled_at >= ? AND sampled_at <= ?`,
            [ fromIso, toIso ],
        ) as Record<string, number | null> | null;
        const number = (value: string | number | null | undefined) => Number(value ?? 0);
        return {
            points: rows.map(row => ({
                sampledAt: String(row.sampled_at),
                cpuPercent: number(row.cpu_percent),
                ramPercent: number(row.ram_percent),
                ramUsed: number(row.ram_used),
                ramTotal: number(row.ram_total),
            })),
            stats: {
                cpuAverage: number(aggregate?.cpu_average),
                cpuMax: number(aggregate?.cpu_max),
                ramAverage: number(aggregate?.ram_average),
                ramMax: number(aggregate?.ram_max),
            },
            from: fromIso,
            to: toIso,
            bucketSeconds,
        };
    }

    async clear(): Promise<void> {
        await R.exec("DELETE FROM monitoring_history");
    }
}
