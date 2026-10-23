/** One wall-clock timezone for this instance; durations and persisted UTC instants are unchanged. */
let configuredTimezone: string | undefined;
const listeners = new Set<() => void>();

export function validateSchedulingTimezone(value: unknown): string {
    if (typeof value !== "string" || !value || value.length > 100) {
        throw new Error("Invalid scheduling timezone");
    }
    return new Intl.DateTimeFormat("en", { timeZone: value }).resolvedOptions().timeZone;
}

export function getSchedulingTimezone(): string {
    return configuredTimezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC";
}

export function setSchedulingTimezone(value: unknown): void {
    const next = value === undefined || value === null || value === "" ? undefined : validateSchedulingTimezone(value);
    const previous = getSchedulingTimezone();
    configuredTimezone = next;
    if (previous !== getSchedulingTimezone()) {
        for (const listener of listeners) {
            listener();
        }
    }
}

export function onSchedulingTimezoneChange(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}

export function schedulingClock(now = new Date()) {
    const parts = new Intl.DateTimeFormat("en-GB", {
        timeZone: getSchedulingTimezone(),
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
    }).formatToParts(now);
    const part = (name: string) => Number(parts.find(item => item.type === name)?.value);
    const year = part("year");
    const month = part("month");
    const day = part("day");
    return { year,
        month,
        day,
        hour: part("hour"),
        minute: part("minute"),
        weekday: new Date(Date.UTC(year, month - 1, day)).getUTCDay() };
}
