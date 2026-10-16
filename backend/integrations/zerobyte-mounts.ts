/** Validate explicit mounts; native Restic coverage is never changed. */
import { createHash } from "node:crypto";
import path from "node:path";

export const MANAGED_ZEROBYTE = "dockge-zerobyte-managed";
export const ZEROBYTE_OWNER_LABEL = "net.dockge-enhanced.integration";
export const ZEROBYTE_OWNER_VALUE = "zerobyte-managed";
export interface LocalSourceMount {
    source: string;
    target: string;
    kind: "bind" | "volume";
}
export interface DockerMount {
    Type?: string;
    Name?: string;
    Source?: string;
    Destination?: string;
    RW?: boolean;
}
export interface HostMount {
    source: string;
    destination: string;
}

function within(candidate: string, parent: string): boolean {
    return candidate === parent || candidate.startsWith(parent + path.sep);
}

export function managedMountTarget(source: string, kind: "bind" | "volume" = "bind"): string {
    return `/sources/local-${createHash("sha256").update(kind + ":" + source).digest("hex").slice(0, 12)}`;
}

/** Deny host filesystem and Docker control roots. Never accept Docker mount strings from clients. */
export function normalizeManagedSources(value: unknown, forbiddenHostPaths: string[] = []): LocalSourceMount[] {
    if (!Array.isArray(value) || value.length > 12) {
        throw new Error("Expected no more than 12 local source directories");
    }
    const seen = new Set<string>();
    const mounts: LocalSourceMount[] = [];
    const blocked = [ "/", "/proc", "/sys", "/dev", "/run", "/etc", "/root", "/var/run", "/var/lib/docker", "/usr", "/bin", "/sbin", "/lib", "/lib64", "/boot", "/var/lib/containerd", ...forbiddenHostPaths ];
    for (const item of value) {
        if (!item || typeof item !== "object" || Array.isArray(item)) {
            throw new Error("Invalid Zerobyte source directory");
        }
        const provided = item as { source?: unknown;
            kind?: unknown };
        const kind = provided.kind ?? "bind";
        const source = provided.source;
        if (kind !== "bind" && kind !== "volume") {
            throw new Error("Unknown Zerobyte mount source type");
        }
        if (typeof source !== "string") {
            throw new Error("Invalid Zerobyte source name");
        }
        let normalized = source;
        if (kind === "bind") {
            if (source.length < 2 || source.length > 1024 || !path.isAbsolute(source) ||
                (source.includes("\0") || source.includes("$") || /[\x00-\x1f]/.test(source)) || source.includes(",") || /[\r\n]/.test(source) || source.split("/").includes("..")) {
                throw new Error("Zerobyte bind source must be an absolute host directory");
            }
            normalized = path.resolve(source);
            if (blocked.some(root => (root !== "/" && within(normalized, root)) || within(root, normalized))) {
                throw new Error(`Zerobyte mount overlaps a protected host directory: ${normalized}`);
            }
        } else if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/.test(source) ||
            [ "dockge-zerobyte-managed-data", "dockge-zerobyte-managed-restores" ].includes(source)) {
            throw new Error("Invalid or protected Docker named volume");
        }
        const key = `${kind}:${normalized}`;
        if (seen.has(key)) {
            throw new Error("Duplicate Zerobyte mount source");
        }
        seen.add(key);
        mounts.push({ kind,
            source: normalized,
            target: managedMountTarget(normalized, kind) });
    }
    // A nested source can create overlapping backups with independent policies.
    for (let i = 0; i < mounts.length; i++) {
        for (let j = i + 1; j < mounts.length; j++) {
            if (mounts[i].kind === "bind" && mounts[j].kind === "bind" &&
                (within(mounts[i].source, mounts[j].source) || within(mounts[j].source, mounts[i].source))) {
                throw new Error("Overlapping Zerobyte source directories are not allowed");
            }
        }
    }
    return mounts;
}

/** Repository targets are writable; source targets remain read-only. */
export function normalizeManagedDestinations(value: unknown, forbiddenHostPaths: string[] = []): LocalSourceMount[] {
    return normalizeManagedSources(value, forbiddenHostPaths).map(mount => ({
        ...mount,
        target: `/destinations/store-${createHash("sha256").update(mount.kind + ":" + mount.source).digest("hex").slice(0, 12)}`,
    }));
}

/** Never let repositories overlap sources or another local repository. */
export function assertDisjointManagedMounts(sources: LocalSourceMount[], destinations: LocalSourceMount[]): void {
    const combined = [ ...sources, ...destinations ];
    for (let i = 0; i < combined.length; i++) {
        for (let j = i + 1; j < combined.length; j++) {
            const a = combined[i];
            const b = combined[j];
            if (a.kind === "volume" && b.kind === "volume" && a.source === b.source) {
                throw new Error("One Docker volume cannot belong to multiple Zerobyte sources or destinations");
            }
            if (a.kind === "bind" && b.kind === "bind" && (within(a.source, b.source) || within(b.source, a.source))) {
                throw new Error("Zerobyte source and destination directories must not overlap");
            }
        }
    }
}

