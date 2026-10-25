import { AsyncLocalStorage } from "node:async_hooks";

const owners = new Map<string, symbol>();
const context = new AsyncLocalStorage<ReadonlyMap<string, symbol>>();
const draining = new Set<string>();

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
    ids.forEach(id => draining.add(id));
    return () => ids.forEach(id => draining.delete(id));
}

export function isRolloutDraining(id: string): boolean {
    return draining.has(id);
}
