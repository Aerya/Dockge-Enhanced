export const COMPOSE_EDIT_LEASE_TTL_MS = 75_000;

const ALLOWED_HOLD_MINUTES = new Set([ 0, 30, 60 ]);

export interface ComposeEditLeaseInput {
    sessionId: string;
    stackName: string;
    dirty: boolean;
    holdMinutes?: number;
}

export interface ComposeEditLeaseSnapshot {
    sessionId: string;
    stackName: string;
    dirty: boolean;
    heartbeatExpiresAt: number;
    holdUntil: number;
}

function normalizeSessionId(value: unknown): string {
    const sessionId = typeof value === "string" ? value.trim() : "";
    if (!/^[a-zA-Z0-9:_-]{8,160}$/.test(sessionId)) {
        throw new Error("Invalid compose edit session ID");
    }
    return sessionId;
}

function normalizeStackName(value: unknown): string {
    const stackName = typeof value === "string" ? value.trim() : "";
    if (!stackName || stackName.length > 200 || /[\x00-\x1f\x7f]/.test(stackName)) {
        throw new Error("Invalid compose edit stack name");
    }
    return stackName;
}

function normalizeHoldMinutes(value: unknown): number | undefined {
    if (value === undefined || value === null) return undefined;
    const minutes = Number(value);
    if (!Number.isInteger(minutes) || !ALLOWED_HOLD_MINUTES.has(minutes)) {
        throw new Error("Invalid compose edit defer duration");
    }
    return minutes;
}

export class ComposeEditLeaseManager {
    private static instance: ComposeEditLeaseManager;
    private leases = new Map<string, ComposeEditLeaseSnapshot>();

    static getInstance(): ComposeEditLeaseManager {
        if (!ComposeEditLeaseManager.instance) {
            ComposeEditLeaseManager.instance = new ComposeEditLeaseManager();
        }
        return ComposeEditLeaseManager.instance;
    }

    update(input: ComposeEditLeaseInput, now = Date.now()): ComposeEditLeaseSnapshot | null {
        const sessionId = normalizeSessionId(input?.sessionId);
        const stackName = normalizeStackName(input?.stackName);
        if (typeof input?.dirty !== "boolean") {
            throw new Error("Invalid compose edit dirty state");
        }
        const holdMinutes = normalizeHoldMinutes(input?.holdMinutes);
        const previous = this.leases.get(sessionId);
        const requestedHoldUntil = holdMinutes && holdMinutes > 0 ? now + holdMinutes * 60_000 : 0;
        const holdUntil = Math.max(previous?.holdUntil ?? 0, requestedHoldUntil);

        if (!input.dirty && holdUntil <= now) {
            this.leases.delete(sessionId);
            return null;
        }

        const lease: ComposeEditLeaseSnapshot = {
            sessionId,
            stackName,
            dirty: input.dirty,
            heartbeatExpiresAt: now + COMPOSE_EDIT_LEASE_TTL_MS,
            holdUntil,
        };
        this.leases.set(sessionId, lease);
        return { ...lease };
    }

    release(sessionIdValue: unknown, clearHold = false, now = Date.now()): void {
        const sessionId = normalizeSessionId(sessionIdValue);
        const lease = this.leases.get(sessionId);
        if (!lease) return;
        if (!clearHold && lease.holdUntil > now) {
            this.leases.set(sessionId, {
                ...lease,
                dirty: false,
                heartbeatExpiresAt: now,
            });
            return;
        }
        this.leases.delete(sessionId);
    }

    hasBlockingLease(now = Date.now()): boolean {
        this.prune(now);
        for (const lease of this.leases.values()) {
            if ((lease.dirty && lease.heartbeatExpiresAt > now) || lease.holdUntil > now) {
                return true;
            }
        }
        return false;
    }

    getBlockingStacks(now = Date.now()): string[] {
        this.prune(now);
        return [ ...new Set(
            [ ...this.leases.values() ]
                .filter((lease) => (lease.dirty && lease.heartbeatExpiresAt > now) || lease.holdUntil > now)
                .map((lease) => lease.stackName),
        ) ].sort();
    }

    clearForTests(): void {
        this.leases.clear();
    }

    private prune(now: number): void {
        for (const [ sessionId, lease ] of this.leases) {
            const heartbeatAlive = lease.dirty && lease.heartbeatExpiresAt > now;
            const holdAlive = lease.holdUntil > now;
            if (!heartbeatAlive && !holdAlive) {
                this.leases.delete(sessionId);
            }
        }
    }
}
