import { RUNNING } from "../../common/util-common";
import { DockgeServer } from "../dockge-server";
import { log } from "../log";
import { StartGuard, Stack } from "../stack";

const POLL_INTERVAL_MS = 5_000;

interface WatchState {
    fingerprint: string;
    lastReady?: boolean;
    failureSince?: number;
    recoverySince?: number;
    stoppedByWatcher: boolean;
    mountGenerations?: string;
    recreateOnRecovery: boolean;
    busy: boolean;
}

/**
 * Stops a running stack after its configured host prerequisites have remained
 * unavailable, and only resumes stacks this watcher stopped itself. State is
 * deliberately process-local: a Dockge restart never starts an old stack.
 */
export class StartGuardWatcher {
    private static instance?: StartGuardWatcher;
    private server?: DockgeServer;
    private timer?: ReturnType<typeof setInterval>;
    private checking = false;
    private states = new Map<string, WatchState>();

    static getInstance(): StartGuardWatcher {
        if (!StartGuardWatcher.instance) StartGuardWatcher.instance = new StartGuardWatcher();
        return StartGuardWatcher.instance;
    }

    async start(server: DockgeServer): Promise<void> {
        this.server = server;
        if (this.timer) return;
        this.timer = setInterval(() => void this.check(), POLL_INTERVAL_MS);
        await this.check();
    }

    stop(): void {
        if (this.timer) clearInterval(this.timer);
        this.timer = undefined;
        this.states.clear();
    }

    /** Called for explicit user stop/down/delete actions. */
    cancelForManualAction(stackName: string): void {
        this.states.delete(stackName);
    }

    async check(now = Date.now()): Promise<void> {
        if (this.checking || !this.server) return;
        this.checking = true;
        try {
            const stacks = await Stack.getStackList(this.server, true);
            const seen = new Set<string>();
            for (const stack of stacks.values()) {
                if (!stack.isManagedByDockge) continue;
                const guard = await stack.getStartGuard();
                if (!guard.enabled || !guard.watch || guard.conditions.length === 0) continue;
                seen.add(stack.name);
                await this.checkStack(stack, guard, now);
            }
            for (const name of this.states.keys()) {
                if (!seen.has(name)) this.states.delete(name);
            }
        } catch (error) {
            log.error("start-guard-watcher", error instanceof Error ? error.message : String(error));
        } finally {
            this.checking = false;
        }
    }

    private async checkStack(stack: Stack, guard: StartGuard, now: number): Promise<void> {
        const fingerprint = JSON.stringify(guard);
        let state = this.states.get(stack.name);
        if (!state || state.fingerprint !== fingerprint) {
            state = { fingerprint, stoppedByWatcher: false, recreateOnRecovery: false, busy: false };
            this.states.set(stack.name, state);
        }
        if (state.busy) return;

        const guardStatus = await stack.getStartGuardStatus();
        const ready = guardStatus.ready;
        const mountGenerations = JSON.stringify(guardStatus.conditions
            .filter((condition) => condition.type === "mount")
            .map((condition) => [ condition.mountPoint ?? condition.target, condition.mountGeneration ?? "" ]));
        await stack.updateStatus();
        if (!ready) {
            if (stack.status === RUNNING && guardStatus.conditions.some((condition) => condition.type === "mount" && !condition.ok)) {
                // A running container keeps the old FUSE mount namespace even
                // when the host mount returns before the failure delay expires.
                state.recreateOnRecovery = true;
            }
            state.recoverySince = undefined;
            if (state.lastReady !== false) state.failureSince = now;
            state.lastReady = false;
            if (guard.onFailure === "stop" && stack.status === RUNNING && state.failureSince !== undefined && now - state.failureSince >= guard.failureDelaySeconds * 1000) {
                state.busy = true;
                try {
                    await stack.stopInBackground();
                    state.stoppedByWatcher = true;
                    state.failureSince = undefined;
                    log.info("start-guard-watcher", `Stopped ${stack.name}: prerequisite unavailable`);
                } catch (error) {
                    log.error("start-guard-watcher", `Unable to stop ${stack.name}: ${error instanceof Error ? error.message : String(error)}`);
                } finally {
                    state.busy = false;
                }
            }
            return;
        }

        state.failureSince = undefined;
        const mountChanged = state.mountGenerations !== undefined && state.mountGenerations !== mountGenerations;
        if (mountChanged && stack.status === RUNNING) state.recreateOnRecovery = true;
        state.mountGenerations = mountGenerations;
        if (state.lastReady !== true || mountChanged) state.recoverySince = now;
        state.lastReady = true;
        if (guard.onRecovery !== "start" || (!state.stoppedByWatcher && !state.recreateOnRecovery)) return;
        if (state.recoverySince === undefined || now - state.recoverySince < guard.recoveryDelaySeconds * 1000) return;
        if (state.stoppedByWatcher && stack.status === RUNNING) {
            state.stoppedByWatcher = false;
            state.recreateOnRecovery = false;
            state.recoverySince = undefined;
            return;
        }
        state.busy = true;
        try {
            if (state.stoppedByWatcher) {
                await stack.startScheduled();
            } else if (stack.status === RUNNING) {
                await stack.recreateScheduled();
            } else {
                state.recreateOnRecovery = false;
                state.recoverySince = undefined;
                return;
            }
            state.stoppedByWatcher = false;
            state.recreateOnRecovery = false;
            state.recoverySince = undefined;
            log.info("start-guard-watcher", `Recreated ${stack.name}: prerequisites recovered or a host mount was replaced`);
        } catch (error) {
            log.error("start-guard-watcher", `Unable to restart ${stack.name}: ${error instanceof Error ? error.message : String(error)}`);
        } finally {
            state.busy = false;
        }
    }
}
