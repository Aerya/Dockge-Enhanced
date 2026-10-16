export interface ResourceHistoryPoint {
    sampledAt: string;
    cpuPercent: number;
    memUsed: number;
}

/** Leave actual collection outages visible instead of connecting across them. */
export function resourceHistorySegments(points: ResourceHistoryPoint[], bucketSeconds: number): ResourceHistoryPoint[][] {
    const segments: ResourceHistoryPoint[][] = [];
    let previous = Number.NEGATIVE_INFINITY;
    for (const point of points) {
        const timestamp = Date.parse(point.sampledAt);
        if (!Number.isFinite(timestamp)) {
            continue;
        }
        if (!segments.length || timestamp - previous > Math.max(600, bucketSeconds * 2) * 1000) {
            segments.push([]);
        }
        segments[segments.length - 1].push(point);
        previous = timestamp;
    }
    return segments;
}
