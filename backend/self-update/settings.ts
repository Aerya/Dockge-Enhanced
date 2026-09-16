import * as fs from "node:fs/promises";
import * as path from "node:path";
import { isWithinMaintenanceWindow, normalizeUpdatePause } from "../watchers/update-policy";
import { SelfUpdateSettings } from "./types";

export interface AutomaticImageUpdateWindow {
    start: string;
    end: string;
    days: number[];
}

export const DEFAULT_SELF_UPDATE_SETTINGS: SelfUpdateSettings = {
    mode: "manual",
    schedule: { type: "immediate", start: "03:00", end: "05:00", days: [ 0, 1, 2, 3, 4, 5, 6 ] },
    pause: { enabled: false, until: null },
};

export function normalizeSelfUpdateSettings(value: unknown): SelfUpdateSettings {
    const raw = value && typeof value === "object" ? value as Record<string, unknown> : {};
    const scheduleRaw = raw.schedule && typeof raw.schedule === "object" ? raw.schedule as Record<string, unknown> : {};
    const validTime = (time: unknown, fallback: string) => typeof time === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(time) ? time : fallback;
    const selectedDays = Array.isArray(scheduleRaw.days)
        ? [ ...new Set(scheduleRaw.days.filter((day): day is number => Number.isInteger(day) && day >= 0 && day <= 6)) ].sort()
        : [];
    const days = selectedDays.length > 0 ? selectedDays : [ ...DEFAULT_SELF_UPDATE_SETTINGS.schedule.days ];

    return {
        mode: raw.mode === "sidecar" || raw.mode === "agent" ? raw.mode : "manual",
        schedule: {
            type: scheduleRaw.type === "window" ? "window" : "immediate",
            start: validTime(scheduleRaw.start, DEFAULT_SELF_UPDATE_SETTINGS.schedule.start),
            end: validTime(scheduleRaw.end, DEFAULT_SELF_UPDATE_SETTINGS.schedule.end),
            days,
        },
        pause: normalizeUpdatePause(raw.pause),
    };
}

export function selfUpdateMayRun(settings: SelfUpdateSettings, now = new Date()): boolean {
    if (settings.mode !== "sidecar") return false;
    if (settings.pause.enabled && (!settings.pause.until || Date.parse(settings.pause.until) > now.getTime())) return false;
    return settings.schedule.type === "immediate" || (settings.schedule.days.includes(now.getDay()) && isWithinMaintenanceWindow(settings.schedule.start, settings.schedule.end, now));
}

/**
 * The self-update maintenance window is also the global window for automatic
 * container image updates. Manual image updates remain available at any time.
 */
export function getAutomaticImageUpdateWindow(settings: SelfUpdateSettings): AutomaticImageUpdateWindow | null {
    if (settings.mode !== "sidecar" || settings.schedule.type !== "window") return null;
    return {
        start: settings.schedule.start,
        end: settings.schedule.end,
        days: [ ...settings.schedule.days ],
    };
}

export function automaticImageUpdatesMayRun(settings: SelfUpdateSettings, now = new Date()): boolean {
    const window = getAutomaticImageUpdateWindow(settings);
    return !window || (window.days.includes(now.getDay()) && isWithinMaintenanceWindow(window.start, window.end, now));
}

export function selfUpdateSettingsPath(dataDir = process.env.DOCKGE_DATA_DIR ?? "/opt/dockge/data"): string {
    return path.join(dataDir, "self-update", "settings.json");
}

export async function readPersistedSelfUpdateSettings(dataDir?: string): Promise<SelfUpdateSettings> {
    try {
        const raw = await fs.readFile(selfUpdateSettingsPath(dataDir), "utf8");
        return normalizeSelfUpdateSettings(JSON.parse(raw));
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") {
            return normalizeSelfUpdateSettings(DEFAULT_SELF_UPDATE_SETTINGS);
        }
        throw error;
    }
}
