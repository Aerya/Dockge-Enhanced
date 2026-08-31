import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import test from "node:test";

test("a terminal sidecar result is notified once and marked atomically", async () => {
    const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "dockge-self-update-manager-"));
    process.env.DOCKGE_DATA_DIR = dataDir;
    const { SelfUpdateManager } = await import(`./manager.ts?test=${Date.now()}`);
    const manager = SelfUpdateManager.getInstance() as any;
    manager.operation = {
        id: "a".repeat(32), state: "succeeded", message: "ready", startedAt: new Date().toISOString(),
        finishedAt: new Date().toISOString(), targetImage: `ghcr.io/aerya/dockge-enhanced@sha256:${"b".repeat(64)}`,
        rollbackAttempted: false, notificationPending: true, notificationSentAt: null,
    };
    let notifications = 0;
    manager.notify = async () => { notifications += 1; return true; };
    await manager.processTerminalNotification();
    await manager.processTerminalNotification();
    assert.equal(notifications, 1);
    assert.equal(manager.operation.notificationPending, false);
    assert.ok(manager.operation.notificationSentAt);
    const persisted = JSON.parse(await fs.readFile(path.join(dataDir, "self-update", "status.json"), "utf8"));
    assert.equal(persisted.notificationPending, false);
    await fs.rm(dataDir, { recursive: true, force: true });
});

test("expired plans and obsolete recovery snapshots are cleaned without removing the latest two", async () => {
    const dataDir = process.env.DOCKGE_DATA_DIR as string;
    const stateDir = path.join(dataDir, "self-update");
    const recoveryDir = path.join(stateDir, "recovery");
    await fs.mkdir(recoveryDir, { recursive: true });
    const ids = [ "1".repeat(32), "2".repeat(32), "3".repeat(32) ];
    for (const [ index, id ] of ids.entries()) {
        await fs.writeFile(path.join(recoveryDir, `${id}.json`), "{}");
        const date = new Date(Date.now() - (3 - index) * 60_000);
        await fs.utimes(path.join(recoveryDir, `${id}.json`), date, date);
    }
    const expired = `${"e".repeat(32)}.json`;
    await fs.writeFile(path.join(stateDir, expired), "{}");
    const old = new Date(Date.now() - 25 * 60 * 60_000);
    await fs.utimes(path.join(stateDir, expired), old, old);
    const { SelfUpdateManager } = await import("./manager");
    await (SelfUpdateManager.getInstance() as any).cleanupArtifacts(ids[2]);
    assert.equal(await fs.stat(path.join(stateDir, expired)).then(() => true).catch(() => false), false);
    assert.equal(await fs.stat(path.join(recoveryDir, `${ids[0]}.json`)).then(() => true).catch(() => false), false);
    assert.equal(await fs.stat(path.join(recoveryDir, `${ids[1]}.json`)).then(() => true).catch(() => false), true);
    assert.equal(await fs.stat(path.join(recoveryDir, `${ids[2]}.json`)).then(() => true).catch(() => false), true);
    await fs.rm(dataDir, { recursive: true, force: true });
});
