import { R } from "redbean-node";
import { historyBucketSeconds, historyStartDate } from "./monitoring-history";
import { log } from "./log";
import type { StackResourceStat, ContainerResourceStat } from "./stack-resource-stats";

export const STACK_HISTORY_PRESETS = [ "24h", "7d", "1m", "1y", "all" ] as const;
export type StackHistoryPreset = typeof STACK_HISTORY_PRESETS[number];
const SAMPLE_INTERVAL = 5 * 60_000;

interface HistoryDatabase {
    exec(sql: string, bindings: Array<string | number>): Promise<void>;
    getAll(sql: string, bindings: Array<string | number>): Promise<Array<Record<string, unknown>>>;
    getRow(sql: string, bindings: Array<string | number>): Promise<Record<string, unknown> | null>;
}

interface ResourceSample {
    data: Record<string, StackResourceStat>;
    available?: boolean;
    sampledAt?: string | null;
    instances?: Record<string, ContainerResourceStat>;
}

export function stackHistoryPreset(value: unknown = "24h"): StackHistoryPreset {
    if (typeof value !== "string" || !STACK_HISTORY_PRESETS.includes(value as StackHistoryPreset)) {
        throw new Error("Invalid stack resource history period");
    }
    return value as StackHistoryPreset;
}

export function assertHistoryStackName(value: unknown): asserts value is string {
    if (typeof value !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,199}$/.test(value)) {
        throw new Error("Invalid stack resource history target");
    }
}

async function collectResources(): Promise<ResourceSample> {
    const { getStackStatsSnapshot } = await import("./routers/system-stats-router");
    return getStackStatsSnapshot(true);
}

/** Uses the shared Docker collector, including when no browser is connected. */
export class StackResourceHistoryCollector {
    private static instance: StackResourceHistoryCollector;
    private timer: NodeJS.Timeout | null = null;
    private enabled = false;
    private sampling = false;
    private generation = 0;

    constructor(
        private readonly collect: () => Promise<ResourceSample> = collectResources,
        private readonly database: HistoryDatabase = R,
        private readonly now: () => Date = () => new Date(),
    ) {}

    static getInstance(): StackResourceHistoryCollector {
        StackResourceHistoryCollector.instance ??= new StackResourceHistoryCollector();
        return StackResourceHistoryCollector.instance;
    }

    async setEnabled(enabled: boolean): Promise<void> {
        if (enabled === this.enabled) {
            return;
        }
        this.enabled = enabled;
        this.generation++;
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
        if (!enabled) {
            return;
        }
        this.timer = setInterval(() => void this.sample().catch(error => {
            log.warn("StackResourceHistory", `Sample unavailable: ${String(error)}`);
        }), SAMPLE_INTERVAL);
        this.timer.unref?.();
        try {
            await this.sample();
        } catch (error) {
            log.warn("StackResourceHistory", `Initial sample unavailable: ${String(error)}`);
        }
    }

    async sample(): Promise<void> {
        if (!this.enabled || this.sampling) {
            return;
        }
        this.sampling = true;
        const generation = this.generation;
        try {
            const sample = await this.collect();
            if (!this.enabled || generation !== this.generation || sample.available === false) {
                return;
            }
            const sampledAt = sample.sampledAt ?? this.now().toISOString();
            const rows = Object.entries(sample.data).filter(([ name, stat ]) =>
                /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,199}$/.test(name) &&
                Number.isFinite(stat.cpu) && stat.cpu >= 0 && Number.isFinite(stat.memUsed) && stat.memUsed >= 0
            );
            for (let index = 0; index < rows.length; index += 200) {
                if (!this.enabled || generation !== this.generation) {
                    break;
                }
                const chunk = rows.slice(index, index + 200);
                await this.database.exec(
                    `INSERT INTO stack_resource_history (stack_name, sampled_at, cpu_percent, mem_used)
                     VALUES ${chunk.map(() => "(?, ?, ?, ?)").join(", ")}
                     ON CONFLICT (stack_name, sampled_at) DO NOTHING`,
                    chunk.flatMap(([ name, stat ]) => [ name, sampledAt, stat.cpu, stat.memUsed ]),
                );
            }
            const instances = Object.entries(sample.instances ?? {}).filter(([ id, stat ]) =>
                /^[a-f0-9]{12,64}$/.test(id) &&
                /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,199}$/.test(stat.project) &&
                Number.isFinite(stat.cpu) && stat.cpu >= 0 && Number.isFinite(stat.memUsed) && stat.memUsed >= 0
            );
            for (let index = 0; index < instances.length; index += 100) {
                if (!this.enabled || generation !== this.generation) {
                    break;
                }
                const chunk = instances.slice(index, index + 100);
                await this.database.exec(
                    `INSERT INTO container_resource_history
                     (stack_name, container_id, container_name, service_name, sampled_at, cpu_percent, mem_used)
                     VALUES ${chunk.map(() => "(?, ?, ?, ?, ?, ?, ?)").join(", ")}
                     ON CONFLICT (container_id, sampled_at) DO NOTHING`,
                    chunk.flatMap(([ id, stat ]) => [ stat.project, id, stat.name, stat.service, sampledAt, stat.cpu, stat.memUsed ]),
                );
            }
        } finally {
            this.sampling = false;
        }
    }

    async read(stackName: string, preset: StackHistoryPreset = "24h") {
        assertHistoryStackName(stackName);
        stackHistoryPreset(preset);
        const to = this.now();
        const ranges = {
            "24h": [ 1, "days" ],
            "7d": [ 7, "days" ],
            "1m": [ 1, "months" ],
            "1y": [ 1, "years" ],
        } as const;
        let from: Date;
        if (preset === "all") {
            const oldest = await this.database.getRow(
                "SELECT MIN(sampled_at) AS oldest FROM stack_resource_history WHERE stack_name = ?",
                [ stackName ],
            );
            from = oldest?.oldest ? new Date(String(oldest.oldest)) : historyStartDate(1, "days", to);
        } else {
            const [ amount, unit ] = ranges[preset];
            from = historyStartDate(amount, unit, to);
        }
        const bindings = [ stackName, from.toISOString(), to.toISOString() ];
        const aggregate = await this.database.getRow(
            `SELECT AVG(cpu_percent) AS cpu_average, MAX(cpu_percent) AS cpu_max,
                    AVG(mem_used) AS mem_average, MAX(mem_used) AS mem_max, COUNT(*) AS samples,
                    MAX(sampled_at) AS last_sampled_at, MIN(sampled_at) AS first_sampled_at
             FROM stack_resource_history WHERE stack_name = ? AND sampled_at >= ? AND sampled_at <= ?`,
            bindings,
        );
        const recordedFrom = aggregate?.first_sampled_at ? new Date(String(aggregate.first_sampled_at)) : from;
        const bucketSeconds = historyBucketSeconds(recordedFrom, to);
        const rows = await this.database.getAll(
            `SELECT MIN(sampled_at) AS sampled_at, AVG(cpu_percent) AS cpu_percent,
                    AVG(mem_used) AS mem_used, COUNT(*) AS samples
             FROM stack_resource_history WHERE stack_name = ? AND sampled_at >= ? AND sampled_at <= ?
             GROUP BY CAST((strftime('%s', sampled_at) - ?) / ? AS INTEGER) ORDER BY sampled_at ASC`,
            [ ...bindings, Math.floor(recordedFrom.getTime() / 1000), bucketSeconds ],
        );
        const containerSummaries = await this.database.getAll(
            `SELECT h.container_id, h.container_name, h.service_name,
                    summary.cpu_average, summary.cpu_max, summary.mem_average, summary.mem_max,
                    summary.last_sampled_at, summary.samples
             FROM container_resource_history h
             JOIN (SELECT container_id, MAX(sampled_at) AS last_sampled_at,
                          AVG(cpu_percent) AS cpu_average, MAX(cpu_percent) AS cpu_max,
                          AVG(mem_used) AS mem_average, MAX(mem_used) AS mem_max, COUNT(*) AS samples
                   FROM container_resource_history WHERE stack_name = ? AND sampled_at >= ? AND sampled_at <= ?
                   GROUP BY container_id) summary
               ON summary.container_id = h.container_id AND summary.last_sampled_at = h.sampled_at
             ORDER BY summary.last_sampled_at DESC, h.container_name ASC LIMIT 200`,
            bindings,
        );
        const containerBucketSeconds = Math.max(bucketSeconds, Math.ceil((to.getTime() - recordedFrom.getTime()) / 1000 / 120 / 300) * 300);
        const containerRows = containerSummaries.length ? await this.database.getAll(
            `SELECT container_id, MIN(sampled_at) AS sampled_at,
                    AVG(cpu_percent) AS cpu_percent, AVG(mem_used) AS mem_used
             FROM container_resource_history WHERE stack_name = ? AND sampled_at >= ? AND sampled_at <= ?
               AND container_id IN (${containerSummaries.map(() => "?").join(", ")})
             GROUP BY container_id, CAST((strftime('%s', sampled_at) - ?) / ? AS INTEGER)
             ORDER BY sampled_at ASC`,
            [ ...bindings, ...containerSummaries.map(row => String(row.container_id)), Math.floor(from.getTime() / 1000), containerBucketSeconds ],
        ) : [];
        const containerCount = await this.database.getRow(
            "SELECT COUNT(DISTINCT container_id) AS total FROM container_resource_history WHERE stack_name = ? AND sampled_at >= ? AND sampled_at <= ?",
            bindings,
        );
        const pointsByContainer = new Map<string, Array<{ sampledAt: string;
            cpuPercent: number;
            memUsed: number }>>();
        for (const row of containerRows) {
            const key = String(row.container_id);
            const points = pointsByContainer.get(key) ?? [];
            points.push({ sampledAt: String(row.sampled_at),
                cpuPercent: Number(row.cpu_percent),
                memUsed: Number(row.mem_used) });
            pointsByContainer.set(key, points);
        }
        return {
            containers: containerSummaries.map(row => ({
                id: String(row.container_id),
                name: String(row.container_name),
                service: String(row.service_name),
                lastSampledAt: String(row.last_sampled_at),
                cpuAverage: Number(row.cpu_average),
                cpuMax: Number(row.cpu_max),
                memAverage: Number(row.mem_average),
                memMax: Number(row.mem_max),
                points: pointsByContainer.get(String(row.container_id)) ?? [],
            })),
            containerCount: Number(containerCount?.total ?? 0),
            containerBucketSeconds,
            points: rows.map(row => ({ sampledAt: String(row.sampled_at),
                cpuPercent: Number(row.cpu_percent),
                memUsed: Number(row.mem_used),
                samples: Number(row.samples) })),
            stats: { cpuAverage: Number(aggregate?.cpu_average ?? 0),
                cpuMax: Number(aggregate?.cpu_max ?? 0),
                memAverage: Number(aggregate?.mem_average ?? 0),
                memMax: Number(aggregate?.mem_max ?? 0),
                samples: Number(aggregate?.samples ?? 0),
                lastSampledAt: aggregate?.last_sampled_at ? String(aggregate.last_sampled_at) : null },
            from: from.toISOString(),
            to: to.toISOString(),
            bucketSeconds,
        };
    }
}
