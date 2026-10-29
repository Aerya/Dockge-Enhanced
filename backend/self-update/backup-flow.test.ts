import test from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { SelfUpdateOperation } from "./types";

test("self-update backup policies drive the real manager without a Docker daemon", async t => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "self-backup-flow-"));
    const previous = { ...process.env };
    process.env.DOCKGE_DATA_DIR = path.join(dir, "data");
    process.env.DOCKGE_CONTAINER_ID = "fixture-enhanced";
    process.env.DOCKER_HOST = "tcp://fixture-proxy:2375";
    process.env.FIXTURE_DOCKER_LOG = path.join(dir, "docker.log");
    await fs.copyFile(new URL("../test-fixtures/self-update-backup-docker.cjs", import.meta.url), path.join(dir, "docker"));
    await fs.chmod(path.join(dir, "docker"), 0o700);
    process.env.PATH = `${dir}:${process.env.PATH}`;
    try {
        const { SelfUpdateManager } = await import("./manager");
        const { BackupManager } = await import("../watchers/backup-manager");
        const { activeDockerUpdateOperation } = await import("./operation-coordinator");
        const manager = SelfUpdateManager.getInstance();
        const internals = manager as unknown as {
            operation: SelfUpdateOperation;
            notify: () => Promise<boolean>;
            notifySelfUpdateDeferred: () => Promise<boolean>;
            recheckAutomaticBlocker: () => Promise<null>;
        };
        t.mock.method(internals, "notify", async () => true);
        t.mock.method(internals, "notifySelfUpdateDeferred", async () => true);
        const backup = BackupManager.getInstance();
        let runs = 0;
        const run = t.mock.method(backup, "runBackup", async () => {
            runs++;
            throw new Error("fixture: no Restic destination");
        });
        const reset = async () => {
            internals.operation = { id: "",
                state: "idle",
                message: "",
                startedAt: null,
                finishedAt: null,
                targetImage: "",
                rollbackAttempted: false };
            await fs.writeFile(process.env.FIXTURE_DOCKER_LOG!, "");
        };
        const target = `ghcr.io/aerya/dockge-enhanced@sha256:${"c".repeat(64)}`;
        await t.test("default still refuses a failed Restic backup", async () => {
            await reset();
            const result = await manager.requestSidecarUpdate(target);
            assert.equal(result.state, "failed");
            assert.equal(runs, 1);
            assert.equal(activeDockerUpdateOperation(), null);
            assert.doesNotMatch(await fs.readFile(process.env.FIXTURE_DOCKER_LOG!, "utf8"), /image","pull/);
        });
        await t.test("disabling requires acknowledgement and persists safely", async () => {
            await assert.rejects(manager.saveSettings({ backupProvider: "external" }), /acknowledgement/);
            assert.equal(manager.getSettings().backupProvider, "restic");
            await manager.saveSettings({ backupProvider: "external",
                externalBackupAcknowledged: true });
            await manager.saveSettings({ mode: "manual" }); // Legacy UI does not reset the choice.
            assert.equal(manager.getSettings().backupProvider, "external");
            const persisted = JSON.parse(await fs.readFile(path.join(process.env.DOCKGE_DATA_DIR!, "self-update/settings.json"), "utf8"));
            assert.equal(persisted.backupProvider, "external");
            assert.equal(persisted.externalBackupAcknowledged, undefined);
        });
        await t.test("external backups skip Restic, retain recovery and launch the isolated updater", async () => {
            await reset();
            const result = await manager.requestSidecarUpdate(target);
            assert.equal(result.state, "updating");
            assert.equal(runs, 1);
            assert.equal(result.stageHistory?.filter(s => s.skipped).length, 3);
            const stateDir = path.join(process.env.DOCKGE_DATA_DIR!, "self-update");
            const plan = JSON.parse(await fs.readFile(path.join(stateDir, `${result.id}.json`), "utf8"));
            assert.match(plan.signature, /^[a-f0-9]{64}$/);
            const recovery = JSON.parse(await fs.readFile(path.join(stateDir, "recovery", `${result.id}.json`), "utf8"));
            assert.equal(recovery.id, result.id);
            const commands = await fs.readFile(process.env.FIXTURE_DOCKER_LOG!, "utf8");
            assert.match(commands, /"df"/);
            assert.match(commands, /fixture-data/);
            assert.match(commands, /"--network","fixture-network"/);
            assert.equal(activeDockerUpdateOperation(), null);
        });
        await t.test("re-enabling Restic restores the original failure gate", async () => {
            await reset();
            await manager.saveSettings({ backupProvider: "restic" });
            assert.equal((await manager.requestSidecarUpdate(target)).state, "failed");
            assert.equal(run.mock.callCount(), 2);
        });
        await t.test("Zerobyte must verify the fresh recovery before the sidecar can launch", async () => {
            const { Settings } = await import("../settings");
            t.mock.method(Settings, "get", async () => null); // No pending transfers or replication.
            const { zerobyte, ZerobyteManager } = await import("../integrations/zerobyte-manager");
            const client = new ZerobyteManager(dir);
            t.mock.method(zerobyte, "session", async () => client);
            t.mock.method(client, "job", async () => ({ shortId: "self-job",
                enabled: false,
                maxRetries: 0,
                repositoryId: "repo",
                repository: { id: "repo",
                    shortId: "repo-short" },
                volume: { config: { backend: "directory",
                    path: "/sources/data" } } }));
            t.mock.method(client, "runBackup", async () => ({ taskId: "task" }));
            t.mock.method(client, "task", async () => ({ id: "task",
                kind: "backup",
                resourceId: "self-job",
                status: "succeeded",
                result: { kind: "backup",
                    exitCode: 0,
                    warningDetails: null,
                    result: { snapshot_id: "a".repeat(64) } } }));
            const read = t.mock.method(client, "recoverySnapshotFile", async (_repo: string, _snapshot: string, requestedPath: string) => {
                assert.doesNotMatch(await fs.readFile(process.env.FIXTURE_DOCKER_LOG!, "utf8"), /image","pull/);
                return JSON.parse(await fs.readFile(path.join(process.env.DOCKGE_DATA_DIR!, "self-update/recovery", path.basename(requestedPath)), "utf8"));
            });
            await manager.saveSettings({ backupProvider: "zerobyte",
                zerobyteJobId: "self-job",
                zerobyteDataPath: "/sources/data" });
            for (const automatic of [ false, true ]) {
                await reset();
                await manager.saveSettings({ mode: automatic ? "sidecar" : "manual" });
                const result = await manager.requestSidecarUpdate(target, automatic);
                assert.equal(result.state, "updating");
                assert.equal(runs, 2);
                assert.equal(result.stageHistory?.find(s => s.stage === "verify-backup")?.skipped, undefined);
                assert.ok(result.stageHistory?.find(s => s.stage === "verify-backup")?.finishedAt);
                assert.equal(result.stageHistory?.find(s => s.stage === "prune-backup")?.skipped, true);
            }
            read.mock.mockImplementation(async () => ({ id: "wrong-operation" }));
            await reset();
            assert.equal((await manager.requestSidecarUpdate(target)).state, "failed");
            assert.doesNotMatch(await fs.readFile(process.env.FIXTURE_DOCKER_LOG!, "utf8"), /image","pull/);
            assert.equal(activeDockerUpdateOperation(), null);
        });
        await t.test("active Zerobyte application backups defer automatic updates before Docker", async () => {
            const { setZerobyteApplicationBackupActive } = await import("../integrations/zerobyte-coordination");
            await reset();
            await manager.saveSettings({ mode: "sidecar" });
            setZerobyteApplicationBackupActive(true);
            try {
                const result = await manager.requestSidecarUpdate(target, true);
                assert.equal(result.state, "scheduled");
                assert.equal(result.deferredBy, "zerobyte-backup");
                assert.equal(await fs.readFile(process.env.FIXTURE_DOCKER_LOG!, "utf8"), "");
                assert.equal(activeDockerUpdateOperation(), null);
            } finally {
                setZerobyteApplicationBackupActive(false);
            }
        });
        await t.test("restart during Zerobyte verification does not leave a permanently running update", async () => {
            await reset();
            const interrupted: SelfUpdateOperation = {
                ...internals.operation,
                id: "interrupted",
                state: "verifying-backup",
                targetImage: target,
                stageHistory: [{ stage: "preparing",
                    startedAt: new Date().toISOString(),
                    backupProvider: "zerobyte" }],
            };
            await fs.writeFile(path.join(process.env.DOCKGE_DATA_DIR!, "self-update/status.json"), JSON.stringify(interrupted));
            await manager.load();
            assert.equal(manager.getOperation().state, "failed");
            assert.match(manager.getOperation().message, /interrupted/);
            assert.equal(await fs.readFile(process.env.FIXTURE_DOCKER_LOG!, "utf8"), "");
            assert.equal(manager.getSettings().backupProvider, "zerobyte");
        });
    } finally {
        t.mock.restoreAll();
        process.env = previous;
        await fs.rm(dir, { recursive: true,
            force: true });
    }
});
