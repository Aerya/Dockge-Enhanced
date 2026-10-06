import assert from "node:assert/strict";
import test from "node:test";
import {
    buildContainerImageIndex,
    classifyImageReferences,
    ImageInventory,
} from "./docker-image-inventory";

const sharedId = `sha256:${"a".repeat(64)}`;

test("deux tags du même Image ID sont tous deux utilisés par un seul conteneur", () => {
    const containers = buildContainerImageIndex([{
        Id: "container-id",
        Name: "/web",
        Image: sharedId,
        State: { Status: "running" },
        Config: { Labels: { "com.docker.compose.project": "demo" } },
    }]);
    const inventory: ImageInventory = {
        rows: [
            { ID: sharedId,
                Repository: "example/app",
                Tag: "latest" },
            { ID: sharedId,
                Repository: "example/app",
                Tag: "stable" },
        ],
        inspected: [],
        inspectedById: new Map(),
        ...containers,
    };

    const classified = classifyImageReferences(inventory);
    assert.deepEqual(classified.map(image => image.status), [ "running", "running" ]);
    assert.deepEqual(classified.map(image => image.containers[0]?.name), [ "web", "web" ]);
});

test("un conteneur arrêté protège toutes les références du même Image ID", () => {
    const containers = buildContainerImageIndex([{
        Id: "stopped-container",
        Name: "/worker",
        Image: sharedId,
        State: { Status: "exited" },
    }]);
    const classified = classifyImageReferences({
        rows: [
            { ID: sharedId,
                Repository: "example/worker",
                Tag: "v1" },
            { ID: sharedId,
                Repository: "<none>",
                Tag: "<none>" },
        ],
        inspected: [],
        inspectedById: new Map(),
        ...containers,
    });
    assert.deepEqual(classified.map(image => image.status), [ "stopped", "stopped" ]);
});

test("dangling et unused restent deux états exclusifs", () => {
    const unusedId = `sha256:${"b".repeat(64)}`;
    const classified = classifyImageReferences({
        rows: [
            { ID: sharedId,
                Repository: "<none>",
                Tag: "<none>" },
            { ID: unusedId,
                Repository: "example/unused",
                Tag: "latest" },
        ],
        inspected: [],
        inspectedById: new Map(),
        usedImageIds: new Set(),
        containersByImageId: new Map(),
    });
    assert.deepEqual(classified.map(image => image.status), [ "dangling", "unused" ]);
});
