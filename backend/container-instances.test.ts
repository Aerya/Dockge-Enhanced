import assert from "node:assert/strict";
import test from "node:test";
import { parseContainerInstances, requireContainerInstance, addContainerDates } from "./container-instances";
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

test("creation and restart dates are distinct for each replica", async () => {
    const instances = parseContainerInstances(JSON.stringify([ first, second ]));
    const created = "2026-10-01T12:00:00Z";
    for (const started of [ "2026-10-02T12:00:00Z", "2026-11-06T12:00:00Z" ]) {
        const result = await addContainerDates(instances, async () => [
            { Id: first.ID,
                Created: created,
                StartedAt: started,
                Status: "running" },
            { Id: second.ID,
                Created: created,
                StartedAt: "0001-01-01T00:00:00Z",
                Status: "created" },
        ].map(row => JSON.stringify(row)).join("\n"));
        assert.equal(result[0].createdAt, "2026-10-01T12:00:00.000Z");
        assert.equal(result[0].startedAt, new Date(started).toISOString());
        assert.equal(result[1].startedAt, null);
        assert.equal(result[1].state, "created");
        assert.equal(instances[0].startedAt, undefined);
    }
});

test("date inspection is selective, batched and tolerant of removed containers", async () => {
    const instances = parseContainerInstances(JSON.stringify(Array.from({ length: 33 }, (_, i) => ({ ...first,
        ID: i.toString(16).padStart(64, "0") }))));
    const batches: number[] = [];
    const result = await addContainerDates(instances, async args => {
        const ids = args.slice(3);
        batches.push(ids.length);
        assert.ok(!args[2].includes("Config"));
        assert.ok(args[2].includes(".State.StartedAt"));
        if (batches.length === 1) {
            throw new Error("one container disappeared");
        }
        return ids.map(id => JSON.stringify({ Id: id,
            StartedAt: "2026-11-06T12:00:00Z" })).join("\n");
    });
    assert.deepEqual(batches, [ 16, 16, 1 ]);
    assert.equal(result.length, 33);
    assert.equal(result[0].startedAt, null);
    assert.equal(result[32].startedAt, "2026-11-06T12:00:00.000Z");
});

test("invalid dates and foreign IDs cannot populate a container's timestamps", async () => {
    const instances = parseContainerInstances(JSON.stringify(first));
    const result = await addContainerDates(instances, async () => `null\ninvalid\n${JSON.stringify({ Id: second.ID,
        StartedAt: "2026-11-06T12:00:00Z" })}\n${JSON.stringify({ Id: first.ID,
            StartedAt: "invalid",
            Created: "invalid" })}`);
    assert.equal(result[0].startedAt, null);
    assert.equal(result[0].createdAt, instances[0].createdAt);
});

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
