import { constants } from "node:fs";
import { open, lstat } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";

export interface HostPackage {
    name: string;
    version: string;
    arch: string;
    source: string;
    sourceVersion: string;
    origin: "unknown" | "repository" | "foreign";
    available: string | null;
}
export interface HostReport {
    schemaVersion: 1;
    collectedAt: string;
    host: string;
    hostId: string;
    os: string;
    osVersion: string;
    osName: string;
    arch: string;
    kernel: string;
    uptime: number;
    provider: string;
    metadata: "cached" | "refreshed" | "unavailable";
    complete: boolean;
    packages: HostPackage[];
    reboot: "required" | "unknown";
    capabilities: string[];
}
export const MAX_REPORT = 16 * 1024 * 1024;
const text = (v: unknown, max = 200): v is string => typeof v === "string" && v.length <= max && !/[\x00-\x1f\x7f]/.test(v);
export function parseReport(value: unknown, now = Date.now()): HostReport {
    const r = value as HostReport;
    if (!r || r.schemaVersion !== 1 || !/^[a-f0-9]{64}$/.test(r.hostId) || !text(r.collectedAt) || !Number.isFinite(Date.parse(r.collectedAt)) || Date.parse(r.collectedAt) > now + 300000 ||
        ![ r.host, r.os, r.osVersion, r.osName, r.arch, r.kernel ].every(v => text(v)) ||
        !Number.isFinite(r.uptime) || r.uptime < 0 || typeof r.complete !== "boolean" ||
        ![ "apt", "pacman", "unsupported" ].includes(r.provider) || ![ "cached", "refreshed", "unavailable" ].includes(r.metadata) ||
        ![ "required", "unknown" ].includes(r.reboot) || !Array.isArray(r.packages) || r.packages.length > 100000 ||
        !Array.isArray(r.capabilities) || r.capabilities.some(v => ![ "inventory", "updates" ].includes(v))) {
        throw new Error("hosts.invalidReport");
    }
    const keys = new Set<string>();
    const packages = r.packages.map(p => {
        if (!p || !/^[A-Za-z0-9][A-Za-z0-9+_.:@~-]{0,199}$/.test(p.source) || !/^[A-Za-z0-9][A-Za-z0-9+_.:@~-]{0,199}$/.test(p.arch) || !text(p.name) || !/^[A-Za-z0-9][A-Za-z0-9+_.:@~-]*$/.test(p.name) ||
            ![ p.version, p.arch, p.source, p.sourceVersion ].every(v => text(v)) || !p.version ||
            (p.available !== null && (!text(p.available) || !p.available)) || ![ "unknown", "repository", "foreign" ].includes(p.origin)) {
            throw new Error("hosts.invalidReport");
        }
        const key = `${p.name}:${p.arch}`;
        if (keys.has(key)) {
            throw new Error("hosts.invalidReport");
        }
        keys.add(key);
        return { name: p.name,
            version: p.version,
            arch: p.arch,
            source: p.source,
            sourceVersion: p.sourceVersion,
            origin: p.origin,
            available: p.available };
    });
    // Whitelist fields: never persist or forward extra collector data.
    return { schemaVersion: 1,
        collectedAt: r.collectedAt,
        host: r.host,
        hostId: r.hostId,
        os: r.os,
        osVersion: r.osVersion,
        osName: r.osName,
        arch: r.arch,
        kernel: r.kernel,
        uptime: r.uptime,
        provider: r.provider,
        metadata: r.metadata,
        complete: r.complete,
        packages,
        reboot: r.reboot,
        capabilities: r.capabilities };
}
export function reportState(report: HostReport | null, staleHours = 12, now = Date.now()) {
    if (!report) {
        return "unavailable";
    }
    if (now - Date.parse(report.collectedAt) > staleHours * 3600000) {
        return "stale";
    }
    return report.complete ? "fresh" : "partial";
}
export function inventoryHash(report: HostReport) {
    return createHash("sha256").update(JSON.stringify([ report.os, report.osVersion, report.arch,
        [ ...report.packages ].sort((a, b) => `${a.name}:${a.arch}`.localeCompare(`${b.name}:${b.arch}`)) ])).digest("hex");
}
export async function readReport(directory: string): Promise<HostReport> {
    const parent = await lstat(directory);
    if (!parent.isDirectory() || parent.isSymbolicLink() || (parent.mode & 0o022)) {
        throw new Error("hosts.invalidReport");
    }
    const file = await open(path.join(directory, "inventory.json"), constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    try {
        const info = await file.stat();
        if (!info.isFile() || info.nlink !== 1 || info.size > MAX_REPORT || (info.mode & 0o022) || info.uid !== parent.uid) {
            throw new Error("hosts.invalidReport");
        }
        // Bounded read even if a writer grows the file after stat.
        const bytes = Buffer.alloc(MAX_REPORT + 1);
        const { bytesRead } = await file.read(bytes, 0, bytes.length, 0);
        if (bytesRead > MAX_REPORT) {
            throw new Error("hosts.invalidReport");
        }
        return parseReport(JSON.parse(bytes.subarray(0, bytesRead).toString("utf8")));
    } finally {
        await file.close();
    }
}
