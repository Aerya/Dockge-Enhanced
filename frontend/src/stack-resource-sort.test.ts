import assert from "node:assert/strict";
import test from "node:test";
import { compareStackResources } from "./stack-resource-sort";
import { resourceHistorySegments } from "./stack-resource-chart";

test("sort CPU and RAM descending without mixing identically named stacks across instances", () => {
    const stacks = [{ name: "app",
        endpoint: "remote" }, { name: "app" }, { name: "missing" }, { name: "alias",
        externalProject: "real-project" }];
    const stats = {
        "": { app: { cpu: 100,
            memUsed: 2 },
        "real-project": { cpu: 100,
            memUsed: 5 } },
        remote: { app: { cpu: 200,
            memUsed: 1 } },
    };
    assert.deepEqual([ ...stacks ].sort((a, b) => compareStackResources(a, b, "cpu", stats)).map(x => x.endpoint || x.name), [ "remote", "alias", "app", "missing" ]);
    assert.deepEqual([ ...stacks ].sort((a, b) => compareStackResources(a, b, "ram", stats)).map(x => x.endpoint || x.name), [ "alias", "app", "remote", "missing" ]);
    assert.deepEqual([ ...stacks ].sort((a, b) => compareStackResources(a, b, "cpuRam", stats)).map(x => x.endpoint || x.name), [ "remote", "alias", "app", "missing" ]);
});

test("charts leave a gap when recording is interrupted", () => {
    const point = (sampledAt: string) => ({ sampledAt,
        cpuPercent: 1,
        memUsed: 2 });
    const points = [ point("2026-10-16T10:00:00Z"), point("2026-10-16T10:05:00Z"), point("2026-10-16T12:00:00Z") ];
    const segments = resourceHistorySegments(points, 300);
    assert.deepEqual(segments.map(x => x.length), [ 2, 1 ]);
    assert.equal(resourceHistorySegments([ point("invalid") ], 300).length, 0);
});
