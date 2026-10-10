import type { ImageStatus } from "./shared";

export type ImageStatusSort = "stack" | "errors";

export interface ImageStatusGroup {
    stack: string;
    items: ImageStatus[];
}

/** Preserve the regular stack order unless errors-first has been selected. */
export function groupImageStatuses(statuses: ImageStatus[], sort: ImageStatusSort): ImageStatusGroup[] {
    const groups = new Map<string, ImageStatus[]>();
    for (const status of statuses) {
        const items = groups.get(status.stack) ?? [];
        items.push(status);
        groups.set(status.stack, items);
    }

    const result = [ ...groups.entries() ].map(([ stack, items ]) => ({ stack,
        items: [ ...items ] }));
    if (sort !== "errors") {
        return result;
    }

    for (const group of result) {
        group.items.sort((left, right) => Number(Boolean(right.error)) - Number(Boolean(left.error)) || left.image.localeCompare(right.image));
    }
    return result.sort((left, right) =>
        Number(right.items.some((status) => Boolean(status.error))) - Number(left.items.some((status) => Boolean(status.error))) || left.stack.localeCompare(right.stack));
}
