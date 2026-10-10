import path from "node:path";

const pendingMetadataWrites = new Map<string, Promise<void>>();

/** Serialize read-modify-write metadata updates across stack operations. */
export async function withStackMetadataWriteLock<T>(metadataPath: string, task: () => Promise<T>): Promise<T> {
    const key = path.resolve(metadataPath);
    const previous = pendingMetadataWrites.get(key) ?? Promise.resolve();
    const current = previous.catch(() => undefined).then(task);
    const queued = current.then(() => undefined, () => undefined);
    pendingMetadataWrites.set(key, queued);
    try {
        return await current;
    } finally {
        if (pendingMetadataWrites.get(key) === queued) {
            pendingMetadataWrites.delete(key);
        }
    }
}
