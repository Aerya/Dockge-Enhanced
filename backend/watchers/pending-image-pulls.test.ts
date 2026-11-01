import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { isPendingPullProtected, protectPendingPull, releasePendingPull, PENDING_PULL_GRACE_MS } from "./pending-image-pulls";

test("pending pulls survive restart, protect shared images and expire by download time", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pending-pull-test-"));
    const id = `sha256:${"a".repeat(64)}`;
    try {
        protectPendingPull("hub::app", "docker.io/library/alpine:latest", "", dir, 1000);
        assert.equal(isPendingPullProtected(id, [ "alpine:latest" ], dir, 1001), true);
        assert.equal(isPendingPullProtected(id, [ "ghcr.io/library/alpine:latest" ], dir, 1001), false);
        releasePendingPull("hub::app", dir);
        protectPendingPull("stack-a::app", "fixture/app:latest", "", dir, 1000);
        assert.equal(isPendingPullProtected(id, [ "fixture/app:latest" ], dir, 1001), true);
        protectPendingPull("stack-a::app", "fixture/app:latest", id, dir, 2000);
        protectPendingPull("stack-b::app", "fixture/app:latest", id, dir, 2000);
        releasePendingPull("stack-a::app", dir);
        assert.equal(isPendingPullProtected(id, [], dir, 2001), true);
        assert.equal(isPendingPullProtected(id, [], dir, 2000 + PENDING_PULL_GRACE_MS), false);
        releasePendingPull("stack-b::app", dir);
        assert.equal(isPendingPullProtected(id, [], dir, 2001), false);
        fs.writeFileSync(path.join(dir, "pending-image-pulls.json"), "corrupted");
        assert.throws(() => isPendingPullProtected(id, [], dir));
    } finally {
        fs.rmSync(dir, { recursive: true,
            force: true });
    }
});
