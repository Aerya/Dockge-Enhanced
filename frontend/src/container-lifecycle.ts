export function containerUptime(startedAt: unknown, state: unknown, now = Date.now()): string | null {
    if (state !== "running" || typeof startedAt !== "string" || startedAt.startsWith("0001-")) {
        return null;
    }
    const start = Date.parse(startedAt);
    if (!Number.isFinite(start) || start > now) {
        return null;
    }
    const seconds = Math.floor((now - start) / 1000);
    const hours = Math.floor(seconds / 3600);
    return `${hours}:${String(Math.floor(seconds / 60) % 60).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}
