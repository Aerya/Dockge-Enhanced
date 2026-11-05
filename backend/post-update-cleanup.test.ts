import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { PostUpdateCleanupQueue } from "./post-update-cleanup";
import { ROLLBACK_RETENTION_MS } from "../common/post-update-policy";

const candidate = { stack: "fixture",
    service: "app",
    imageId: `sha256:${"a".repeat(64)}`,
    references: [ "fixture/app:latest" ] };
function directory(t: TestContext) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "post-update-test-"));
    t.after(() => fs.rmSync(dir, { recursive: true,
        force: true }));
    return dir;
}

test("24h retention survives process restart and executes with global pruning disabled", async t => {
    const dir = directory(t);
    let calls = 0;
    const remove = async () => {
        calls++;
        return { outcome: "removed" as const };
    };
    const queue = new PostUpdateCleanupQueue(dir, remove);
    queue.enqueue(candidate, { cleanup: true,
        rollback: true }, 10);
    await queue.run(10 + ROLLBACK_RETENTION_MS - 1);
    assert.equal(calls, 0);
    const restarted = new PostUpdateCleanupQueue(dir, remove);
    await restarted.run(10 + ROLLBACK_RETENTION_MS);
    assert.equal(calls, 1);
    await restarted.run(10 + ROLLBACK_RETENTION_MS + 1);
    assert.equal(calls, 1);
    assert.equal(new PostUpdateCleanupQueue(dir, remove).snapshot()[0].outcome, "removed");
});

test("cleanup disabled queues nothing; rollback disabled makes cleanup immediately due", async t => {
    const queue = new PostUpdateCleanupQueue(directory(t), async () => ({ outcome: "absent" }));
    queue.enqueue(candidate, { cleanup: false,
        rollback: true }, 10);
    queue.enqueue(candidate, { cleanup: false,
        rollback: false }, 10);
    assert.equal(queue.snapshot().length, 0);
    queue.enqueue(candidate, { cleanup: true,
        rollback: false }, 10);
    await queue.run(10);
    assert.equal(queue.snapshot()[0].outcome, "absent");
});

test("two services sharing an image retain the longer deadline", async t => {
    let calls = 0;
    const queue = new PostUpdateCleanupQueue(directory(t), async () => {
        calls++;
        return { outcome: "removed" };
    });
    queue.enqueue(candidate, { cleanup: true,
        rollback: false }, 10);
    queue.enqueue({ ...candidate,
        stack: "another-stack",
        service: "another" }, { cleanup: true,
        rollback: true }, 20);
    await queue.run(10);
    assert.equal(calls, 0);
    assert.equal(queue.snapshot()[0].outcome, "protected");
    await queue.run(20 + ROLLBACK_RETENTION_MS);
    assert.equal(calls, 2);
});

test("protected images and deletion errors remain explicit and can be retried", async t => {
    let calls = 0;
    const queue = new PostUpdateCleanupQueue(directory(t), async () => {
        calls++;
        if (calls === 1) {
            return { outcome: "protected",
                reason: "used" };
        }
        if (calls === 2) {
            throw new Error("sensitive command output must not be stored");
        }
        return { outcome: "removed" };
    });
    queue.enqueue(candidate, { cleanup: true,
        rollback: false }, 10);
    await queue.run(10);
    assert.equal(queue.snapshot()[0].reason, "used");
    await queue.run(20);
    assert.equal(queue.snapshot()[0].outcome, "error");
    assert.equal(queue.snapshot()[0].reason, "Error");
    await queue.run(30);
    assert.equal(queue.snapshot()[0].outcome, "removed");
});

test("concurrent runs cannot delete the same candidate twice", async t => {
    let release!: () => void;
    const barrier = new Promise<void>(resolve => {
        release = resolve;
    });
    let calls = 0;
    const queue = new PostUpdateCleanupQueue(directory(t), async () => {
        calls++;
        await barrier;
        return { outcome: "removed" };
    });
    queue.enqueue(candidate, { cleanup: true,
        rollback: false }, 10);
    const first = queue.run(10);
    await queue.run(10);
    assert.equal(calls, 1);
    release();
    await first;
});

test("corrupt persistent state is never silently replaced", t => {
    const dir = directory(t);
    const file = path.join(dir, "post-update-cleanup.json");
    fs.writeFileSync(file, "invalid");
    assert.throws(() => new PostUpdateCleanupQueue(dir, async () => ({ outcome: "removed" })));
    assert.equal(fs.readFileSync(file, "utf8"), "invalid");
});

test("aliases of a shared physical image remain visible to the exclusion policy", async t => {
    const seen: string[][] = [];
    const queue = new PostUpdateCleanupQueue(directory(t), async entry => {
        seen.push(entry.references);
        return { outcome: "protected",
            reason: "excluded" };
    });
    queue.enqueue(candidate, { cleanup: true,
        rollback: false }, 10);
    queue.enqueue({ ...candidate,
        references: [ "fixture/excluded:latest" ] }, { cleanup: true,
        rollback: false }, 10);
    await queue.run(10);
    assert.equal(seen.length, 2);
    assert.ok(seen.every(references => references.includes("fixture/excluded:latest") && references.includes("fixture/app:latest")));
});
