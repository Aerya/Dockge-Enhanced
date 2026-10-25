import { createHash, randomUUID } from "node:crypto";
import { mkdir, open, readdir, readFile, rename, unlink } from "node:fs/promises";
import path from "node:path";
import { RolloutRelay } from "./rollout-relay";
import type { DockerRun } from "./service-rollout";
import { LABEL_RELAY_OWNER, LABEL_RELAY_PORT, RELAY_IMAGE } from "../common/rollout-relay";
import { ROLLOUT_DRAIN_FILE } from "../common/service-rollout";
import { markRolloutDraining, registerPendingRollout, releasePendingRollout, withRolloutRecovery } from "./stack-mutation";
import { tryReserveDockerUpdate } from "./self-update/operation-coordinator";

type Phase = "preparing" | "draining" | "retiring" | "cancelling" | "completed" | "cancelled";
interface Identity { id: string;
    image: string }
export interface RolloutRecord {
    version: 1;
    id: string;
    directory: string;
    project: string;
    service: string;
    targetImage: string;
    old: Identity[];
    next: Identity[];
    phase: Phase;
    updatedAt: string;
    relay?: { id: string;
        service: string;
        port: number;
        origin: string };
    problem?: string;
}
interface Inspected {
    Id: string;
    Name: string;
    Image: string;
    State: { Running: boolean;
        Paused?: boolean;
        StartedAt: string;
        Health?: { Status: string } };
    Config: { Image: string;
        Labels: Record<string, string> };
    Mounts?: { RW: boolean }[];
    HostConfig?: { PortBindings?: Record<string, unknown> };
}
const records = new Map<string, RolloutRecord>();
const stores = new Map<string, RolloutRecovery>();
const terminal = (record: RolloutRecord) => record.phase === "completed" || record.phase === "cancelled";
const keyFor = (directory: string, service: string) => createHash("sha256").update(directory + "\0" + service).digest("hex");
const identifier = (value: unknown): value is string => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
const imageID = (value: unknown): value is string => typeof value === "string" && /^sha256:[a-f0-9]{64}$/.test(value);
const name = (value: unknown): value is string => typeof value === "string" && /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/.test(value);
const identities = (value: unknown): value is Identity[] => Array.isArray(value) && value.length <= 16 && value.every(item =>
    item && identifier(item.id) && imageID(item.image)) && new Set(value.map(item => item.id)).size === value.length;

/** Do not trust persisted paths, container references or phase transitions. */
export function parseRolloutRecord(text: string): RolloutRecord {
    const value = JSON.parse(text) as Partial<RolloutRecord>;
    if (value.version !== 1 || !identifier(value.id) || typeof value.directory !== "string" ||
        !path.isAbsolute(value.directory) || path.resolve(value.directory) !== value.directory ||
        !name(value.project) || !name(value.service) || !imageID(value.targetImage) ||
        !identities(value.old) || !value.old.length || !identities(value.next) ||
        value.next.some(item => item.image !== value.targetImage || value.old!.some(old => old.id === item.id)) ||
        ![ "preparing", "draining", "retiring", "cancelling", "completed", "cancelled" ].includes(value.phase ?? "") ||
        (value.phase !== "preparing" && value.phase !== "cancelled" && value.next.length !== value.old.length) ||
        value.id !== keyFor(value.directory, value.service) || typeof value.updatedAt !== "string" || !Number.isFinite(Date.parse(value.updatedAt))) {
        throw new Error("Invalid rolling update recovery record");
    }
    if (value.relay && (!identifier(value.relay.id) || !name(value.relay.service) || !name(value.relay.origin) ||
        !Number.isInteger(value.relay.port) || value.relay.port < 1 || value.relay.port > 65535)) {
        throw new Error("Invalid rolling update relay identity");
    }
    return value as RolloutRecord;
}

export function rolloutStates(directory: string, includeFinished = false): { service: string;
    phase: Phase;
    attention: boolean }[] {
    return [ ...records.values() ].filter(record => record.directory === path.resolve(directory) && (includeFinished || !terminal(record)))
        .map(record => ({ service: record.service,
            phase: record.phase,
            attention: !!record.problem }));
}

/**
 * Recovery only completes/undoes an already authorised transaction. It never
 * pulls, scales, runs Compose, accepts commands, or starts a new deployment.
 * Before commit it cancels; after commit it retires only the recorded old IDs.
 */
export class RolloutRecovery {
    private active = new Set<string>();
    private acknowledged = new Map<string, string>();
    private drainReleases = new Map<string, () => void>();
    private timer?: ReturnType<typeof setInterval>;
    private ticking = false;
    private owned = new Set<string>();

    constructor(readonly directory: string, private docker: DockerRun,
        private blocked: () => Promise<boolean>, private wait = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))) {}

    async load(): Promise<void> {
        await mkdir(this.directory, { recursive: true,
            mode: 0o700 });
        for (const file of await readdir(this.directory)) {
            if (!/^[a-f0-9]{64}\.json$/.test(file)) {
                continue;
            }
            // Fail closed at startup on corrupt journals instead of silently
            // allowing a second mutation over unknown leftover replicas.
            const record = parseRolloutRecord(await readFile(path.join(this.directory, file), "utf8"));
            if (file !== record.id + ".json") {
                throw new Error("Rolling update recovery filename mismatch");
            }
            records.set(record.id, record);
            this.owned.add(record.id);
            this.register(record);
        }
    }

    start(): void {
        this.timer ??= setInterval(() => {
            void this.tick().catch(() => console.error("[Rollout] Unable to persist recovery state; automatic operations remain reserved"));
        }, 10_000);
        this.timer.unref();
    }

    stop(): void {
        clearInterval(this.timer);
        this.timer = undefined;
    }

    private register(record: RolloutRecord): void {
        if (!terminal(record)) {
            registerPendingRollout(record.directory, record.id);
            if (!record.relay && record.phase !== "preparing" && !this.drainReleases.has(record.id)) {
                this.drainReleases.set(record.id, markRolloutDraining(record.old.map(item => item.id)));
            }
        } else {
            releasePendingRollout(record.directory, record.id);
            this.drainReleases.get(record.id)?.();
            this.drainReleases.delete(record.id);
            this.acknowledged.delete(record.id);
        }
    }

    async save(record: RolloutRecord): Promise<void> {
        record.updatedAt = new Date().toISOString();
        parseRolloutRecord(JSON.stringify(record));
        await mkdir(this.directory, { recursive: true,
            mode: 0o700 });
        const file = path.join(this.directory, record.id + ".json");
        const temporary = file + "." + randomUUID() + ".tmp";
        try {
            const handle = await open(temporary, "wx", 0o600);
            try {
                await handle.writeFile(JSON.stringify(record));
                await handle.sync();
            } finally {
                await handle.close();
            }
            await rename(temporary, file);
            records.set(record.id, structuredClone(record));
            this.owned.add(record.id);
            this.register(record);
            const directory = await open(this.directory, "r");
            try {
                await directory.sync();
            } finally {
                await directory.close();
            }
        } finally {
            await unlink(temporary).catch(() => {});
        }
        records.set(record.id, structuredClone(record));
        this.owned.add(record.id);
        this.register(record);
    }

    async begin(input: Omit<RolloutRecord, "version" | "id" | "phase" | "updatedAt" | "next">): Promise<RolloutRecord> {
        const id = keyFor(input.directory, input.service);
        const existing = records.get(id);
        if (existing && !terminal(existing)) {
            throw new Error("Rolling update already pending for this service");
        }
        const record: RolloutRecord = { ...input,
            version: 1,
            id,
            phase: "preparing",
            next: [],
            updatedAt: new Date().toISOString() };
        this.active.add(id);
        try {
            await this.save(record);
            return record;
        } catch (error) {
            this.active.delete(id);
            throw error;
        }
    }

    release(record: RolloutRecord): void {
        this.active.delete(record.id);
    }

    private async inspect(list: string[]): Promise<Inspected[]> {
        return list.length ? JSON.parse(await this.docker([ "inspect", ...list ], 15_000)) as Inspected[] : [];
    }

    private async inventory(record: RolloutRecord): Promise<Inspected[]> {
        const list = (await this.docker([ "ps", "-aq", "--no-trunc", "--filter", "label=com.docker.compose.project=" + record.project,
            "--filter", "label=com.docker.compose.service=" + record.service ], 15_000)).trim().split(/\s+/).filter(Boolean);
        if (list.some(id => !identifier(id))) {
            throw new Error("Invalid Docker inventory during rolling update recovery");
        }
        const containers = await this.inspect(list);
        if (containers.some(item => !identifier(item.Id) || item.Config.Labels["com.docker.compose.project"] !== record.project ||
            item.Config.Labels["com.docker.compose.service"] !== record.service ||
            item.Config.Labels["com.docker.compose.project.working_dir"] !== record.directory ||
            item.Mounts?.some(mount => mount.RW) || Object.keys(item.HostConfig?.PortBindings ?? {}).length ||
            (record.old.find(old => old.id === item.Id)?.image ?? record.targetImage) !== item.Image) ||
            containers.filter(item => !record.old.some(old => old.id === item.Id)).length > record.old.length) {
            throw new Error("Unexpected container identity during rolling update recovery; no removal performed");
        }
        return containers;
    }

    private healthy(items: Inspected[], expected: number): boolean {
        return items.length === expected && items.every(item => item.State.Running && !item.State.Paused && item.State.Health?.Status === "healthy");
    }

    async reconcile(record: RolloutRecord): Promise<void> {
        const all = await this.inventory(record);
        if (!all.length) {
            // An explicit external down removed the entire service. Do not
            // resurrect it or leave its now-empty stack permanently locked.
            record.phase = "cancelled";
            delete record.problem;
            await this.save(record);
            return;
        }
        const old = all.filter(item => record.old.some(previous => previous.id === item.Id));
        const next = all.filter(item => !record.old.some(previous => previous.id === item.Id));
        if (record.phase !== "preparing" && ((record.phase !== "cancelling" && next.length !== record.next.length) || next.some(item => !record.next.some(expected => expected.id === item.Id && expected.image === item.Image)))) {
            throw new Error("Replacement identity changed; automatic retirement suspended");
        }
        if ((record.phase === "draining" || record.phase === "retiring") && !this.healthy(next, record.old.length) &&
            old.length === record.old.length) {
            // A failed replacement is not a reason to abandon the service:
            // restore the recorded previous generation, never a guessed tag.
            record.phase = "cancelling";
            await this.save(record);
            this.acknowledged.delete(record.id);
        }
        const cancel = record.phase === "preparing" || record.phase === "cancelling";
        const keep = cancel ? old : next;
        const remove = cancel ? next : old;
        if (record.phase === "cancelling" && old.length === record.old.length) {
            for (const item of old.filter(item => !item.State.Running && !item.State.Paused)) {
                await this.docker([ "start", item.Id ], 30_000);
            }
            if (!record.relay) {
                for (const item of old.filter(item => item.State.Running)) {
                    await this.docker([ "exec", item.Id, "sh", "-c", "rm -f " + ROLLOUT_DRAIN_FILE ], 15_000);
                }
            }
        }
        if (!this.healthy(keep, record.old.length)) {
            throw new Error("Surviving replicas are not healthy; automatic retirement suspended");
        }
        let relay: RolloutRelay | undefined;
        if (record.relay) {
            const [ instance ] = await this.inspect([ record.relay.id ]);
            if (!instance || instance.Id !== record.relay.id || !instance.State.Running || instance.State.Paused ||
                instance.Config.Image !== RELAY_IMAGE || instance.Config.Labels["com.docker.compose.project"] !== record.project ||
                instance.Config.Labels["com.docker.compose.service"] !== record.relay.service ||
                instance.Config.Labels[LABEL_RELAY_OWNER] !== record.service || instance.Config.Labels[LABEL_RELAY_PORT] !== String(record.relay.port)) {
                throw new Error("Relay identity changed; automatic retirement suspended");
            }
            relay = new RolloutRelay(this.docker, instance.Id, record.relay.port);
            // A crash after old-container removal may leave their obsolete DNS
            // names on disk. Validate ownership/workers, then the NEW route.
            await relay.assertReady(false);
            if (this.acknowledged.get(record.id) !== instance.State.StartedAt) {
                // Repeat after Enhanced/relay restart: disk config alone cannot
                // prove which generation the currently serving workers loaded.
                await relay.route(keep.map(item => item.Name.replace(/^\//, "")), this.wait);
                this.acknowledged.set(record.id, instance.State.StartedAt);
            }
            if (await relay.hasDrainingWorkers()) {
                if (record.problem) {
                    delete record.problem;
                    await this.save(record);
                }
                return;
            }
        } else if (!cancel) {
            for (const item of old.filter(item => item.State.Running)) {
                await this.docker([ "exec", item.Id, "sh", "-c", "touch " + ROLLOUT_DRAIN_FILE ], 15_000);
            }
            if (old.some(item => item.State.Running && item.State.Health?.Status !== "unhealthy")) {
                return;
            }
            await this.wait(10_000);
        }
        // Revalidate immediately before deleting anything, including a partial
        // retirement after a crash. Never broaden the recorded identity set.
        const fresh = await this.inventory(record);
        if (!this.healthy(fresh.filter(item => keep.some(expected => expected.Id === item.Id)), record.old.length)) {
            throw new Error("Replica health changed before retirement");
        }
        for (const item of remove) {
            if (item.State.Running) {
                await this.docker([ "stop", "--time", "30", item.Id ], 90_000);
            }
            await this.docker([ "rm", item.Id ], 30_000);
        }
        if (relay) {
            await relay.route([ record.relay!.origin ], this.wait);
        }
        record.phase = cancel ? "cancelled" : "completed";
        delete record.problem;
        await this.save(record);
    }

    async tick(): Promise<void> {
        if (this.ticking) {
            return;
        }
        this.ticking = true;
        try {
            for (const stored of records.values()) {
                if (!this.owned.has(stored.id) || terminal(stored) || this.active.has(stored.id)) {
                    continue;
                }
                const record = structuredClone(stored);
                try {
                    await withRolloutRecovery(record.directory, async () => {
                        const reservation = tryReserveDockerUpdate("image-update");
                        if (!reservation) {
                            return;
                        }
                        try {
                            if (!await this.blocked()) {
                                await this.reconcile(record);
                            }
                        } finally {
                            reservation.release();
                        }
                    });
                } catch (error) {
                    record.problem = error instanceof Error ? error.message : "Rolling update recovery failed";
                    await this.save(record);
                }
            }
        } finally {
            this.ticking = false;
        }
    }
}

export function getRolloutRecovery(stateDir: string, docker: DockerRun): RolloutRecovery {
    const directory = path.resolve(stateDir);
    let store = stores.get(directory);
    if (!store) {
        store = new RolloutRecovery(directory, docker, async () => {
            const { isSelfUpdateBlockingImageMutations } = await import("./watchers/image-watcher");
            return isSelfUpdateBlockingImageMutations(path.dirname(directory));
        });
        stores.set(directory, store);
    }
    return store;
}
