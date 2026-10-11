import type { SelfUpdateOperation } from "./types";

export function sidecarWatchState(operation: SelfUpdateOperation, now = Date.now()): "check" | "stalled-pull" | null {
    if (![ "updating", "waiting-health", "rolling-back" ].includes(operation.state)
        || !/^[a-f0-9]{32}$/.test(operation.id)) {
        return null;
    }
    const started = Date.parse(operation.stageStartedAt ?? operation.startedAt ?? "");
    if (!Number.isFinite(started) || started > now || now - started < 15_000) {
        return null;
    }
    return operation.stage === "pull-target" && now - started > 20 * 60_000 ? "stalled-pull" : "check";
}

export function updaterContainerFailure(raw: string): { stopped: boolean;
    detail: string } {
    const state = JSON.parse(raw) as { Running?: unknown;
        ExitCode?: unknown;
        Error?: unknown };
    if (state.Running === true) {
        return { stopped: false,
            detail: "" };
    }
    if (state.Running !== false) {
        throw new Error("Updater container state is incomplete");
    }
    const detail = typeof state.Error === "string" && state.Error.trim()
        ? state.Error.trim().slice(0, 240)
        : Number.isInteger(state.ExitCode) ? `exit code ${state.ExitCode}` : "unknown Docker error";
    return { stopped: true,
        detail };
}
