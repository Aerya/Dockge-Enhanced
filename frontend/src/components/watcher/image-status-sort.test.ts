import assert from "node:assert/strict";
import test from "node:test";
import { groupImageStatuses } from "./image-status-sort";

const status = (stack: string, image: string, error?: string) => ({
    stack,
    image,
    localDigest: "",
    remoteDigest: "",
    hasUpdate: false,
    lastChecked: "2026-10-10T00:00:00.000Z",
    error,
});

test("keeps the watcher status order with the default stack sort", () => {
    const groups = groupImageStatuses([
        status("normal", "one"),
        status("broken", "two", "registry timeout"),
    ], "stack");
    assert.deepEqual(groups.map((group) => group.stack), [ "normal", "broken" ]);
});

test("puts stacks and images with errors first", () => {
    const groups = groupImageStatuses([
        status("normal", "one"),
        status("broken", "ok"),
        status("broken", "failed", "401 Unauthorized"),
    ], "errors");
    assert.deepEqual(groups.map((group) => group.stack), [ "broken", "normal" ]);
    assert.deepEqual(groups[0].items.map((item) => item.image), [ "failed", "ok" ]);
});
