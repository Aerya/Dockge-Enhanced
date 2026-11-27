import { randomBytes } from "node:crypto";
import { constants } from "node:fs";
import { lstat, open, readdir, rename, unlink } from "node:fs/promises";
import path from "node:path";

export const HOST_SCOPES = [ "all", "security", "conservative", "security-conservative" ];
export interface HostSchedule { enabled: boolean;
    days: number[];
    hour: number;
    minute: number;
    scope: string; }
export function validHostSchedule(value: unknown): value is HostSchedule {
    const s = value as HostSchedule;
    return !!s && Object.keys(s).length === 5 && typeof s.enabled === "boolean" && Array.isArray(s.days) && s.days.length > 0 && s.days.length <= 7 &&
        new Set(s.days).size === s.days.length && s.days.every(d => Number.isInteger(d) && d >= 0 && d <= 6) &&
        Number.isInteger(s.hour) && s.hour >= 0 && s.hour < 24 && Number.isInteger(s.minute) && s.minute >= 0 && s.minute < 60 && HOST_SCOPES.includes(s.scope);
}
export interface HostOperationEvent { hostId: string;
    id: string;
    state: string;
    at: number;
    scope: string;
    automatic: boolean;
    count: number; }
function validEvent(r: HostOperationEvent, hostId?: string) {
    return r && r.hostId === hostId && /^[a-f0-9]{32}$/.test(r.id) && [ "running", "simulated", "complete", "failed", "scheduled" ].includes(r.state) &&
        Number.isFinite(r.at) && r.at > 0 && r.at < Date.now() / 1000 + 300 && HOST_SCOPES.includes(r.scope) &&
        typeof r.automatic === "boolean" && Number.isInteger(r.count) && r.count >= 0 && r.count <= 500;
}
export const EMPTY_OPERATIONS = { manual: false,
    automatic: false,
    scopes: [] as string[],
    schedule: null as HostSchedule | null,
    result: null,
    events: [] as HostOperationEvent[] };

/** No commands or executable paths are accepted over RPC. Local policy is never writable here. */
export async function queueHostOperation(value: unknown, hostId?: string) {
    const request = value as { action?: unknown;
        plan?: unknown;
        approved?: unknown;
        scope?: unknown;
        schedule?: unknown };
    if (!hostId || !/^[a-f0-9]{64}$/.test(hostId) || !request || ![ "simulate", "install", "schedule" ].includes(String(request.action)) ||
        Object.keys(request).some(k => ![ "action", "plan", "approved", "scope", "schedule" ].includes(k)) ||
        !HOST_SCOPES.includes(String(request.scope ?? "all")) ||
        (request.action === "schedule" && !validHostSchedule(request.schedule)) ||
        (request.action === "install" && (request.approved !== true || typeof request.plan !== "string" || !/^[a-f0-9]{64}$/.test(request.plan)))) {
        throw new Error("hosts.invalidOperation");
    }
    const directory = process.env.DOCKGE_HOST_REQUEST_DIR;
    if (!directory) {
        throw new Error("hosts.operationsUnavailable");
    }
    const info = await lstat(directory);
    if (!info.isDirectory() || info.isSymbolicLink() || (info.mode & 0o002)) {
        throw new Error("hosts.operationsUnavailable");
    }
    if ((await readdir(directory)).filter(name => name.endsWith(".json")).length >= 100) {
        throw new Error("hosts.operationsUnavailable");
    }
    const id = randomBytes(16).toString("hex");
    const temporary = path.join(directory, `.${id}.tmp`);
    const final = path.join(directory, `${id}.json`);
    const file = await open(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
    try {
        await file.writeFile(JSON.stringify({ id,
            hostId,
            action: request.action,
            scope: request.scope ?? "all",
            schedule: request.schedule,
            plan: request.plan,
            approved: request.approved,
            expires: Date.now() / 1000 + 120 }));
        await file.sync();
    } finally {
        await file.close();
    }
    try {
        await rename(temporary, final);
    } finally {
        await unlink(temporary).catch(() => {});
    }
    return { id,
        expires: Date.now() + 120000 };
}

export async function hostOperationStatus(hostId?: string) {
    const directory = process.env.DOCKGE_HOST_OPERATION_REPORT_DIR;
    if (!directory) {
        return { ...EMPTY_OPERATIONS };
    }
    const parent = await lstat(directory);
    if (!parent.isDirectory() || parent.isSymbolicLink() || parent.uid !== 0 || (parent.mode & 0o022)) {
        throw new Error("hosts.invalidReport");
    }
    const read = async (name: string) => {
        const file = await open(path.join(directory, name), constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
        try {
            const info = await file.stat();
            if (!info.isFile() || info.uid !== 0 || info.nlink !== 1 || (info.mode & 0o022) || info.size > 524288) {
                throw new Error("hosts.invalidReport");
            }
            const bytes = Buffer.alloc(524289);
            const { bytesRead } = await file.read(bytes, 0, bytes.length, 0);
            if (bytesRead > 524288) {
                throw new Error("hosts.invalidReport");
            }
            return JSON.parse(bytes.subarray(0, bytesRead).toString("utf8"));
        } finally {
            await file.close();
        }
    };
    const cap = await read("capabilities.json");
    const fresh = !!hostId && cap.hostId === hostId && cap.schemaVersion === 1 && Number.isFinite(cap.expires) && cap.expires > Date.now() / 1000 && cap.expires < Date.now() / 1000 + 120;
    const manual = fresh && cap.manual === true;
    const automatic = fresh && cap.automatic === true;
    const scopes = fresh && Array.isArray(cap.scopes) ? cap.scopes.filter((s: unknown) => typeof s === "string" && HOST_SCOPES.includes(s)) as string[] : [];
    const schedule = cap.hostId === hostId && validHostSchedule(cap.schedule) ? cap.schedule : null;
    let events: HostOperationEvent[] = [];
    try {
        const e = await read("events.json");
        if (Array.isArray(e) && e.length <= 100 && e.every(r => validEvent(r, hostId))) {
            events = e.map(r => ({ hostId: r.hostId,
                id: r.id,
                at: r.at,
                state: r.state,
                scope: r.scope,
                automatic: r.automatic,
                count: r.count }));
        }
    } catch { /* Invalid events do not grant authority. */ }
    let result = null;
    try {
        const r = await read("inventory.json");
        if (!validEvent({ ...r,
            count: r.packages?.length ?? 0 }, hostId) ||
            (r.plan !== undefined && !/^[a-f0-9]{64}$/.test(r.plan)) || (r.expires !== undefined && !Number.isFinite(r.expires)) ||
            (r.packages !== undefined && (!Array.isArray(r.packages) || r.packages.length > 500 || r.packages.some((p: Record<string, unknown>) =>
                ![ p.name, p.installed, p.version ].every(v => typeof v === "string" && /^[A-Za-z0-9][A-Za-z0-9.+:~_-]{0,199}$/.test(v)))))) {
            throw new Error("hosts.invalidReport");
        }
        result = { id: r.id,
            state: r.state,
            scope: r.scope,
            automatic: r.automatic,
            at: r.at,
            plan: r.plan,
            expires: r.expires,
            packages: r.packages?.map((p: Record<string, string>) => ({ name: p.name,
                installed: p.installed,
                version: p.version })) ?? [] };
    } catch { /* A missing or invalid result grants no authority. */ }
    return { manual,
        automatic,
        scopes,
        schedule,
        events,
        result };
}
