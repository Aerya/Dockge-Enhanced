import * as fs from "fs";

export const STANDARD_DATA_DIR = "/app/data";
export const LEGACY_DATA_DIR = "/opt/dockge/data";

export interface DataDirResolutionOptions {
    dataDir?: string;
    standardDataDir?: string;
    legacyDataDir?: string;
    exists?: (directory: string) => boolean;
    readDirectory?: (directory: string) => string[];
}

function hasData(directory: string, exists: (directory: string) => boolean, readDirectory: (directory: string) => string[]): boolean {
    if (!exists(directory)) {
        return false;
    }
    try {
        return readDirectory(directory).length > 0;
    } catch {
        return false;
    }
}

/**
 * Resolves Dockge-Enhanced's persistent data directory.
 *
 * `/app/data` is the current image volume contract. A non-empty legacy
 * `/opt/dockge/data` directory wins only when the current directory has no
 * data, preventing an upgrade from silently abandoning an existing install.
 */
export function resolveDataDir(options: DataDirResolutionOptions = {}): string {
    const explicit = options.dataDir ?? process.env.DOCKGE_DATA_DIR;
    if (explicit?.trim()) {
        return explicit;
    }

    const standard = options.standardDataDir ?? STANDARD_DATA_DIR;
    const legacy = options.legacyDataDir ?? LEGACY_DATA_DIR;
    const exists = options.exists ?? fs.existsSync;
    const readDirectory = options.readDirectory ?? fs.readdirSync;
    const standardHasData = hasData(standard, exists, readDirectory);

    if (hasData(legacy, exists, readDirectory) && !standardHasData) {
        return legacy;
    }
    if (exists(standard)) {
        return standard;
    }
    if (exists(legacy)) {
        return legacy;
    }

    // The Dockerfile declares this path as its data volume. It is the only
    // safe default for a new install; mkdir/write errors are propagated.
    return standard;
}
