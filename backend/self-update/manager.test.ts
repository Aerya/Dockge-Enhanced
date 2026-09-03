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
    manager.notify = async () => {
        notifications += 1;
        await new Promise(resolve => setTimeout(resolve, 25));
        return true;
    };

    await Promise.all([
        manager.processTerminalNotification(),
        manager.processTerminalNotification(),
    ]);
    await manager.processTerminalNotification();

    assert.equal(notifications, 1);
    assert.equal(manager.operation.notificationPending, false);
    assert.ok(manager.operation.notificationSentAt);
    assert.equal(manager.terminalNotificationInFlight, false);

    const persisted = JSON.parse(await fs.readFile(path.join(dataDir, "self-update", "status.json"), "utf8"));
    assert.equal(persisted.notificationPending, false);
    assert.ok(persisted.notificationSentAt);
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


test("automatic retry of the same digest is blocked after rollback", async () => {
    const { SelfUpdateManager } = await import(`./manager.ts?retry=${Date.now()}`);
    const manager = SelfUpdateManager.getInstance() as any;
    const target = `ghcr.io/aerya/dockge-enhanced@sha256:${"c".repeat(64)}`;
    manager.operation = { id: "f".repeat(32), state: "rolled-back", message: "rollback", startedAt: new Date().toISOString(), finishedAt: new Date().toISOString(), targetImage: target, rollbackAttempted: true };
    assert.equal(manager.shouldBlockAutomaticRetry(target), true);
    assert.equal(manager.shouldBlockAutomaticRetry(`ghcr.io/aerya/dockge-enhanced@sha256:${"d".repeat(64)}`), false);
});


test("active self-update execution is busy while scheduled remains retryable", async () => {
    const { SelfUpdateManager } = await import(`./manager.ts?busy=${Date.now()}`);
    const manager = SelfUpdateManager.getInstance() as any;

    manager.requestInFlight = false;
    manager.operation = { id: "", state: "idle", message: "", startedAt: null, finishedAt: null, targetImage: "", rollbackAttempted: false };
    assert.equal(manager.isUpdateExecutionInProgress(), false);

    manager.operation.state = "scheduled";
    assert.equal(manager.isUpdateExecutionInProgress(), false);

    manager.operation.state = "verifying-backup";
    assert.equal(manager.isUpdateExecutionInProgress(), true);

    manager.operation.state = "waiting-health";
    assert.equal(manager.isUpdateExecutionInProgress(), true);

    manager.operation.state = "idle";
    manager.requestInFlight = true;
    assert.equal(manager.isUpdateExecutionInProgress(), true);
    manager.requestInFlight = false;
});

test("updater latest is the default sidecar channel", async () => {
    const source = await fs.readFile(new URL("./manager.ts", import.meta.url), "utf8");
    assert.match(source, /-updater:latest/);
    assert.match(source, /image\", \"pull\", sidecarImage/);
    assert.match(source, /run\", \"--pull=always/);
});


test("obsolete rollback state is cleared once the installed build is current", async () => {
    const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "dockge-self-update-clear-"));
    process.env.DOCKGE_DATA_DIR = dataDir;
    const { SelfUpdateManager } = await import(`./manager.ts?clear=${Date.now()}`);
    const manager = SelfUpdateManager.getInstance() as any;
    manager.operation = {
        id: "a".repeat(32),
        state: "rolled-back",
        message: "old rollback",
        startedAt: new Date().toISOString(),
        finishedAt: new Date().toISOString(),
        targetImage: `ghcr.io/aerya/dockge-enhanced@sha256:${"b".repeat(64)}`,
        rollbackAttempted: true,
    };

    await manager.clearObsoleteFailureState();

    assert.equal(manager.operation.state, "idle");
    assert.equal(manager.operation.targetImage, "");
    const persisted = JSON.parse(await fs.readFile(path.join(dataDir, "self-update", "status.json"), "utf8"));
    assert.equal(persisted.state, "idle");
    await fs.rm(dataDir, { recursive: true, force: true });
});

test("post-restart terminal status no longer depends on a WebUI refresh", async () => {
    const source = await fs.readFile(new URL("./manager.ts", import.meta.url), "utf8");
    assert.match(source, /await this\.processTerminalNotification\(\);\s*this\.startTerminalStatusWatch\(\);/);
    assert.match(source, /\[ "updating", "waiting-health", "rolling-back" \]\.includes\(this\.operation\.state\)/);
    assert.match(source, /setInterval\(\(\) => \{ void poll\(\); \}, 2_000\)/);
});

test("only post-restart sidecar states or pending terminal notifications arm the watcher", async () => {
    const { SelfUpdateManager } = await import(`./manager.ts?watch-policy=${Date.now()}`);
    const manager = SelfUpdateManager.getInstance() as any;
    const base = {
        id: "a".repeat(32),
        message: "",
        startedAt: new Date().toISOString(),
        finishedAt: null,
        targetImage: `ghcr.io/aerya/dockge-enhanced@sha256:${"b".repeat(64)}`,
        rollbackAttempted: false,
    };

    for (const state of [ "updating", "waiting-health", "rolling-back" ]) {
        manager.operation = { ...base, state };
        assert.equal(manager.shouldWatchTerminalStatus(), true, state);
    }

    manager.operation = { ...base, state: "succeeded", finishedAt: new Date().toISOString(), notificationPending: true };
    assert.equal(manager.shouldWatchTerminalStatus(), true);

    manager.operation = { ...base, state: "succeeded", finishedAt: new Date().toISOString(), notificationPending: false };
    assert.equal(manager.shouldWatchTerminalStatus(), false);

    manager.operation = { ...base, state: "scheduled" };
    assert.equal(manager.shouldWatchTerminalStatus(), false);

    manager.operation = { ...base, state: "idle" };
    assert.equal(manager.shouldWatchTerminalStatus(), false);
});


test("legacy deferred messages recover their blocker code", async () => {
    const { SelfUpdateManager } = await import(`./manager.ts?deferred-legacy=${Date.now()}`);
    const manager = SelfUpdateManager.getInstance() as any;
    const operation = {
        id: "",
        state: "scheduled",
        message: "Automatic self-update was deferred because an image security scan is in progress. It will be retried by the existing update watcher.",
        startedAt: null,
        finishedAt: null,
        targetImage: "ghcr.io/aerya/dockge-enhanced@sha256:" + "a".repeat(64),
        rollbackAttempted: false,
    };

    const normalized = manager.normalizeDeferredOperation(operation);
    assert.equal(normalized.deferredBy, "trivy-scan");
});

test("deferred blocker reasons are localized before notification rendering", async () => {
    const { SelfUpdateManager } = await import(`./manager.ts?deferred-i18n=${Date.now()}`);
    const manager = SelfUpdateManager.getInstance() as any;

    assert.equal(manager.localizedDeferredReason("trivy-scan", "fr"), "un scan de sécurité Trivy est en cours");
    assert.equal(manager.localizedDeferredReason("trivy-scan", "en"), "an image security scan is in progress");
    assert.equal(manager.localizedDeferredReason("active-editor", "fr"), "des modifications non enregistrées sont en cours dans un compose ou un fichier .env");
    assert.equal(manager.localizedDeferredReason("active-editor", "en"), "unsaved compose or .env changes are being edited");
});

test("self-update Restic retention runs only after fresh backup verification", async () => {
    const managerSource = await fs.readFile(new URL("./manager.ts", import.meta.url), "utf8");
    const backupSource = await fs.readFile(new URL("../watchers/backup-manager.ts", import.meta.url), "utf8");

    const verifyPos = managerSource.indexOf("verifyFreshBackup(");
    const prunePos = managerSource.indexOf("pruneSelfUpdateSnapshots(");
    const sidecarArgsPos = managerSource.indexOf('const args = [');
    const sidecarLaunchPos = managerSource.indexOf('Étape 3/4 — lancement sidecar');

    assert.ok(verifyPos >= 0);
    assert.ok(prunePos > verifyPos);
    assert.ok(sidecarArgsPos > prunePos);
    assert.ok(sidecarLaunchPos > sidecarArgsPos);
    assert.match(managerSource, /pruneSelfUpdateSnapshots\(\s*backup,\s*selfUpdateRetentionTag,\s*2,/s);
    assert.match(managerSource, /verifyFreshBackup\(\s*backup,\s*recoveryPath,\s*plan\.id,?\s*\)/s);
    assert.match(managerSource, /additionalTags: \[ selfUpdateRetentionTag \]/);

    const verifyStart = backupSource.indexOf("async verifyFreshBackup(");
    const dumpStart = backupSource.indexOf("private async resticDump", verifyStart);
    assert.ok(verifyStart >= 0);
    assert.ok(dumpStart > verifyStart);
    const verifySource = backupSource.slice(verifyStart, dumpStart);
    assert.doesNotMatch(verifySource, /this\.resticFor\(dest, \[ "ls"/);
    assert.match(verifySource, /this\.resticDump\(dest, safeId, expectedFilePath\)/);
    assert.match(verifySource, /recovery\.id !== expectedRecoveryId/);

    assert.match(backupSource, /snapshots", "--tag", instanceTag/);
    assert.match(backupSource, /const expired = ordered\.slice\(keep\)/);
    assert.match(backupSource, /"forget", \.\.\.ids, "--prune"/);
});


test("automatic self-update rechecks blockers before sidecar preparation and launch", async () => {
    const source = await fs.readFile(new URL("./manager.ts", import.meta.url), "utf8");
    const verifyPos = source.indexOf("verifyFreshBackup(");
    const prepareCheckPos = source.indexOf('recheckAutomaticBlocker(targetImage, automatic, "la préparation du sidecar")');
    const pullPos = source.indexOf('docker([ "image", "pull", sidecarImage ]');
    const launchCheckPos = source.indexOf('recheckAutomaticBlocker(targetImage, automatic, "le lancement du sidecar")');
    const argsPos = source.indexOf("const args = [", launchCheckPos);

    assert.ok(prepareCheckPos > verifyPos);
    assert.ok(pullPos > prepareCheckPos);
    assert.ok(launchCheckPos > pullPos);
    assert.ok(argsPos > launchCheckPos);
});
