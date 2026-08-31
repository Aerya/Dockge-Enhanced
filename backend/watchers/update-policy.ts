export interface UpdatePause {
    enabled: boolean;
    until: string | null;
}

export const DEFAULT_UPDATE_PAUSE: UpdatePause = {
    enabled: false,
    until: null,
};

export function normalizeUpdatePause(value: unknown): UpdatePause {
    if (!value || typeof value !== "object") {
        return { ...DEFAULT_UPDATE_PAUSE };
    }

    const raw = value as Record<string, unknown>;
    const until = typeof raw.until === "string" && Number.isFinite(Date.parse(raw.until))
        ? new Date(raw.until).toISOString()
        : null;

    return {
        enabled: raw.enabled === true,
        until,
    };
}

/** A pause without an end date is indefinite. Expired pauses no longer block updates. */
export function isUpdatePaused(value: unknown, now = new Date()): boolean {
    const pause = normalizeUpdatePause(value);
    return pause.enabled && (!pause.until || Date.parse(pause.until) > now.getTime());
}

export function updatePauseExpires(value: unknown, now = new Date()): boolean {
    const pause = normalizeUpdatePause(value);
    return pause.enabled && !!pause.until && Date.parse(pause.until) <= now.getTime();
}

export function isWithinMaintenanceWindow(start: string, end: string, now = new Date()): boolean {
    const valid = /^([01]\d|2[0-3]):[0-5]\d$/;
    if (!valid.test(start) || !valid.test(end)) {
        return false;
    }

    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const toMinutes = (value: string) => Number(value.slice(0, 2)) * 60 + Number(value.slice(3, 5));
    const startMinutes = toMinutes(start);
    const endMinutes = toMinutes(end);

    if (startMinutes === endMinutes) {
        return true;
    }
    return startMinutes < endMinutes
        ? currentMinutes >= startMinutes && currentMinutes < endMinutes
        : currentMinutes >= startMinutes || currentMinutes < endMinutes;
}
