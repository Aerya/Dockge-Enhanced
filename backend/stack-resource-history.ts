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
        // Sum simultaneous replicas first, then average/downsample those service totals.
        // Grouping raw rows directly would dilute the average or add sequential versions.
        const serviceSamples = `SELECT service_name, sampled_at, SUM(cpu_percent) AS cpu_percent, SUM(mem_used) AS mem_used
             FROM container_resource_history WHERE stack_name = ? AND sampled_at >= ? AND sampled_at <= ?
             GROUP BY service_name, sampled_at`;
        const summaries = await this.database.getAll(
            `WITH service_samples AS (${serviceSamples})
             SELECT service_name, AVG(cpu_percent) AS cpu_average, MAX(cpu_percent) AS cpu_max,
                    AVG(mem_used) AS mem_average, MAX(mem_used) AS mem_max,
                    MAX(sampled_at) AS last_sampled_at, COUNT(*) AS samples
             FROM service_samples GROUP BY service_name ORDER BY service_name ASC LIMIT 200`,
            bindings,
        );
        const serviceBucketSeconds = Math.max(bucketSeconds, Math.ceil((to.getTime() - recordedFrom.getTime()) / 1000 / 120 / 300) * 300);
        const serviceRows = summaries.length ? await this.database.getAll(
            `WITH service_samples AS (${serviceSamples})
             SELECT service_name, MIN(sampled_at) AS sampled_at,
                    AVG(cpu_percent) AS cpu_percent, AVG(mem_used) AS mem_used
             FROM service_samples WHERE service_name IN (${summaries.map(() => "?").join(", ")})
             GROUP BY service_name, CAST((strftime('%s', sampled_at) - ?) / ? AS INTEGER)
             ORDER BY sampled_at ASC`,
            [ ...bindings, ...summaries.map(row => String(row.service_name)), Math.floor(recordedFrom.getTime() / 1000), serviceBucketSeconds ],
        ) : [];
        const count = await this.database.getRow(
            "SELECT COUNT(DISTINCT service_name) AS total FROM container_resource_history WHERE stack_name = ? AND sampled_at >= ? AND sampled_at <= ?",
            bindings,
        );
        const pointsByService = new Map<string, Array<{ sampledAt: string;
            cpuPercent: number;
            memUsed: number }>>();
        for (const row of serviceRows) {
            const key = String(row.service_name);
            const points = pointsByService.get(key) ?? [];
            points.push({ sampledAt: String(row.sampled_at),
                cpuPercent: Number(row.cpu_percent),
                memUsed: Number(row.mem_used) });
            pointsByService.set(key, points);
        }
        const services = summaries.map(row => ({
            name: String(row.service_name),
            lastSampledAt: String(row.last_sampled_at),
            samples: Number(row.samples),
            cpuAverage: Number(row.cpu_average),
            cpuMax: Number(row.cpu_max),
            memAverage: Number(row.mem_average),
            memMax: Number(row.mem_max),
            points: pointsByService.get(String(row.service_name)) ?? [],
        }));
        const serviceCount = Number(count?.total ?? 0);
        return {
            services,
            serviceCount,
            serviceBucketSeconds,
            // Retain the response shape for older linked WebUIs, with service totals.
            containers: services.map(service => ({ ...service,
                id: service.name,
                service: service.name })),
            containerCount: serviceCount,
            containerBucketSeconds: serviceBucketSeconds,
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
