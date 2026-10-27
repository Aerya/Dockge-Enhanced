export const DEFAULT_SCHEDULED_TIME = "02:00";

export function isScheduledTime(value: unknown): value is string {
    return typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

/** Missing values use the hosting instance's default; explicit invalid input is rejected. */
export function resolveScheduledTime(value: unknown, defaultTime: string = DEFAULT_SCHEDULED_TIME): string {
    const time = value === undefined ? defaultTime : value;
    if (!isScheduledTime(time)) {
        throw new Error("Heure HH:MM invalide");
    }
    return time;
}
