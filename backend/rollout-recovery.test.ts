import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readFile, readdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { RolloutRecovery, parseRolloutRecord, rolloutStates } from "./rollout-recovery";
import { withStackMutation } from "./stack-mutation";
import { RELAY_IMAGE, LABEL_RELAY_OWNER, LABEL_RELAY_PORT, relayConfig } from "../common/rollout-relay";
import { activeDockerUpdateOperation } from "./self-update/operation-coordinator";

const oldId = "a".repeat(64);
const newId = "b".repeat(64);
const relayId = "c".repeat(64);
const oldImage = "sha256:" + "d".repeat(64);
const newImage = "sha256:" + "e".repeat(64);

async function fixture(t: { after: (action: () => Promise<void>) => void }) {
    const directory = await mkdtemp(path.join(os.tmpdir(), "rollout-recovery-test-"));
    const stateDir = path.join(directory, "journal");
    const container = (Id: string, Image: string, service = "app") => ({ Id,
        Image,
        Name: "/fixture-" + service + "-" + Id[0],
        State: { Running: true,
            StartedAt: "2026-10-25T12:00:00Z",
            Health: { Status: "healthy" } },
        Config: { Image: service === "relay" ? RELAY_IMAGE : "fixture:latest",
            Labels: { "com.docker.compose.project": "fixture",
                "com.docker.compose.service": service,
                "com.docker.compose.project.working_dir": directory,
                [LABEL_RELAY_OWNER]: "app",
                [LABEL_RELAY_PORT]: "8080" } },
        Mounts: [],
        HostConfig: {} });
    const containers = [ container(oldId, oldImage), container(newId, newImage), container(relayId, newImage, "relay") ];
    const calls: string[][] = [];
    let generation = 1;
    const state = { busy: true,
        blocked: false,
        failRemove: false };
    const docker = async (args: string[]) => {
        calls.push(args);
        if (args[0] === "ps") {
            return containers.filter(item => item.Config.Labels["com.docker.compose.service"] === "app").map(item => item.Id).join("\n");
        }
        if (args[0] === "inspect") {
            const result = args.slice(1).map(id => containers.find(item => item.Id === id));
            if (result.some(item => !item)) {
                throw new Error("No such container");
            }
            return JSON.stringify(result);
        }
        if (args.includes("cat")) {
            return relayConfig([ "fixture-app-a" ], 8080);
        }
        if (args.includes("ps")) {
            return `${generation} nginx: worker process\n` + (generation > 1 && state.busy ? "0 nginx: worker process is shutting down\n" : "");
        }
        if (args.includes("reload")) {
            generation++;
        }
        if (args[0] === "stop") {
            containers.find(item => item.Id === args.at(-1))!.State.Running = false;
        }
        if (args[0] === "rm") {
            if (state.failRemove) {
                throw new Error("fixture removal unavailable");
            }
            containers.splice(containers.findIndex(item => item.Id === args.at(-1)), 1);
        }
        return "";
    };
    const manager = new RolloutRecovery(stateDir, docker, async () => state.blocked, async () => {});
    await manager.load();
    const record = await manager.begin({ directory,
        project: "fixture",
        service: "app",
        targetImage: newImage,
        old: [{ id: oldId,
            image: oldImage }],
        relay: { id: relayId,
            service: "relay",
            port: 8080,
            origin: "fixture-app-rollout-origin" } });
    t.after(async () => {
        record.phase = "cancelled";
        await manager.save(record);
        manager.stop();
        await rm(directory, { recursive: true,
            force: true });
    });
    const commit = async () => {
        record.next = [{ id: newId,
            image: newImage }];
        record.phase = "draining";
        await manager.save(record);
        manager.release(record);
    };
    return { directory,
        stateDir,
        manager,
        record,
        containers,
        calls,
        state,
        docker,
        commit };
}

test("long connections remain pending across retries, release global reservation, and retire automatically when closed", async t => {
    const f = await fixture(t);
    await f.commit();
    for (let i = 0; i < 10; i++) {
        await f.manager.tick();
        assert.equal(activeDockerUpdateOperation(), null);
    }
    assert.equal(f.calls.filter(args => args.includes("reload")).length, 1);
    assert.equal(f.calls.some(args => [ "stop", "rm" ].includes(args[0])), false);
    await assert.rejects(withStackMutation(f.directory, async () => {}), /Rolling update pending/);
    f.state.busy = false;
    await f.manager.tick();
    assert.deepEqual(f.calls.filter(args => args[0] === "rm"), [[ "rm", oldId ]]);
    assert.equal(f.containers.some(item => item.Id === newId), true);
    assert.deepEqual(rolloutStates(f.directory), []);
    await withStackMutation(f.directory, async () => {});
});

test("restart loads persistent reservations and reacknowledges routing before retirement", async t => {
    const f = await fixture(t);
    await f.commit();
    await f.manager.tick();
    const restarted = new RolloutRecovery(f.stateDir, f.docker, async () => false, async () => {});
    await restarted.load();
    await assert.rejects(withStackMutation(f.directory, async () => {}), /pending/);
    await restarted.tick();
    assert.equal(f.calls.filter(args => args.includes("reload")).length, 2);
    f.state.busy = false;
    await restarted.tick();
    assert.deepEqual(f.calls.filter(args => args[0] === "rm"), [[ "rm", oldId ]]);
});

test("interruption before commit cancels only replacements, after draining any surviving connections", async t => {
    const f = await fixture(t);
    f.manager.release(f.record);
    await f.manager.tick();
    assert.equal(f.calls.some(args => args[0] === "rm"), false);
    f.state.busy = false;
    await f.manager.tick();
    assert.deepEqual(f.calls.filter(args => args[0] === "rm"), [[ "rm", newId ]]);
    assert.equal(f.containers.find(item => item.Id === oldId)?.State.Running, true);
});

test("partial stop then restart resumes removal without stopping the healthy replacement", async t => {
    const f = await fixture(t);
    await f.commit();
    f.state.busy = false;
    f.state.failRemove = true;
    await f.manager.tick();
    assert.equal(f.containers.find(item => item.Id === oldId)?.State.Running, false);
    assert.equal(rolloutStates(f.directory)[0].attention, true);
    f.state.failRemove = false;
    const restarted = new RolloutRecovery(f.stateDir, f.docker, async () => false, async () => {});
    await restarted.load();
    await restarted.tick();
    assert.equal(f.calls.filter(args => args[0] === "stop").length, 1);
    assert.deepEqual(rolloutStates(f.directory), []);
});

test("wrong project and unexpected replica IDs cannot cause deletion", async t => {
    const f = await fixture(t);
    await f.commit();
    f.state.busy = false;
    f.containers[1].Config.Labels["com.docker.compose.project"] = "other";
    await f.manager.tick();
    f.containers[1].Config.Labels["com.docker.compose.project"] = "fixture";
    f.containers[1].Id = "f".repeat(64);
    await f.manager.tick();
    assert.equal(f.calls.some(args => [ "stop", "rm" ].includes(args[0])), false);
});

test("unhealthy replacement returns traffic to healthy old replicas before removing only the failed generation", async t => {
    const f = await fixture(t);
    await f.commit();
    f.containers[1].State.Health.Status = "unhealthy";
    await f.manager.tick();
    assert.equal(f.calls.some(args => args[0] === "rm"), false);
    f.state.busy = false;
    await f.manager.tick();
    assert.deepEqual(f.calls.filter(args => args[0] === "rm"), [[ "rm", newId ]]);
    assert.equal(f.containers.find(item => item.Id === oldId)?.State.Running, true);
});

test("self-update and the active initial transaction defer recovery without holding reservations", async t => {
    const f = await fixture(t);
    await f.manager.tick();
    assert.equal(f.calls.length, 0);
    await f.commit();
    f.state.blocked = true;
    await f.manager.tick();
    assert.equal(f.calls.length, 0);
    assert.equal(activeDockerUpdateOperation(), null);
    f.state.blocked = false;
    f.state.busy = false;
    await f.manager.tick();
    assert.deepEqual(rolloutStates(f.directory), []);
});

test("two recovery ticks cannot retire concurrently and a late health failure prevents deletion", async t => {
    const f = await fixture(t);
    await f.commit();
    f.state.busy = false;
    let inspections = 0;
    let entered!: () => void;
    let release!: () => void;
    const started = new Promise<void>(resolve => {
        entered = resolve;
    });
    const barrier = new Promise<void>(resolve => {
        release = resolve;
    });
    const recovering = new RolloutRecovery(f.stateDir, async args => {
        if (args[0] === "ps") {
            inspections++;
            if (inspections === 1) {
                entered();
                await barrier;
            } else if (inspections === 2) {
                f.containers[1].State.Health.Status = "unhealthy";
            }
        }
        return f.docker(args);
    }, async () => false, async () => {});
    await recovering.load();
    const first = recovering.tick();
    await started;
    await recovering.tick();
    assert.equal(inspections, 1);
    release();
    await first;
    assert.equal(inspections, 2);
    assert.equal(f.calls.some(args => [ "stop", "rm" ].includes(args[0])), false);
    assert.equal(activeDockerUpdateOperation(), null);
});

test("restart after all old IDs were removed restores routing and finalises without touching replacement", async t => {
    const f = await fixture(t);
    await f.commit();
    f.state.busy = false;
    f.containers.splice(f.containers.findIndex(item => item.Id === oldId), 1);
    const resumed = new RolloutRecovery(f.stateDir, f.docker, async () => false, async () => {});
    await resumed.load();
    await resumed.tick();
    assert.deepEqual(rolloutStates(f.directory), []);
    assert.equal(f.calls.some(args => [ "stop", "rm" ].includes(args[0])), false);
});

test("an external down cancels the obsolete transaction without resurrecting the service", async t => {
    const f = await fixture(t);
    await f.commit();
    f.containers.splice(0, 2);
    await f.manager.tick();
    assert.deepEqual(rolloutStates(f.directory), []);
    assert.equal(f.calls.some(args => [ "start", "stop", "rm", "exec" ].includes(args[0])), false);
    await withStackMutation(f.directory, async () => {});
});

test("journal validates full IDs, phase completeness, path and filenames; writes no temporary leftovers", async t => {
    const f = await fixture(t);
    assert.deepEqual(await readdir(f.stateDir), [ f.record.id + ".json" ]);
    const text = await readFile(path.join(f.stateDir, f.record.id + ".json"), "utf8");
    assert.equal(parseRolloutRecord(text).phase, "preparing");
    for (const edit of [{ directory: "../escape" }, { phase: "draining" }, { old: [{ id: "short",
        image: oldImage }] }, { relay: { ...f.record.relay,
        id: "--help" } }]) {
        assert.throws(() => parseRolloutRecord(JSON.stringify({ ...f.record,
            ...edit })), /Invalid/);
    }
});
