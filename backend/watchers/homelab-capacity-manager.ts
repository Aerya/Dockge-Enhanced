import path from "path";
import * as fs from "node:fs";
import { execFile } from "child_process";
import { promisify } from "util";
import { Cron } from "croner";
import { log } from "../log";
import { isLowPower } from "../low-power";

const execFileAsync = promisify(execFile);
const DATA_DIR = process.env.DOCKGE_DATA_DIR ?? "/opt/dockge/data";
const SETTINGS_PATH = path.join(DATA_DIR, "homelab-capacity-settings.json");
const HISTORY_PATH = path.join(DATA_DIR, "homelab-capacity-history.json");
const DOCKER_TIMEOUT_MS = 45_000;
const DU_TIMEOUT_MS = 30_000;

export interface HomelabCapacitySettings {
    enabled: boolean;
    intervalHours: 24 | 48 | 168;
    historyDays: number;
    runInLowPower: boolean;
    includeBindMounts: boolean;
    oldImageDays: number;
    lastScanAt?: string;
    lastScanDurationMs?: number;
    lastScanResult?: string;
}

export interface CapacityContainer {
    id: string;
    name: string;
    image: string;
    state: string;
    status: string;
    stackName?: string;
    service?: string;
    logPath?: string;
    logBytes: number | null;
    writableBytes: number | null;
}

export interface CapacityVolume {
    name: string;
    driver?: string;
    mountpoint?: string;
    sizeBytes: number | null;
    status: "running" | "stopped" | "orphan";
    containers: string[];
    stacks: string[];
    services: string[];
    warning?: string;
}

export interface CapacityImage {
    id: string;
    repository: string;
    tag: string;
    name: string;
    size: string;
    sizeBytes: number | null;
    createdAt?: string;
    ageDays: number | null;
    status: "used" | "unused" | "dangling" | "old-unused";
    containers: string[];
    stacks: string[];
}

export interface CapacityStack {
    name: string;
    services: string[];
    containers: number;
    volumeBytes: number;
    imageBytes: number;
    logBytes: number;
    totalKnownBytes: number;
    unknownVolumes: number;
}

export interface CapacitySnapshot {
    timestamp: string;
    durationMs: number;
    totals: {
        totalKnownBytes: number;
        volumeBytes: number;
        imageBytes: number;
        logBytes: number;
        orphanVolumeBytes: number;
        oldUnusedImageBytes: number;
        unknownVolumes: number;
        volumes: number;
        images: number;
        containers: number;
    };
    stacks: CapacityStack[];
    volumes: CapacityVolume[];
    images: CapacityImage[];
    containers: CapacityContainer[];
    warnings: string[];
}

export interface CapacitySummary {
    settings: HomelabCapacitySettings & { nextRun: string | null; running: boolean };
    snapshot: CapacitySnapshot | null;
    growth: {
        sincePreviousBytes: number | null;
        sevenDaysBytes: number | null;
        previousAt: string | null;
        sevenDaysAt: string | null;
    };
    history: Array<{ timestamp: string; totalKnownBytes: number }>;
}

const DEFAULTS: HomelabCapacitySettings = {
    enabled: false,
    intervalHours: 24,
    historyDays: 30,
    runInLowPower: false,
    includeBindMounts: false,
    oldImageDays: 90,
};

function readJson<T>(file: string, fallback: T): T {
    try {
        return JSON.parse(fs.readFileSync(file, "utf-8")) as T;
    } catch {
        return fallback;
    }
}

function writeJson(file: string, value: unknown): void {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(file, JSON.stringify(value, null, 2), "utf-8");
}

async function dockerJsonLines(args: string[]): Promise<Record<string, string>[]> {
    const { stdout } = await execFileAsync("docker", args, {
        maxBuffer: 20 * 1024 * 1024,
        timeout: DOCKER_TIMEOUT_MS,
    });
    return String(stdout || "")
        .trim()
        .split("\n")
        .filter(line => line.trim())
        .map(line => {
            try {
                return JSON.parse(line) as Record<string, string>;
            } catch {
                return null;
            }
        })
        .filter(Boolean) as Record<string, string>[];
}

async function dockerJson(args: string[]): Promise<any[]> {
    const { stdout } = await execFileAsync("docker", args, {
        maxBuffer: 30 * 1024 * 1024,
        timeout: DOCKER_TIMEOUT_MS,
    });
    const text = String(stdout || "").trim();
    return text ? JSON.parse(text) : [];
}

function parseDockerSize(value: string | undefined): number | null {
    if (!value) return null;
    const first = value.split("(")[0].trim().replace(/,/g, ".");
    const match = first.match(/^([\d.]+)\s*([KMGTPE]?i?B|B)$/i);
    if (!match) return null;
    const amount = Number(match[1]);
    if (!Number.isFinite(amount)) return null;
    const unit = match[2].toUpperCase();
    const factor: Record<string, number> = {
        B: 1,
        KB: 1_000,
        MB: 1_000_000,
        GB: 1_000_000_000,
        TB: 1_000_000_000_000,
        PB: 1_000_000_000_000_000,
        KIB: 1024,
        MIB: 1024 ** 2,
        GIB: 1024 ** 3,
        TIB: 1024 ** 4,
        PIB: 1024 ** 5,
    };
    return Math.round(amount * (factor[unit] ?? 1));
}

function ageDays(createdAt: string | undefined): number | null {
    if (!createdAt) return null;
    const parsed = new Date(createdAt);
    if (Number.isNaN(parsed.getTime())) return null;
    return Math.max(0, Math.floor((Date.now() - parsed.getTime()) / 86_400_000));
}

async function pathSize(target: string): Promise<{ bytes: number | null; warning?: string }> {
    if (!target || !fs.existsSync(target)) {
        return { bytes: null, warning: "path inaccessible from Dockge" };
    }
    try {
        const { stdout } = await execFileAsync("du", [ "-sb", target ], {
            timeout: DU_TIMEOUT_MS,
            maxBuffer: 512 * 1024,
        });
        const bytes = Number(String(stdout).trim().split(/\s+/)[0]);
        return Number.isFinite(bytes) ? { bytes } : { bytes: null, warning: "unable to parse du output" };
    } catch (e: any) {
        return { bytes: null, warning: e?.message ?? "du failed" };
    }
}

function label(labels: Record<string, string> | undefined, key: string): string | undefined {
    return labels?.[key] || undefined;
}

function unique(values: Array<string | undefined>): string[] {
    return [ ...new Set(values.filter(Boolean) as string[]) ].sort((a, b) => a.localeCompare(b));
}

export class HomelabCapacityManager {
    private static instance?: HomelabCapacityManager;
    private settings: HomelabCapacitySettings = { ...DEFAULTS };
    private cron: Cron | null = null;
    private runningPromise: Promise<CapacitySnapshot> | null = null;

    static getInstance(): HomelabCapacityManager {
        if (!HomelabCapacityManager.instance) {
            HomelabCapacityManager.instance = new HomelabCapacityManager();
        }
        return HomelabCapacityManager.instance;
    }

    async startIfEnabled(): Promise<void> {
        this.loadSettings();
        this.reschedule();
    }

    getSettings(): HomelabCapacitySettings & { nextRun: string | null; running: boolean } {
        this.loadSettings();
        return {
            ...this.settings,
            nextRun: this.nextRun(),
            running: this.runningPromise !== null,
        };
    }

    async updateSettings(partial: Partial<HomelabCapacitySettings>): Promise<HomelabCapacitySettings> {
        this.loadSettings();
        this.settings = {
            ...this.settings,
            ...partial,
            intervalHours: this.normalizeInterval(partial.intervalHours ?? this.settings.intervalHours),
            historyDays: Math.min(Math.max(Number(partial.historyDays ?? this.settings.historyDays) || 30, 1), 3650),
            oldImageDays: Math.min(Math.max(Number(partial.oldImageDays ?? this.settings.oldImageDays) || 90, 1), 3650),
        };
        this.saveSettings();
        this.reschedule();
        return this.settings;
    }

    getSummary(): CapacitySummary {
        this.loadSettings();
        const history = this.loadHistory();
        const snapshot = history.at(-1) ?? null;
        const previous = history.length > 1 ? history[history.length - 2] : null;
        const sevenDays = this.findSnapshotNear(history, Date.now() - 7 * 86_400_000);
        return {
            settings: this.getSettings(),
            snapshot,
            growth: {
                sincePreviousBytes: snapshot && previous ? snapshot.totals.totalKnownBytes - previous.totals.totalKnownBytes : null,
                sevenDaysBytes: snapshot && sevenDays ? snapshot.totals.totalKnownBytes - sevenDays.totals.totalKnownBytes : null,
                previousAt: previous?.timestamp ?? null,
                sevenDaysAt: sevenDays?.timestamp ?? null,
            },
            history: history.map(item => ({
                timestamp: item.timestamp,
                totalKnownBytes: item.totals.totalKnownBytes,
            })),
        };
    }

    async runScan(manual = false): Promise<CapacitySnapshot> {
        this.loadSettings();
        if (!manual && !this.settings.enabled) {
            throw new Error("Homelab capacity scan is disabled");
        }
        if (!manual && isLowPower() && !this.settings.runInLowPower) {
            const skipped = "Skipped because Synology / low-power mode is enabled";
            this.settings.lastScanResult = skipped;
            this.saveSettings();
            throw new Error(skipped);
        }
        if (this.runningPromise) {
            return this.runningPromise;
        }
        this.runningPromise = this.collectSnapshot()
            .then(snapshot => {
                this.appendSnapshot(snapshot);
                this.settings.lastScanAt = snapshot.timestamp;
                this.settings.lastScanDurationMs = snapshot.durationMs;
                this.settings.lastScanResult = `OK: ${snapshot.totals.totalKnownBytes} bytes tracked`;
                this.saveSettings();
                return snapshot;
            })
            .catch(e => {
                this.settings.lastScanAt = new Date().toISOString();
                this.settings.lastScanResult = `Error: ${e?.message ?? e}`;
                this.saveSettings();
                throw e;
            })
            .finally(() => {
                this.runningPromise = null;
            });
        return this.runningPromise;
    }

    private loadSettings(): void {
        this.settings = {
            ...DEFAULTS,
            ...readJson<Partial<HomelabCapacitySettings>>(SETTINGS_PATH, {}),
        };
    }

    private saveSettings(): void {
        writeJson(SETTINGS_PATH, this.settings);
    }

    private loadHistory(): CapacitySnapshot[] {
        return readJson<CapacitySnapshot[]>(HISTORY_PATH, []);
    }

    private appendSnapshot(snapshot: CapacitySnapshot): void {
        const cutoff = Date.now() - this.settings.historyDays * 86_400_000;
        const history = this.loadHistory()
            .filter(item => new Date(item.timestamp).getTime() >= cutoff)
            .concat(snapshot);
        writeJson(HISTORY_PATH, history);
    }

    private reschedule(): void {
        if (this.cron) {
            this.cron.stop();
            this.cron = null;
        }
        if (!this.settings.enabled) return;
        this.cron = new Cron("17 * * * *", { protect: true }, async () => {
            if (!this.shouldRunNow()) return;
            try {
                await this.runScan(false);
            } catch (e) {
                log.warn("HomelabCapacity", String(e));
            }
        });
        log.info("HomelabCapacity", `Enabled, interval ${this.settings.intervalHours}h`);
    }

    private shouldRunNow(): boolean {
        if (!this.settings.enabled) return false;
        if (this.settings.lastScanAt) {
            const elapsed = Date.now() - new Date(this.settings.lastScanAt).getTime();
            if (elapsed < this.settings.intervalHours * 3_600_000) return false;
        }
        return true;
    }

    private nextRun(): string | null {
        if (!this.settings.enabled) return null;
        if (!this.settings.lastScanAt) return new Date().toISOString();
        return new Date(new Date(this.settings.lastScanAt).getTime() + this.settings.intervalHours * 3_600_000).toISOString();
    }

    private normalizeInterval(value: unknown): 24 | 48 | 168 {
        return value === 48 || value === 168 ? value : 24;
    }

    private findSnapshotNear(history: CapacitySnapshot[], targetTime: number): CapacitySnapshot | null {
        const older = history.filter(item => new Date(item.timestamp).getTime() <= targetTime);
        return older.at(-1) ?? null;
    }

    private async collectSnapshot(): Promise<CapacitySnapshot> {
        const started = Date.now();
        const warnings: string[] = [];
        const timestamp = new Date().toISOString();

        const containersRaw = await dockerJsonLines([ "ps", "-a", "--size", "--format", "{{json .}}" ]);
        const ids = containersRaw.map(c => c["ID"]).filter(Boolean);
        let inspectData: any[] = [];
        if (ids.length > 0) {
            try {
                inspectData = await dockerJson([ "inspect", ...ids ]);
            } catch (e: any) {
                warnings.push(`Unable to inspect containers: ${e?.message ?? e}`);
            }
        }

        const inspectByShortId = new Map<string, any>();
        for (const item of inspectData) {
            inspectByShortId.set(String(item.Id || "").slice(0, 12), item);
        }

        const containers: CapacityContainer[] = [];
        for (const raw of containersRaw) {
            const id = raw["ID"] ?? "";
            const inspect = inspectByShortId.get(id);
            const labels = inspect?.Config?.Labels ?? {};
            const logPath = inspect?.LogPath || undefined;
            let logBytes: number | null = null;
            if (logPath) {
                try {
                    logBytes = fs.statSync(logPath).size;
                } catch {
                    logBytes = null;
                }
            }
            containers.push({
                id,
                name: (raw["Names"] ?? inspect?.Name ?? "").replace(/^\//, ""),
                image: raw["Image"] ?? inspect?.Config?.Image ?? "",
                state: raw["State"] ?? inspect?.State?.Status ?? "",
                status: raw["Status"] ?? inspect?.State?.Status ?? "",
                stackName: label(labels, "com.docker.compose.project"),
                service: label(labels, "com.docker.compose.service"),
                logPath,
                logBytes,
                writableBytes: parseDockerSize(raw["Size"]),
            });
        }

        const volumes = await this.collectVolumes(inspectData, warnings);
        const images = await this.collectImages(containers, warnings);
        const stacks = this.buildStacks(containers, volumes, images);

        const bindMountBytes = this.settings.includeBindMounts
            ? await this.addBindMountsToStacks(inspectData, stacks, warnings)
            : 0;

        const volumeBytes = volumes.reduce((sum, item) => sum + (item.sizeBytes ?? 0), 0);
        const imageBytes = images.reduce((sum, item) => sum + (item.sizeBytes ?? 0), 0);
        const logBytes = containers.reduce((sum, item) => sum + (item.logBytes ?? 0), 0);

        const totals = {
            totalKnownBytes: volumeBytes + imageBytes + logBytes + bindMountBytes,
            volumeBytes,
            imageBytes,
            logBytes,
            orphanVolumeBytes: volumes.filter(item => item.status === "orphan").reduce((sum, item) => sum + (item.sizeBytes ?? 0), 0),
            oldUnusedImageBytes: images.filter(item => item.status === "old-unused").reduce((sum, item) => sum + (item.sizeBytes ?? 0), 0),
            unknownVolumes: volumes.filter(item => item.sizeBytes === null).length,
            volumes: volumes.length,
            images: images.length,
            containers: containers.length,
        };

        return {
            timestamp,
            durationMs: Date.now() - started,
            totals,
            stacks,
            volumes: volumes.sort((a, b) => (b.sizeBytes ?? -1) - (a.sizeBytes ?? -1)),
            images: images.sort((a, b) => (b.sizeBytes ?? -1) - (a.sizeBytes ?? -1)),
            containers: containers.sort((a, b) => (b.logBytes ?? -1) - (a.logBytes ?? -1)),
            warnings,
        };
    }

    private async collectVolumes(inspectData: any[], warnings: string[]): Promise<CapacityVolume[]> {
        let rawVolumes: Record<string, string>[] = [];
        try {
            rawVolumes = await dockerJsonLines([ "volume", "ls", "--format", "{{json .}}" ]);
        } catch (e: any) {
            warnings.push(`Unable to list volumes: ${e?.message ?? e}`);
            return [];
        }

        const names = rawVolumes.map(volume => volume["Name"]).filter(Boolean);
        let inspectedVolumes: any[] = [];
        if (names.length > 0) {
            try {
                inspectedVolumes = await dockerJson([ "volume", "inspect", ...names ]);
            } catch (e: any) {
                warnings.push(`Unable to inspect volumes: ${e?.message ?? e}`);
            }
        }
        const inspectByName = new Map<string, any>(inspectedVolumes.map(volume => [ volume.Name, volume ]));

        const result: CapacityVolume[] = [];
        for (const raw of rawVolumes) {
            const name = raw["Name"] ?? "";
            const inspected = inspectByName.get(name);
            const containersUsing = inspectData.filter(container =>
                ((container.Mounts ?? []) as any[]).some(mount => mount.Type === "volume" && mount.Name === name)
            );
            const running = containersUsing.some(container => container.State?.Status === "running" || container.State?.Status === "restarting");
            const size = await pathSize(inspected?.Mountpoint ?? raw["Mountpoint"] ?? "");
            if (size.warning && inspected?.Mountpoint) {
                warnings.push(`${name}: ${size.warning}`);
            }
            result.push({
                name,
                driver: inspected?.Driver ?? raw["Driver"],
                mountpoint: inspected?.Mountpoint ?? raw["Mountpoint"],
                sizeBytes: size.bytes,
                status: containersUsing.length === 0 ? "orphan" : running ? "running" : "stopped",
                containers: unique(containersUsing.map(container => String(container.Name ?? "").replace(/^\//, ""))),
                stacks: unique(containersUsing.map(container => label(container.Config?.Labels, "com.docker.compose.project"))),
                services: unique(containersUsing.map(container => label(container.Config?.Labels, "com.docker.compose.service"))),
                warning: size.warning,
            });
        }
        return result;
    }

    private async collectImages(containers: CapacityContainer[], warnings: string[]): Promise<CapacityImage[]> {
        let rawImages: Record<string, string>[] = [];
        try {
            rawImages = await dockerJsonLines([ "image", "ls", "-a", "--format", "{{json .}}" ]);
        } catch (e: any) {
            warnings.push(`Unable to list images: ${e?.message ?? e}`);
            return [];
        }

        const usedByImage = new Map<string, CapacityContainer[]>();
        for (const container of containers) {
            const list = usedByImage.get(container.image) ?? [];
            list.push(container);
            usedByImage.set(container.image, list);
        }

        return rawImages.map(raw => {
            const repository = raw["Repository"] ?? "";
            const tag = raw["Tag"] ?? "";
            const id = raw["ID"] ?? "";
            const dangling = repository === "<none>" && tag === "<none>";
            const name = dangling ? id : `${repository}:${tag}`;
            const usedContainers = [
                ...(usedByImage.get(name) ?? []),
                ...(usedByImage.get(id) ?? []),
            ];
            const age = ageDays(raw["CreatedAt"]);
            let status: CapacityImage["status"] = usedContainers.length > 0 ? "used" : "unused";
            if (dangling) status = "dangling";
            else if (status === "unused" && age !== null && age >= this.settings.oldImageDays) status = "old-unused";
            return {
                id,
                repository,
                tag,
                name,
                size: raw["Size"] ?? "",
                sizeBytes: parseDockerSize(raw["Size"]),
                createdAt: raw["CreatedAt"],
                ageDays: age,
                status,
                containers: unique(usedContainers.map(item => item.name)),
                stacks: unique(usedContainers.map(item => item.stackName)),
            };
        });
    }

    private buildStacks(containers: CapacityContainer[], volumes: CapacityVolume[], images: CapacityImage[]): CapacityStack[] {
        const stackNames = unique([
            ...containers.map(item => item.stackName),
            ...volumes.flatMap(item => item.stacks),
            ...images.flatMap(item => item.stacks),
        ]);

        return stackNames.map(name => {
            const stackContainers = containers.filter(item => item.stackName === name);
            const stackVolumes = volumes.filter(item => item.stacks.includes(name));
            const stackImages = images.filter(item => item.stacks.includes(name));
            const volumeBytes = stackVolumes.reduce((sum, item) => sum + (item.sizeBytes ?? 0), 0);
            const imageBytes = stackImages.reduce((sum, item) => sum + (item.sizeBytes ?? 0), 0);
            const logBytes = stackContainers.reduce((sum, item) => sum + (item.logBytes ?? 0), 0);
            return {
                name,
                services: unique(stackContainers.map(item => item.service)),
                containers: stackContainers.length,
                volumeBytes,
                imageBytes,
                logBytes,
                totalKnownBytes: volumeBytes + imageBytes + logBytes,
                unknownVolumes: stackVolumes.filter(item => item.sizeBytes === null).length,
            };
        }).sort((a, b) => b.totalKnownBytes - a.totalKnownBytes);
    }

    private async addBindMountsToStacks(inspectData: any[], stacks: CapacityStack[], warnings: string[]): Promise<number> {
        const stackByName = new Map(stacks.map(stack => [ stack.name, stack ]));
        const measured = new Set<string>();
        let total = 0;
        for (const container of inspectData) {
            const stackName = label(container.Config?.Labels, "com.docker.compose.project");
            const stack = stackName ? stackByName.get(stackName) : null;
            if (!stack) continue;
            for (const mount of (container.Mounts ?? []) as any[]) {
                if (mount.Type !== "bind" || !mount.Source) continue;
                if (measured.has(mount.Source)) continue;
                measured.add(mount.Source);
                const size = await pathSize(mount.Source);
                if (size.bytes !== null) {
                    stack.volumeBytes += size.bytes;
                    stack.totalKnownBytes += size.bytes;
                    total += size.bytes;
                } else if (size.warning) {
                    warnings.push(`${container.Name ?? "container"} bind ${mount.Source}: ${size.warning}`);
                }
            }
        }
        return total;
    }
}
