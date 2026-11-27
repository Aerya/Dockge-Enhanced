import { randomBytes } from "node:crypto";
import { constants } from "node:fs";
import { lstat, open, readdir, rename, unlink } from "node:fs/promises";
import path from "node:path";

/** No commands or executable paths are accepted over RPC. Local policy is never writable here. */
export async function queueHostOperation(value: unknown, hostId?: string) {
    const request = value as { action?: unknown;
        plan?: unknown;
        approved?: unknown };
    if (!hostId || !/^[a-f0-9]{64}$/.test(hostId) || !request || ![ "simulate", "install" ].includes(String(request.action)) ||
        Object.keys(request).some(k => ![ "action", "plan", "approved" ].includes(k)) ||
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
        return { manual: false,
            result: null };
    }
    const parent = await lstat(directory);
    if (!parent.isDirectory() || parent.isSymbolicLink() || parent.uid !== 0 || (parent.mode & 0o022)) {
        throw new Error("hosts.invalidReport");
    }
    const read = async (name: string) => {
        const file = await open(path.join(directory, name), constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
        try {
            const info = await file.stat();
            if (!info.isFile() || info.uid !== 0 || info.nlink !== 1 || (info.mode & 0o022) || info.size > 65536) {
                throw new Error("hosts.invalidReport");
            }
            const bytes = Buffer.alloc(65537);
            const { bytesRead } = await file.read(bytes, 0, bytes.length, 0);
            if (bytesRead > 65536) {
                throw new Error("hosts.invalidReport");
            }
            return JSON.parse(bytes.subarray(0, bytesRead).toString("utf8"));
        } finally {
            await file.close();
        }
    };
    const cap = await read("capabilities.json");
    const manual = !!hostId && cap.hostId === hostId && cap.schemaVersion === 1 && cap.manual === true && Number.isFinite(cap.expires) && cap.expires > Date.now() / 1000 && cap.expires < Date.now() / 1000 + 120;
    let result = null;
    try {
        const r = await read("inventory.json");
        if (!/^[a-f0-9]{32}$/.test(r.id) || ![ "simulated", "complete", "failed" ].includes(r.state) || !Number.isFinite(r.at) ||
            (r.plan !== undefined && !/^[a-f0-9]{64}$/.test(r.plan)) || (r.expires !== undefined && !Number.isFinite(r.expires)) ||
            (r.packages !== undefined && (!Array.isArray(r.packages) || r.packages.length > 500 || r.packages.some((p: Record<string, unknown>) =>
                ![ p.name, p.installed, p.version ].every(v => typeof v === "string" && /^[A-Za-z0-9][A-Za-z0-9.+:~_-]{0,199}$/.test(v)))))) {
            throw new Error("hosts.invalidReport");
        }
        result = { id: r.id,
            state: r.state,
            at: r.at,
            plan: r.plan,
            expires: r.expires,
            packages: r.packages?.map((p: Record<string, string>) => ({ name: p.name,
                installed: p.installed,
                version: p.version })) ?? [] };
    } catch { /* A missing or invalid result grants no authority. */ }
    return { manual,
        result };
}
