/** Canonical tags shared by the dashboard and backend. */
export function normalizeAgentTags(value: unknown): string[] {
    if (!Array.isArray(value) || value.length > 20 || value.some(tag => typeof tag !== "string" || tag.trim().length > 40 || /[\u0000-\u001f,]/.test(tag))) {
        throw new Error("Use at most 20 tags of 40 characters, without commas or control characters");
    }
    return [ ...new Set(value.map(tag => tag.trim().toLowerCase()).filter(Boolean)) ].sort();
}

export function filterStacksByAgentTag<T extends { endpoint?: string }>(stacks: T[], agents: Record<string, { tags?: string[] }>, tag: string): T[] {
    return tag ? stacks.filter(stack => agents[stack.endpoint || ""]?.tags?.includes(tag)) : stacks;
}
