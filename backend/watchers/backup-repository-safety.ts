/** Check proposed or stored backup sources against local Restic repositories. */
import path from "node:path";
import fs from "node:fs/promises";

export interface RepositoryMount { source: string;
    destination: string }

function sameOrChild(candidate: string, root: string): boolean {
    return candidate === root || candidate.startsWith(root.endsWith(path.sep) ? root : `${root}${path.sep}`);
}

function unambiguousAbsolutePath(candidate: string): boolean {
    return path.isAbsolute(candidate) && !candidate.split(path.sep).includes("..");
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

/** Resolve symlinked existing parents while still accepting a new repository directory. */
async function canonicalPath(candidate: string): Promise<string> {
    const absolute = path.resolve(candidate);
    let existing = absolute;
    while (true) {
        try {
            return path.resolve(await fs.realpath(existing), path.relative(existing, absolute));
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
                throw error;
            }
            const parent = path.dirname(existing);
            if (parent === existing) {
                throw error;
            }
            existing = parent;
        }
    }
}

export interface RepositoryOverlapWarning { source: string;
    repository: string }

/** A parent source is allowed only because Restic excludes the repository below it. */
export async function checkRepositorySourceOverlap(
    sources: readonly string[],
    repositoryPaths: readonly string[],
    mounts: readonly RepositoryMount[] = [],
): Promise<RepositoryOverlapWarning[]> {
    const warnings: RepositoryOverlapWarning[] = [];
    for (const rawRepository of repositoryPaths) {
        if (!unambiguousAbsolutePath(rawRepository)) {
            throw new Error("Local Restic repository path must be absolute and contain no parent traversal");
        }
        const repository = await canonicalPath(rawRepository);
        const hostRepository = resolveHostRepositoryPath(repository, [ ...mounts ]);
        for (const rawSource of sources) {
            if (!unambiguousAbsolutePath(rawSource)) {
                throw new Error(`Backup source must be absolute and contain no parent traversal: ${rawSource}`);
            }
            const source = await canonicalPath(rawSource);
            const hostSource = resolveHostRepositoryPath(source, [ ...mounts ]);
            if (sameOrChild(hostSource, hostRepository)) {
                throw new Error(`Le dossier à sauvegarder ${rawSource} est dans le dépôt Restic local ${rawRepository} : ce chemin ne peut pas être sauvegardé.`);
            }
            if (sameOrChild(hostRepository, hostSource)) {
                warnings.push({ source: rawSource,
                    repository: rawRepository });
            }
        }
    }
    return warnings;
}

export async function canonicalRepositoryPaths(repositoryPaths: readonly string[]): Promise<string[]> {
    return Promise.all(repositoryPaths.map(canonicalPath));
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
