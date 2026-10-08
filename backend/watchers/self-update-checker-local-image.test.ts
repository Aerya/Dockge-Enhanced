import test from "node:test";
import assert from "node:assert/strict";
import { fetchLocalImageInfo } from "./self-update-checker";

const imageId = `sha256:${"a".repeat(64)}`;
const indexDigest = `sha256:${"b".repeat(64)}`;

test("lit le digest local via l'inspection Docker compatible DOCKER_HOST", async () => {
    const inspectedIds: string[] = [];
    const result = await fetchLocalImageInfo(
        async () => ({ Id: "container-id",
            Image: imageId }),
        async (requestedId) => {
            inspectedIds.push(requestedId);
            return {
                RepoDigests: [ `ghcr.io/aerya/dockge-enhanced@${indexDigest}` ],
                Os: "linux",
                Architecture: "amd64",
                Config: {
                    Labels: {
                        "org.opencontainers.image.revision": "revision-466",
                        "org.opencontainers.image.created": "2026-10-08T00:00:00Z",
                    },
                },
            };
        },
    );

    assert.deepEqual(inspectedIds, [ imageId ]);
    assert.equal(result.digest, indexDigest);
    assert.equal(result.comparable, true);
    assert.equal(result.source, "repoDigest");
    assert.equal(result.repo, "aerya/dockge-enhanced");
    assert.deepEqual(result.platform, { os: "linux",
        architecture: "amd64",
        variant: undefined });
    assert.deepEqual(result.build, {
        revision: "revision-466",
        created: "2026-10-08T00:00:00Z",
    });
});

test("reste en mode dégradé si l'image ne peut pas être inspectée", async () => {
    const result = await fetchLocalImageInfo(
        async () => ({ Id: "container-id",
            Image: imageId }),
        async () => {
            throw new Error("proxy unavailable");
        },
    );

    assert.equal(result.digest, "");
    assert.equal(result.comparable, false);
    assert.equal(result.source, "none");
});
