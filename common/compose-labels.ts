export const LABEL_STATUS_IGNORE = "dockge.status.ignore";
export const LABEL_IMAGEUPDATES_CHECK = "dockge.imageupdates.check";

type ComposeLabels = Record<string, unknown> | unknown[] | undefined;

export function composeLabelValue(labels: ComposeLabels, key: string): unknown {
    if (Array.isArray(labels)) {
        const prefix = `${key}=`;
        const entry = labels.find(value => typeof value === "string" && (value === key || value.startsWith(prefix)));
        if (typeof entry !== "string") {
            return undefined;
        }
        return entry === key ? "" : entry.slice(prefix.length);
    }
    if (labels && typeof labels === "object") {
        return labels[key];
    }
    return undefined;
}

export function composeLabelIsTrue(labels: ComposeLabels, key: string): boolean {
    const value = composeLabelValue(labels, key);
    return value === true || (typeof value === "string" && value.trim().toLowerCase() === "true");
}

export function composeLabelIsFalse(labels: ComposeLabels, key: string): boolean {
    const value = composeLabelValue(labels, key);
    return value === false || (typeof value === "string" && value.trim().toLowerCase() === "false");
}

export function setComposeLabel(service: Record<string, unknown>, key: string, value: string | null): void {
    const labels = service.labels;
    if (Array.isArray(labels)) {
        const prefix = `${key}=`;
        const filtered = labels.filter(entry => typeof entry !== "string" || (entry !== key && !entry.startsWith(prefix)));
        if (value !== null) {
            filtered.push(`${key}=${value}`);
        }
        if (filtered.length > 0) {
            service.labels = filtered;
        } else {
            delete service.labels;
        }
        return;
    }

    const mapped = labels && typeof labels === "object" ? labels as Record<string, unknown> : {};
    if (value === null) {
        delete mapped[key];
    } else {
        mapped[key] = value;
    }
    if (Object.keys(mapped).length > 0) {
        service.labels = mapped;
    } else {
        delete service.labels;
    }
}
