import { randomUUID, createHash } from "node:crypto";
import { mkdtemp, mkdir, writeFile, rm, chmod } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { execFile } from "../buffered-process";
import { type HostReport, inventoryHash } from "./report";

const execute = promisify(execFile);
const IMAGE = "ghcr.io/aquasecurity/trivy:latest";
export interface HostFinding {
    id: string;
    pkg: string;
    installed: string;
    fixed: string;
    severity: string;
    url: string;
    status: "vulnerable";
    fix: "available" | "published" | "none";
}
export interface HostSecurity {
    state: "unavailable" | "partial" | "fresh" | "stale";
    scannedAt?: string;
    fingerprint?: string;
    database?: string;
    findings: HostFinding[];
}
/** Build only package metadata, never a copy or mount of the host filesystem. */
export function debianMetadata(report: HostReport) {
    if (report.provider !== "apt" || ![ "debian", "ubuntu" ].includes(report.os) || !/^\d+(?:\.\d+)*$/.test(report.osVersion)) {
        throw new Error("hosts.unsupported");
    }
    return {
        os: `ID=${report.os}\nVERSION_ID="${report.osVersion}"\n`,
        status: report.packages.map(p => `Package: ${p.name.split(":")[0]}\nStatus: install ok installed\nArchitecture: ${p.arch}\nVersion: ${p.version}\nSource: ${p.source} (${p.sourceVersion})\nDescription: host inventory metadata\n`).join("\n"),
    };
}
export function parseHostScan(value: unknown, report: HostReport): HostFinding[] {
    const scan = value as { SchemaVersion?: number;
        Metadata?: { OS?: { Family?: string;
            Name?: string } };
        Results?: Array<{ Class?: string;
            Type?: string;
            Packages?: unknown[];
            Vulnerabilities?: Array<Record<string, unknown>> }> };
    if (scan?.SchemaVersion !== 2 || scan.Metadata?.OS?.Family !== report.os || !Array.isArray(scan.Results) ||
        !scan.Results.some(r => r.Class === "os-pkgs" && r.Type === report.os)) {
        throw new Error("hosts.invalidScan");
    }
    const found = new Map<string, HostFinding>();
    for (const result of scan.Results) {
        if (result.Class !== "os-pkgs" || result.Type !== report.os) {
            continue;
        }
        if (result.Vulnerabilities !== undefined && !Array.isArray(result.Vulnerabilities)) {
            throw new Error("hosts.invalidScan");
        }
        for (const v of result.Vulnerabilities ?? []) {
            if (typeof v.VulnerabilityID !== "string" || !/^CVE-\d{4}-\d{4,}$/.test(v.VulnerabilityID) ||
                typeof v.PkgName !== "string" || typeof v.InstalledVersion !== "string") {
                continue;
            }
            const pkg = report.packages.find(p => p.name.split(":")[0] === v.PkgName && p.version === v.InstalledVersion);
            if (!pkg) {
                throw new Error("hosts.invalidScan");
            }
            const fixed = typeof v.FixedVersion === "string" ? v.FixedVersion.slice(0, 200) : "";
            const id = v.VulnerabilityID;
            found.set(`${id}:${pkg.name}:${pkg.arch}`, { id,
                pkg: pkg.name,
                installed: pkg.version,
                fixed,
                severity: [ "LOW", "MEDIUM", "HIGH", "CRITICAL" ].includes(String(v.Severity)) ? String(v.Severity) : "UNKNOWN",
                url: report.os === "debian" ? `https://security-tracker.debian.org/tracker/${id}` : `https://ubuntu.com/security/${id}`,
                status: "vulnerable",
                fix: !fixed ? "none" : pkg.available === fixed ? "available" : "published" });
        }
    }
    return [ ...found.values() ];
}
export type DockerCommand = (args: string[]) => Promise<string>;
export async function scanHost(report: HostReport, docker: DockerCommand = async args => (await execute("docker", args,
    { timeout: 600000,
        maxBuffer: 32 * 1024 * 1024 })).stdout): Promise<HostSecurity> {
    const metadata = debianMetadata(report);
    const directory = await mkdtemp(path.join(tmpdir(), "dockge-host-"));
    const name = `dockge-host-scan-${randomUUID()}`;
    const cache = "dockge-host-trivy-db";
    try {
        const payload = path.join(directory, "payload");
        for (const relative of [ "", "etc", "var", "var/lib", "var/lib/dpkg" ]) {
            const target = path.join(payload, relative);
            await mkdir(target, { recursive: true });
            await chmod(target, 0o755);
        }
        const files = { "etc/os-release": metadata.os,
            "var/lib/dpkg/status": metadata.status,
            ...(report.os === "debian" ? { "etc/debian_version": `${report.osVersion}\n` } : {}) };
        for (const [ relative, content ] of Object.entries(files)) {
            const target = path.join(payload, relative);
            await writeFile(target, content);
            await chmod(target, 0o644);
        }
        // Same Trivy image as the existing image scanner; only advisory DB download has network access.
        await docker([ "pull", IMAGE ]);
        await docker([ "run", "--rm", "--name", `${name}-db`, "--cap-drop", "ALL", "--security-opt", "no-new-privileges", "--memory", "1g", "--cpus", "1", "-v", `${cache}:/root/.cache/trivy`, IMAGE, "image", "--download-db-only", "--quiet" ]);
        await docker([ "create", "--name", name, "--network", "none", "--cap-drop", "ALL", "--security-opt", "no-new-privileges", "--memory", "1g", "--cpus", "1", "-v", `${cache}:/root/.cache/trivy:ro`, "--entrypoint", "sh", IMAGE, "-c", "sleep 900" ]);
        await docker([ "start", name ]);
        await docker([ "cp", `${payload}/.`, `${name}:/tmp/host` ]);
        const database = await docker([ "exec", name, "cat", "/root/.cache/trivy/db/metadata.json" ]);
        const db = JSON.parse(database);
        if (!Number.isFinite(Date.parse(db.UpdatedAt)) || Date.now() - Date.parse(db.UpdatedAt) > 72 * 3600000) {
            throw new Error("hosts.staleDatabase");
        }
        const result = await docker([ "exec", name, "trivy", "rootfs", "--scanners", "vuln", "--offline-scan", "--skip-db-update", "--skip-java-db-update", "--skip-check-update", "--format", "json", "--quiet", "/tmp/host" ]);
        return { state: "partial",
            scannedAt: new Date().toISOString(),
            fingerprint: inventoryHash(report),
            database: createHash("sha256").update(database).digest("hex"),
            findings: parseHostScan(JSON.parse(result), report) };
        // Partial deliberately: source origins and ESM coverage cannot be inferred from installed versions alone.
    } finally {
        await docker([ "rm", "-f", name, `${name}-db` ]).catch(() => {});
        await rm(directory, { recursive: true,
            force: true });
    }
}
