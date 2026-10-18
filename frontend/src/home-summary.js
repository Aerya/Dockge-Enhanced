// Missing/offline instances are never silently included as healthy.
export function aggregateHomeValues(values, backup = false) {
    const known = values.filter(value => value && value.state !== "unavailable");
    const enabled = known.filter(value => value.state !== "disabled");
    return {
        count: enabled.reduce((sum, value) => sum + (value.count || 0), 0),
        healthy: enabled.filter(value => value.state === "ok").length,
        enabled: enabled.length,
        total: values.length,
        missing: values.length - known.length,
        disabled: known.length - enabled.length,
        state: known.length !== values.length ? "unavailable" : enabled.length === 0 ? "disabled"
            : enabled.some(value => value.state !== "ok") ? "warn" : "ok",
        backup,
    };
}

export function homeSummaryValue(data, kind, now = Date.now()) {
    if (!data) return { state: "unavailable" };
    if (!data.enabled) return { state: "disabled" };
    if (kind === "backup") {
        const ageMs = data.timestamp ? Math.max(0, now - new Date(data.timestamp).getTime()) : null;
        return { state: ageMs === null || !Number.isFinite(ageMs) || ageMs > (Number(data.intervalHours) || 24) * 5400000 ? "warn" : "ok", ageMs };
    }
    if (!Number.isFinite(data.count) || data.count < 0) return { state: "unavailable" };
    return { state: data.count > 0 ? "warn" : "ok", count: data.count };
}

export function homeInstanceLink(base, tab) {
    try {
        const url = new URL(base);
        if (!["http:", "https:"].includes(url.protocol)) return null;
        url.username = "";
        url.password = "";
        url.pathname = url.pathname.replace(/\/$/, "") + "/watcher";
        url.search = "?tab=" + encodeURIComponent(tab);
        url.hash = "";
        return url.href;
    } catch { return null; }
}
