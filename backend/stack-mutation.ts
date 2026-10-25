import { AsyncLocalStorage } from "node:async_hooks";

const owners = new Map<string, symbol>();
const context = new AsyncLocalStorage<ReadonlyMap<string, symbol>>();
const draining = new Map<string, number>();
const pending = new Map<string, Set<string>>();
const recovery = new AsyncLocalStorage<string>();

/** Durable operations register here before listeners/watchers start. */
export function registerPendingRollout(project: string, id: string): void {
    const entries = pending.get(project) ?? new Set<string>();
    entries.add(id);
    pending.set(project, entries);
}

export function releasePendingRollout(project: string, id: string): void {
    const entries = pending.get(project);
    entries?.delete(id);
    if (!entries?.size) {
        pending.delete(project);
    }
}

export function hasPendingRollout(project: string): boolean {
    return !!pending.get(project)?.size;
}

export function withRolloutRecovery<T>(project: string, action: () => Promise<T>): Promise<T> {
    return recovery.run(project, () => withStackMutation(project, action));
}

/** Synchronous reservation, reentrant only within the owning async operation. */
export async function withStackMutation<T>(project: string, action: () => Promise<T>): Promise<T> {
    const current = context.getStore();
    const owner = owners.get(project);
    if (owner) {
        if (current?.get(project) === owner) {
            return action();
        }
        throw new Error("Another operation is active on this stack; retry when it finishes");
    }
    if (hasPendingRollout(project) && recovery.getStore() !== project) {
        throw new Error("Rolling update pending: waiting for connections or automatic recovery");
    }
    const token = Symbol(project);
    owners.set(project, token);
    const next = new Map(current);
    next.set(project, token);
    try {
        return await context.run(next, action);
    } finally {
        if (owners.get(project) === token) {
            owners.delete(project);
        }
    }
}

export function stackMutation<This extends { operationProject: string }, Args extends unknown[], Result>(
    method: (this: This, ...args: Args) => Promise<Result>,
    _context: ClassMethodDecoratorContext<This, (this: This, ...args: Args) => Promise<Result>>,
): (this: This, ...args: Args) => Promise<Result> {
    return function (...args: Args): Promise<Result> {
        return withStackMutation(this.operationProject, () => method.apply(this, args));
    };
}

/** Only intentionally drained old replicas are exempt from automatic healing. */
export function markRolloutDraining(ids: string[]): () => void {
    ids.forEach(id => draining.set(id, (draining.get(id) ?? 0) + 1));
    let released = false;
    return () => {
        if (released) {
            return;
        }
        released = true;
        for (const id of ids) {
            const count = (draining.get(id) ?? 1) - 1;
            if (count > 0) {
                draining.set(id, count);
            } else {
                draining.delete(id);
            }
        }
    };
}

export function isRolloutDraining(id: string): boolean {
    return draining.has(id);
}
