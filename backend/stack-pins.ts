import { ValidationError } from "./util-server";

export const STACK_PINS_SETTING_KEY = "pinnedStacks";

export function normalizePinnedStacks(value: unknown): string[] {
    let parsed = value;
    if (typeof parsed === "string") {
        if (!parsed.trim()) return [];
        try {
            parsed = JSON.parse(parsed);
        } catch {
            return [];
        }
    }
    if (!Array.isArray(parsed)) return [];

    const result: string[] = [];
    const seen = new Set<string>();
    for (const item of parsed) {
        if (typeof item !== "string") continue;
        const name = item.trim();
        if (!name || name.length > 255 || /[\u0000-\u001f\u007f]/.test(name) || seen.has(name)) continue;
        seen.add(name);
        result.push(name);
    }
    return result;
}

export function applyStackPin(current: unknown, name: unknown, pinned: unknown): string[] {
    if (typeof name !== "string") throw new ValidationError("Stack name must be a string");
    const normalizedName = name.trim();
    if (!normalizedName || normalizedName.length > 255 || /[\u0000-\u001f\u007f]/.test(normalizedName)) {
        throw new ValidationError("Invalid stack name");
    }
    if (typeof pinned !== "boolean") throw new ValidationError("Pinned state must be a boolean");

    const existing = normalizePinnedStacks(current);
    if (pinned) return existing.includes(normalizedName) ? existing : [ ...existing, normalizedName ];
    return existing.filter(candidate => candidate !== normalizedName);
}
