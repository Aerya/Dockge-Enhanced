import assert from "node:assert/strict";
import test from "node:test";
import { capturePostUpdateSnapshot, resolvePostUpdateTargets, verifiedPostUpdateSnapshots } from "./post-update-snapshot";

const oldId = `sha256:${"1".repeat(64)}`;
const newId = `sha256:${"2".repeat(64)}`;

function fixture() {
    const state = { ids: [ oldId ],
        running: true,
        health: "healthy",
        target: newId,
        labels: {} };
    const compose = async (args: string[]) => args[0] === "config"
        ? JSON.stringify({ services: { app: { image: "fixture/app:latest",
            labels: state.labels } } })
        : state.ids.map((_, index) => `container-${index}`).join("\n");
    const docker = async (args: string[]) => args[0] === "image" ? state.target : state.ids.map(id =>
        JSON.stringify({ Image: id,
            State: { Running: state.running,
                Health: { Status: state.health } },
            Config: { Labels: { "com.docker.compose.service": "app" } } })).join("\n");
    return { state,
        compose,
        docker };
}

test("snapshot captures running image even when its shared local tag already changed", async () => {
    const f = fixture();
    const snapshots = await capturePostUpdateSnapshot(f.compose, f.docker);
    assert.equal(snapshots[0].oldImageId, oldId);
    await resolvePostUpdateTargets(snapshots, f.docker);
    assert.equal(snapshots[0].targetImageId, newId);
    assert.equal((await verifiedPostUpdateSnapshots(snapshots, f.compose, f.docker)).length, 0);
    f.state.ids = [ newId ];
    assert.equal((await verifiedPostUpdateSnapshots(snapshots, f.compose, f.docker)).length, 1);
});

test("partial replacement, extra draining replica, stopped or unhealthy container never authorizes cleanup", async () => {
    const f = fixture();
    f.state.ids = [ oldId, oldId ];
    const snapshots = await capturePostUpdateSnapshot(f.compose, f.docker);
    await resolvePostUpdateTargets(snapshots, f.docker);
    for (const ids of [[ oldId, newId ], [ newId ], [ newId, newId, oldId ]]) {
        f.state.ids = ids;
        assert.equal((await verifiedPostUpdateSnapshots(snapshots, f.compose, f.docker)).length, 0);
    }
    f.state.ids = [ newId, newId ];
    f.state.running = false;
    assert.equal((await verifiedPostUpdateSnapshots(snapshots, f.compose, f.docker)).length, 0);
    f.state.running = true;
    f.state.health = "unhealthy";
    assert.equal((await verifiedPostUpdateSnapshots(snapshots, f.compose, f.docker)).length, 0);
});

test("no image change does not schedule deletion", async () => {
    const f = fixture();
    f.state.target = oldId;
    const snapshots = await capturePostUpdateSnapshot(f.compose, f.docker);
    await resolvePostUpdateTargets(snapshots, f.docker);
    assert.equal((await verifiedPostUpdateSnapshots(snapshots, f.compose, f.docker)).length, 0);
});

test("mixed versions and stopped services do not produce misleading rollback snapshots", async () => {
    const f = fixture();
    f.state.ids = [ oldId, newId ];
    assert.deepEqual(await capturePostUpdateSnapshot(f.compose, f.docker), []);
    f.state.ids = [ oldId ];
    f.state.running = false;
    assert.deepEqual(await capturePostUpdateSnapshot(f.compose, f.docker), []);
});

test("service settings are captured independently and unexpected Docker output fails closed", async () => {
    const f = fixture();
    f.state.labels = { "dockge.update.cleanup": "false",
        "dockge.update.rollback": "false" };
    assert.deepEqual((await capturePostUpdateSnapshot(f.compose, f.docker))[0].policy, { cleanup: false,
        rollback: false });
    await assert.rejects(capturePostUpdateSnapshot(f.compose, async () => "unexpected"));
});
