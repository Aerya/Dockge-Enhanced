import assert from "node:assert/strict";
import test from "node:test";
import { parseContainerInstances, requireContainerInstance } from "./container-instances";
import { Stack } from "./stack";
import type { DockgeServer } from "./dockge-server";

const first = {
    ID: "a".repeat(64),
    Name: "web-1",
    Service: "web",
    State: "running",
    Health: "healthy",
    Image: "nginx:stable",
};
const second = {
    ID: "b".repeat(64),
    Name: "web-2",
    Service: "web",
    State: "exited",
    Health: "",
    Image: "nginx:stable",
};

test("keeps separate real containers for replicas of one Compose service", () => {
    const instances = parseContainerInstances(`${JSON.stringify(first)}\n${JSON.stringify(second)}\n`);
    assert.equal(instances.length, 2);
    assert.deepEqual(instances.map((entry) => entry.name), [ "web-1", "web-2" ]);
    assert.equal(requireContainerInstance(instances, second.ID).state, "exited");
});

test("accepts array output and ignores malformed or incomplete entries", () => {
    const instances = parseContainerInstances(JSON.stringify([ first, { Name: "invalid" }, second ]));
    assert.equal(instances.length, 2);
    assert.deepEqual(parseContainerInstances("not json\n" + JSON.stringify(first)), [ instances[0] ]);
    assert.equal(parseContainerInstances(JSON.stringify([ first, second ], null, 2)).length, 2);
});

test("rejects IDs absent from the selected Compose project", () => {
    const instances = parseContainerInstances(JSON.stringify(first));
    assert.throws(() => requireContainerInstance(instances, second.ID), /does not belong/);
    assert.throws(() => requireContainerInstance(instances, "web-1"), /Invalid container ID/);
});

test("external stacks use their existing Compose project and config files for instance discovery", () => {
    const server = { stacksDir: "/opt/stacks" } as DockgeServer;
    const stack = new Stack(
        server,
        "adopted-stack",
        "services: {}",
        "",
        true,
        "",
        "/srv/apps/adopted-stack",
        "original-project",
        [ "/srv/apps/adopted-stack/compose.yaml", "/srv/apps/adopted-stack/override.yaml" ]
    );
    assert.deepEqual(stack.getComposeOptions("ps", "--all", "--format", "json"), [
        "compose",
        "--project-directory", "/srv/apps/adopted-stack",
        "--project-name", "original-project",
        "-f", "/srv/apps/adopted-stack/compose.yaml",
        "-f", "/srv/apps/adopted-stack/override.yaml",
        "ps", "--all", "--format", "json",
    ]);
});
