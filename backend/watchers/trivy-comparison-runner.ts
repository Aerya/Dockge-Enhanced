import { randomUUID, createHash } from "node:crypto";
import { chmod, mkdtemp, rm, statfs } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { execFile } from "../buffered-process";
import { compareImageScans, type ComparisonFinding, type ComparisonScan } from "./trivy-comparison";
import { getRemoteDigest, ImageWatcher, imageStatusStore, normalizeImage } from "./image-watcher";

const execute = promisify(execFile);
const TRIVY_IMAGE = "ghcr.io/aquasecurity/trivy:latest";
type Phase = "preparing" | "database" | "current" | "target" | "complete" | "error";
export interface ComparisonJob {
    id: string;
    stack: string;
    image: string;
    phase: Phase;
    startedAt: string;
    failedPhase?: Phase;
    currentDigest?: string;
    targetDigest?: string;
    platform?: string;
    result?: ReturnType<typeof compareImageScans>;
}
const jobs = new Map<string, ComparisonJob>();
let active = false;
export const comparisonRunning = () => active;

/** Trivy's OS target includes the image name; use a stable OS identity instead. */
export function parseComparisonReport(text: string, digest: string, platform: string, databaseRevision: string): ComparisonScan {
    const report = JSON.parse(text);
    if (report.SchemaVersion !== 2 || report.ArtifactType !== "container_image" || !report.Metadata || (report.Results !== undefined && !Array.isArray(report.Results))) {
        throw new Error("Invalid image scan report");
    }
    const findings: ComparisonFinding[] = [];
    for (const result of report.Results ?? []) {
        if (result.Vulnerabilities !== undefined && !Array.isArray(result.Vulnerabilities)) {
            throw new Error("Invalid vulnerability report");
        }
        for (const vuln of result.Vulnerabilities ?? []) {
            findings.push({ vulnerabilityId: vuln.VulnerabilityID,
                packageName: vuln.PkgName,
                installedVersion: vuln.InstalledVersion,
                fixedVersion: vuln.FixedVersion,
                severity: vuln.Severity,
                ecosystem: result.Type,
                target: result.Class === "os-pkgs" ? `os:${result.Type}` : result.Target });
        }
    }
    return { digest,
        platform,
        databaseRevision,
        status: "success",
        findings };
}

export function getComparisonJob(id: unknown): ComparisonJob | undefined {
    return typeof id === "string" ? jobs.get(id) : undefined;
}

export function startImageComparison(stack: unknown, image: unknown): ComparisonJob {
    const observed = [ ...imageStatusStore.values() ].find(item => item.stack === stack && item.image === image);
    if (!observed || active || observed.image.includes("@")) {
        throw new Error("Comparison unavailable");
    }
    // Retain only a bounded in-memory history; results never include registry credentials.
    while (jobs.size >= 10) {
        jobs.delete(jobs.keys().next().value!);
    }
    const job: ComparisonJob = { id: randomUUID(),
        stack: observed.stack,
        image: observed.image,
        phase: "preparing",
        startedAt: new Date().toISOString() };
    jobs.set(job.id, job);
    active = true;
    void runComparison(job).catch(() => {
        job.failedPhase = job.phase;
        job.phase = "error";
    }).finally(() => {
        active = false;
    });
    return job;
}

export async function runComparison(job: ComparisonJob, docker: (args: string[], options: { timeout: number;
    maxBuffer?: number;
    env?: NodeJS.ProcessEnv }) => Promise<string> = async (args, options) => (await execute("docker", args, options)).stdout): Promise<void> {
    const name = `dockge-cve-preview-${job.id}`;
    const directory = await mkdtemp(path.join(tmpdir(), "dockge-cve-preview-"));
    const deadline = Date.now() + 25 * 60 * 1000;
    const command = async (args: string[], env?: NodeJS.ProcessEnv) => {
        const remaining = deadline - Date.now();
        if (remaining <= 0) {
            throw new Error("Comparison timeout");
        }
        try {
            return await docker(args, { timeout: Math.min(remaining, 10 * 60 * 1000),
                maxBuffer: 50 * 1024 * 1024,
                env: env ?? process.env });
        } catch (error) {
            const failure = error as { code?: unknown;
                signal?: unknown;
                stderr?: unknown };
            let detail = String(failure.stderr ?? "").slice(-2000);
            for (const credential of ImageWatcher.getInstance().settings.credentials) {
                for (const secret of [ credential.username, credential.token ]) {
                    if (secret) {
                        detail = detail.split(secret).join("[redacted]");
                    }
                }
            }
            detail = detail.replace(/(https?:\/\/)[^\s/@]+:[^\s/@]+@/g, "$1[redacted]@");
            console.warn(`[Image comparison] ${job.phase}; exit=${String(failure.code ?? "unknown")}; signal=${String(failure.signal ?? "none")}; ${detail}`);
            throw error;
        }
    };
    try {
        const ids = (await command([ "ps", "-q", "--filter", `label=com.docker.compose.project=${job.stack}` ])).trim().split(/\s+/).filter(Boolean);
        const currentIds = new Set<string>();
        for (const id of ids) {
            const row = JSON.parse(await command([ "inspect", id, "--format", "{{json .Config.Image}}" ]));
            if (JSON.stringify(normalizeImage(row)) === JSON.stringify(normalizeImage(job.image))) {
                currentIds.add((await command([ "inspect", id, "--format", "{{.Image}}" ])).trim());
            }
        }
        if (currentIds.size !== 1) {
            throw new Error("Running image is missing or replicas differ");
        }
        const currentID = [ ...currentIds ][0];
        if (!/^sha256:[a-f0-9]{64}$/.test(currentID)) {
            throw new Error("Invalid running image ID");
        }
        const info = JSON.parse(await command([ "image", "inspect", currentID, "--format", "{{json .}}" ]));
        const platform = `${info.Os}/${info.Architecture}${info.Variant ? `/${info.Variant}` : ""}`;
        const watcher = ImageWatcher.getInstance();
        const target = await getRemoteDigest(job.image, watcher.settings.credentials, platform, true);
        if (!/^sha256:[a-f0-9]{64}$/.test(target.platformDigest)) {
            throw new Error("Invalid target digest");
        }
        const { registry, name: repository } = normalizeImage(job.image);
        const pinnedTarget = `${registry}/${repository}@${target.platformDigest}`;
        job.currentDigest = currentID;
        job.targetDigest = target.platformDigest;
        job.platform = platform;
        const space = await statfs(directory);
        if (space.bavail * space.bsize < Math.max(Number(info.Size) * 2, 0) + 2 * 1024 ** 3) {
            throw new Error("Insufficient temporary space");
        }
        await command([ "image", "save", "--output", path.join(directory, "current.tar"), currentID ]);
        // Docker cp preserves the archive mode. The helper has no DAC override
        // capability, so make this file readable inside its private container.
        // The host parent remains mkdtemp's 0700 directory.
        await chmod(path.join(directory, "current.tar"), 0o644);
        await command([ "pull", TRIVY_IMAGE ]);
        // No host mounts, no Docker socket, no published port, no application execution.
        await command([ "create", "--rm", "--name", name, "--label", "io.dockge-enhanced.cve-preview=true", "--cap-drop", "ALL", "--security-opt", "no-new-privileges", "--memory", "2g", "--cpus", "2", "--entrypoint", "sh", TRIVY_IMAGE, "-c", "sleep 1800" ]);
        await command([ "start", name ]);
        await command([ "cp", path.join(directory, "current.tar"), `${name}:/tmp/current.tar` ]);
        job.phase = "database";
        const trivy = [ "exec", name, "trivy", "image", "--cache-dir", "/tmp/trivy-cache" ];
        await command([ ...trivy, "--download-db-only", "--quiet" ]);
        await command([ ...trivy, "--download-java-db-only", "--quiet" ]);
        const metadata = async () => command([ "exec", name, "sh", "-c", "cat /tmp/trivy-cache/db/metadata.json /tmp/trivy-cache/java-db/metadata.json" ]);
        const revision = createHash("sha256").update(await metadata()).digest("hex");
        const options = [ "--skip-db-update", "--skip-java-db-update", "--skip-check-update", "--scanners", "vuln", "--format", "json", "--quiet" ];
        job.phase = "current";
        const current = parseComparisonReport(await command([ ...trivy, ...options, "--input", "/tmp/current.tar" ]), currentID, platform, revision);
        job.phase = "target";
        const credential = watcher.getRegistryCredential(registry);
        const env = { ...process.env,
            TRIVY_USERNAME: credential?.username ?? "",
            TRIVY_PASSWORD: credential?.token ?? "" };
        const candidateArgs = [ "exec", "--env", "TRIVY_USERNAME", "--env", "TRIVY_PASSWORD", name, "trivy", "image", "--cache-dir", "/tmp/trivy-cache", ...options, "--image-src", "remote", "--platform", platform, pinnedTarget ];
        const candidate = parseComparisonReport(await command(candidateArgs, env), target.platformDigest, platform, revision);
        if (createHash("sha256").update(await metadata()).digest("hex") !== revision) {
            throw new Error("Vulnerability database changed");
        }
        // Never silently compare against a different running container after a concurrent update.
        const remainingIds = (await command([ "ps", "-q", "--filter", `label=com.docker.compose.project=${job.stack}` ])).trim().split(/\s+/).filter(Boolean);
        if (JSON.stringify(ids.sort()) !== JSON.stringify(remainingIds.sort())) {
            throw new Error("Running containers changed");
        }
        for (const id of ids) {
            const running = JSON.parse(await command([ "inspect", id, "--format", "{{json .}}" ]));
            if (JSON.stringify(normalizeImage(running.Config.Image)) === JSON.stringify(normalizeImage(job.image)) && running.Image !== currentID) {
                throw new Error("Running image changed");
            }
        }
        job.result = compareImageScans(current, candidate);
        job.phase = "complete";
    } finally {
        await docker([ "rm", "-f", name ], { timeout: 30000 }).catch(() => undefined);
        await rm(directory, { recursive: true,
            force: true });
    }
}
