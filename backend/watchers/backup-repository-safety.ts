/** Check configured backup sources against actual local Restic repositories.
 * Paths are always from server-side settings, not untrusted browser input.
 */
import path from "node:path";

export interface RepositoryMount { source: string;
    destination: string }

function sameOrChild(candidate: string, root: string): boolean {
    return candidate === root || candidate.startsWith(`${root}${path.sep}`);
}

export function resolveHostRepositoryPath(containerPath: string, mounts: RepositoryMount[]): string {
    const p = path.resolve(containerPath);
    const mount = [ ...mounts ]
        .filter(item => path.isAbsolute(item.destination) && path.isAbsolute(item.source) && sameOrChild(p, path.resolve(item.destination)))
        .sort((a, b) => b.destination.length - a.destination.length)[0];
    if (!mount) {
        return p;
    }
    return path.resolve(mount.source, path.relative(mount.destination, p));
}

/**
 * Fail if someone explicitly selected the repository or one of its children.
 * Otherwise supply exact directory exclusions and archived-repository patterns,
 * also under aliases of the same host bind mount.
 */
export function resticRepositoryExcludes(
    paths: readonly string[],
    repositoryPaths: readonly string[],
    mounts: readonly RepositoryMount[] = [],
): string[] {
    const result = new Set<string>();
    for (const raw of repositoryPaths) {
        if (!path.isAbsolute(raw)) {
            throw new Error("Local Restic repository path must be absolute");
        }
        const repo = path.resolve(raw);
        if (repo === path.parse(repo).root) {
            throw new Error("Local Restic repository cannot be the filesystem root");
        }
        const realHostRepo = resolveHostRepositoryPath(repo, [ ...mounts ]);
        const aliases = new Set<string>([ repo ]);
        for (const source of paths) {
            if (!path.isAbsolute(source)) {
                continue;
            }
            const src = path.resolve(source);
            const srcHost = resolveHostRepositoryPath(src, [ ...mounts ]);
            if (sameOrChild(srcHost, realHostRepo)) {
                throw new Error(`Backup source ${src} is within Restic repository ${repo}`);
            }
            if (sameOrChild(realHostRepo, srcHost)) {
                aliases.add(path.resolve(src, path.relative(srcHost, realHostRepo)));
            }
        }
        for (const alias of aliases) {
            result.add(alias);
            const parent = path.dirname(alias);
            const base = path.basename(alias);
            result.add(path.join(parent, `.${base}.dockge-restic-archive-*`));
            result.add(path.join(parent, `${base}.failed-init-*`));
        }
    }
    return [ ...result ];
}

/** Disallow mount roots and symlinked/ambiguous locations before any reset I/O.
 * The server also checks the real path, type and Restic config before archiving.
 */
export function assertLocalRepositoryLocation(
    candidate: string,
    mounts: readonly RepositoryMount[],
    forbidden: readonly string[] = [],
): string {
    if (!path.isAbsolute(candidate) || candidate.length > 1000 || candidate.includes("\0")) {
        throw new Error("Local repository path must be an absolute, bounded path");
    }
    const repo = path.resolve(candidate);
    if (repo === path.parse(repo).root) {
        throw new Error("Cannot reset a filesystem root");
    }
    if (forbidden.some(item => path.resolve(item) === repo)) {
        throw new Error("Cannot reset an application-data or stack root");
    }
    const boundaries = mounts.filter(m =>
        path.isAbsolute(m.destination) && path.isAbsolute(m.source)
    ).map(m => path.resolve(m.destination));
    if (boundaries.includes(repo)) {
        throw new Error("Cannot reset a Docker mount root");
    }
    if (!boundaries.some(mount => repo.startsWith(`${mount}${path.sep}`))) {
        throw new Error("Repository must be inside a persistent Docker volume or bind mount");
    }
    return repo;
}
