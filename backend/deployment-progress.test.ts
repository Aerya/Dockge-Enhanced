import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { DeploymentStore } from "./deployment-progress";

async function fixture(t: { after: (fn: () => Promise<void>) => void }) {
    const dir = await mkdtemp(path.join(os.tmpdir(), "deployment-test-"));
    t.after(() => rm(dir, { recursive: true,
        force: true }));
    return { dir,
        store: new DeploymentStore(dir) };
}

test("real barriers expose phases and reject simultaneous deployments without blocking other stacks", async (t) => {
    const { store } = await fixture(t);
    let release!: () => void;
    let entered!: () => void;
    const barrier = new Promise<void>((resolve) => {
        release = resolve;
    });
    const started = new Promise<void>((resolve) => {
        entered = resolve;
    });
    const running = store.run("one", async (report) => {
        await report("compose");
        entered();
        await barrier;
        await report("metadata");
    });
    await started;
    assert.equal((await store.get("one"))?.phase, "compose");
    assert.equal((await store.get("one"))?.state, "running");
    await assert.rejects(
        store.run("one", async () => {}),
        /busy/,
    );
    await store.run("two", async () => {});
    release();
    await running;
    assert.equal((await store.get("one"))?.state, "completed");
});

test("failure releases reservation; retry uses current operation ID; output never persists", async (t) => {
    const { dir, store } = await fixture(t);
    await assert.rejects(
        store.run("app", async (report, output) => {
            await report("compose");
            output("secret-credential" + "x".repeat(70000));
            throw new Error("real Compose failure");
        }),
    );
    const failed = (await store.get("app"))!;
    assert.equal(failed.state, "failed");
    assert.equal(failed.saved, true);
    assert.ok(failed.output!.length <= 65536);
    assert.match(failed.output!, /real Compose failure/);
    const disk = await readFile(
        path.join(dir, "deployment-progress.json"),
        "utf8",
    );
    assert.doesNotMatch(disk, /secret-credential|real Compose failure|output/);
    await store.run("app", async () => {}, true, failed.id);
    await assert.rejects(
        store.run("app", async () => {}, true, failed.id),
        /changed/,
    );
    const restored = await new DeploymentStore(dir).get("app");
    assert.equal(restored?.state, "completed");
    assert.equal(restored?.output, undefined);
});

test("restart marks unfinished work interrupted without automatically restarting Docker", async (t) => {
    const { dir, store } = await fixture(t);
    await store.run("app", async () => {});
    const record = (await store.get("app"))!;
    record.state = "running";
    record.saved = true;
    await writeFile(
        path.join(dir, "deployment-progress.json"),
        JSON.stringify([ record ]),
    );
    const restarted = new DeploymentStore(dir);
    assert.equal((await restarted.get("app"))?.state, "interrupted");
    await restarted.run("app", async () => {}, true, record.id);
    assert.equal((await restarted.get("app"))?.state, "completed");
});

test("invalid stack names cannot create paths or leave a reservation", async (t) => {
    const { store } = await fixture(t);
    for (const name of [ "../escape", "/etc", "", "app;id" ]) {
        await assert.rejects(store.run(name, async () => {}));
    }
    await store.run("_app", async () => {});
});
