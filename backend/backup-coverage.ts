import { BackupManager } from "./watchers/backup-manager";
import { inspectStackVolumes } from "./stack-volume-inspection";
import { topologyStackNames } from "./docker-topology";
import type { DockgeServer } from "./dockge-server";
import { coverageDestination, coverageHostPath, coverageState, containsPath, type CoverageProof } from "./backup-coverage-policy";
import { zerobyte } from "./integrations/zerobyte-manager";
import { managedWorkflowContext } from "./integrations/zerobyte-installer";

async function collect(server: DockgeServer) {
    const manager = BackupManager.getInstance();
    const settings = manager.getSettingsSafe();
    const history = manager.getHistory();
    const mounts = await manager.getAllHostBackupMounts().catch(() => null);
    const paths = mounts ? [ ...settings.extraPaths, ...settings.volumeBackup.selectedVolumes ].map(p => coverageHostPath(p, mounts)).filter((p): p is string => p !== null) : [];
    const rows: Array<{ stack: string;
        resource: string;
        kind: string;
        source: string;
        proofs: CoverageProof[];
        state: CoverageProof["state"] }> = [];
    const unavailable: string[] = [];
    const names = await topologyStackNames(server);
    for (const [ project, entry ] of names) {
        try {
            const containers = await inspectStackVolumes([ "ps", "-aq", "--filter", "label=com.docker.compose.project=" + project ], server.stacksDir);
            if (!containers.length) {
                unavailable.push(entry.name);
            }
            for (const mount of containers.flatMap(c => c.Mounts)) {
                if (![ "bind", "volume" ].includes(mount.Type || "") || !mount.Source || rows.some(r => r.stack === entry.name && r.source === mount.Source)) {
                    continue;
                }
                const source = mount.Source;
                const proofs: CoverageProof[] = settings.destinations.map(dest => {
                    const identity = coverageDestination(dest);
                    const recorded = history.flatMap(run => (run.destinations || []).map((result, index) => ({ run,
                        result,
                        identity: run.coverage?.destinations[index] })))
                        .filter(e => e.identity === identity && e.result.success && e.result.snapshotId && e.run.coverage?.paths.some(p => containsPath(p, source) || containsPath(source, p)))
                        .sort((a, b) => Date.parse(b.run.timestamp) - Date.parse(a.run.timestamp))[0];
                    const configured = dest.enabled && paths.some(p => containsPath(p, source) || containsPath(source, p));
                    const state = recorded ? coverageState(source, recorded.run.coverage!.paths, recorded.run.coverage!.excludes, true) : mounts ? configured ? "unknown" : "unprotected" : "unknown";
                    return { destination: "Restic · " + dest.label,
                        configured,
                        state,
                        lastSuccess: recorded?.run.timestamp,
                        verification: recorded?.result.restoreTest?.skipped ? undefined : recorded?.result.restoreTest?.ok ? "sample-read" : recorded?.result.restoreTest ? "failed" : undefined,
                        exclusions: !!(recorded?.run.coverage?.excludes.length || settings.excludePatterns.length),
                        overdue: settings.enabled && configured && (!recorded || Date.now() - Date.parse(recorded.run.timestamp) > settings.intervalHours * 3600000),
                    };
                });
                rows.push({ stack: entry.name,
                    resource: mount.Name || source,
                    source,
                    kind: mount.Type!,
                    proofs,
                    state: "unknown" });
            }
        } catch {
            unavailable.push(entry.name);
        }
    }
    let zerobyteState = "disabled";
    if ((await zerobyte.getSafeConfig()).enabled) {
        zerobyteState = "unknown";
        try {
            const ctx = await managedWorkflowContext(server);
            const overview = await zerobyte.overview(false);
            const resources = await zerobyte.resources();
            // A job's last-success field is evidence of execution, not proof of its past path/exclusion set.
            // Keep coverage unknown until Zerobyte supplies snapshot-level scope evidence.
            for (const row of rows) {
                for (const source of ctx.localMounts) {
                    if (!(source.kind === "volume" ? row.kind === "volume" && row.resource === source.source : containsPath(source.source, row.source))) {
                        continue;
                    }
                    for (const job of overview.jobs) {
                        // Volume IDs cannot safely be inferred from display names. Resolve through the existing API.
                        const volume = resources.volumes.find(v => v.id === job.volumeId);
                        const config = volume?.config as { path?: string;
                            backend?: string } | undefined;
                        if (config?.backend !== "directory" || config.path !== source.target) {
                            continue;
                        }
                        const repo = resources.repositories.find(r => r.id === job.repositoryId || r.shortId === job.repositoryId);
                        row.proofs.push({ destination: "Zerobyte · " + String(repo?.name || job.repositoryId),
                            configured: job.enabled,
                            lastSuccess: job.lastBackupStatus === "success" && job.lastBackupAt ? new Date(job.lastBackupAt * 1000).toISOString() : undefined,
                            state: "unknown",
                            exclusions: false,
                            overdue: job.enabled && !!job.nextBackupAt && job.nextBackupAt * 1000 < Date.now(),
                        });
                    }
                }
            }
            zerobyteState = "available";
        } catch { /* External/inaccessible Zerobyte mapping is unknown, never unprotected. */ }
    }
    for (const row of rows) {
        row.state = row.proofs.some(p => p.state === "protected") ? "protected" : row.proofs.some(p => p.state === "partial") ? "partial" : zerobyteState === "unknown" || row.proofs.some(p => p.state === "unknown") ? "unknown" : "unprotected";
    }
    return { capturedAt: new Date().toISOString(),
        rows,
        unavailable: [ ...new Set(unavailable) ],
        zerobyteState };
}

const coverageCache = new WeakMap<DockgeServer, { at: number;
    pending: ReturnType<typeof collect> }>();
export function collectBackupCoverage(server: DockgeServer) {
    const cached = coverageCache.get(server);
    if (cached && Date.now() - cached.at < 30000) {
        return cached.pending;
    }
    const pending = collect(server).catch(error => {
        coverageCache.delete(server);
        throw error;
    });
    coverageCache.set(server, { at: Date.now(),
        pending });
    return pending;
}
