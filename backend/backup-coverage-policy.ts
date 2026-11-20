import path from "node:path";
import { createHash } from "node:crypto";
import type { BackupDestination, MountedVolume } from "./watchers/backup-manager";
export const containsPath = (root: string, candidate: string) => path.isAbsolute(root) && path.isAbsolute(candidate) && (path.normalize(root) === path.normalize(candidate) || path.normalize(candidate).startsWith(path.normalize(root).replace(/\/$/, "") + "/"));
/** No fallback to a container-local path when host attribution is missing. */
export function coverageHostPath(value: string, mounts: MountedVolume[]): string | null {
    const mount = mounts.filter(m => containsPath(m.destination, value)).sort((a, b) => b.destination.length - a.destination.length)[0];
    return mount ? path.join(mount.source, path.relative(mount.destination, value)) : null;
}
/** Hash repository identity only; credentials are neither recorded nor returned. */
export function coverageDestination(dest: BackupDestination): string {
    const location = dest.type === "local" ? dest.local?.path : dest.type === "sftp" ? [ dest.sftp?.host, dest.sftp?.port, dest.sftp?.user, dest.sftp?.path ] : dest.type === "s3" ? [ dest.s3?.endpoint, dest.s3?.bucket, dest.s3?.path ] : dest.rest?.url;
    return createHash("sha256").update(JSON.stringify([ dest.type, location ])).digest("hex");
}
export interface CoverageEvidence { paths: string[];
    excludes: string[];
    destinations: string[] }
export interface CoverageProof { destination: string;
    configured: boolean;
    lastSuccess?: string;
    verification?: "sample-read" | "failed";
    state: "protected" | "partial" | "unprotected" | "unknown";
    overdue: boolean;
    exclusions: boolean }
export function coverageState(source: string, paths: string[], excludes: string[], success: boolean): CoverageProof["state"] {
    const full = paths.some(p => containsPath(p, source));
    const partial = paths.some(p => containsPath(source, p));
    return !full && !partial ? "unprotected" : !success ? "unknown" : full && !excludes.length ? "protected" : "partial";
}
