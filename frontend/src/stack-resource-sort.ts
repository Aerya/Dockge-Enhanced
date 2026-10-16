export interface ResourceSortStack {
    name: string;
    displayName?: string;
    externalProject?: string;
    endpoint?: string;
}

export type ResourceSort = "cpu" | "ram" | "cpuRam";

export function compareStackResources(
    left: ResourceSortStack,
    right: ResourceSortStack,
    sort: ResourceSort,
    stats: Record<string, Record<string, { cpu: number;
        memUsed: number }>>,
): number {
    const first = stats[left.endpoint || ""]?.[left.externalProject || left.name];
    const second = stats[right.endpoint || ""]?.[right.externalProject || right.name];
    if (!first || !second) {
        if (first) {
            return -1;
        }
        if (second) {
            return 1;
        }
    } else {
        const difference = sort === "ram" ? second.memUsed - first.memUsed : second.cpu - first.cpu;
        if (difference !== 0) {
            return difference;
        }
        if (sort === "cpuRam" && second.memUsed !== first.memUsed) {
            return second.memUsed - first.memUsed;
        }
    }
    return (left.displayName || left.name).localeCompare(right.displayName || right.name, undefined, { sensitivity: "base" }) ||
        (left.endpoint || "").localeCompare(right.endpoint || "");
}
