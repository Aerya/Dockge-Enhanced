import test from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { isObsoleteSelfImage, isPruneDue, selfUpdateProtectedImages, shouldPruneTaggedImage } from "./auto-prune-manager";

const activeId = `sha256:${"a".repeat(64)}`;
const previousId = `sha256:${"b".repeat(64)}`;
const oldId = `sha256:${"c".repeat(64)}`;

test("la purge quotidienne ne saute pas le créneau pour quelques secondes", () => {
    const previous = "2026-09-29T01:00:22.813Z";
    assert.equal(isPruneDue(previous, 24, Date.parse("2026-09-30T01:00:00.000Z")), true);
    assert.equal(isPruneDue(previous, 24, Date.parse("2026-09-29T23:59:00.000Z")), false);
    assert.equal(isPruneDue(previous, 48, Date.parse("2026-09-30T01:00:00.000Z")), false);
    assert.equal(isPruneDue(undefined, 24), false);
});

test("la purge des images avec tag respecte conteneurs, exclusions et rollbacks", () => {
    const image = {
        Repository: "ghcr.io/aerya/dockge-enhanced",
        Tag: "latest",
        ID: "sha256:active",
    };
    assert.equal(shouldPruneTaggedImage(image, new Set([ "sha256:active" ]), []), false);
    assert.equal(shouldPruneTaggedImage(image, new Set(), [ "ghcr.io/aerya/dockge-enhanced:latest" ]), false);
    assert.equal(shouldPruneTaggedImage(image, new Set(), []), true);
    assert.equal(shouldPruneTaggedImage({
        ...image,
        Tag: "<none>",
    }, new Set(), []), false);
    assert.equal(shouldPruneTaggedImage({
        ...image,
        Repository: "dockge-rollback-test",
    }, new Set(), []), false);
});

test("les anciennes images Enhanced par digest attendent la validation du self-update", () => {
    const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), "dockge-prune-test-"));
    const now = Date.parse("2026-09-30T12:00:00Z");
    const status = {
        state: "succeeded",
        finishedAt: new Date(now - 49 * 3_600_000).toISOString(),
        targetImage: `ghcr.io/aerya/dockge-enhanced@${activeId}`,
    };
    try {
        fs.mkdirSync(path.join(stateDir, "recovery"));
        fs.writeFileSync(path.join(stateDir, "status.json"), JSON.stringify(status));
        fs.writeFileSync(path.join(stateDir, "recovery", `${"d".repeat(32)}.json`), JSON.stringify({ previousImageId: previousId }));

        const protectedIds = selfUpdateProtectedImages(new Set([ activeId ]), stateDir, now);
        assert.deepEqual(protectedIds, new Set([ activeId, previousId ]));
        const image = {
            Id: oldId,
            RepoTags: [ `ghcr.io/aerya/dockge-enhanced@${oldId}` ],
            RepoDigests: [ `ghcr.io/aerya/dockge-enhanced@${oldId}` ],
        };
        assert.equal(isObsoleteSelfImage(image, protectedIds!), true);
        assert.equal(isObsoleteSelfImage({
            ...image,
            Id: previousId,
        }, protectedIds!), false);
        assert.equal(isObsoleteSelfImage({
            ...image,
            RepoTags: [ "ghcr.io/aerya/dockge-enhanced:latest" ],
        }, protectedIds!), false);

        fs.writeFileSync(path.join(stateDir, "status.json"), JSON.stringify({
            ...status,
            finishedAt: new Date(now - 47 * 3_600_000).toISOString(),
        }));
        assert.equal(selfUpdateProtectedImages(new Set([ activeId ]), stateDir, now), null);
        fs.writeFileSync(path.join(stateDir, "status.json"), JSON.stringify({
            ...status,
            state: "updating",
        }));
        assert.equal(selfUpdateProtectedImages(new Set([ activeId ]), stateDir, now), null);
    } finally {
        fs.rmSync(stateDir, {
            recursive: true,
            force: true,
        });
    }
});
