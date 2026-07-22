import test, { mock } from "node:test";
import assert from "node:assert/strict";
import { Settings } from "../settings";
import { StackReplicationManager } from "./stack-replication-manager";
import { StackTransferMount } from "../transfers/stack-transfer";

function mapping(): StackTransferMount {
    return {
        id: "0-app-/data",
        service: "app",
        type: "volume",
        source: "data",
        target: "/data",
        readOnly: false,
        external: false,
        size: 1024,
        targetSource: "replica_data",
        confidence: "high",
        reason: "named-volume",
        transferData: true,
    };
}

test("schedules repeat synchronizations, rotates the retained snapshot and activates the target", async () => {
    const memory = new Map<string, unknown>();
    mock.method(Settings, "get", async (key: string) => memory.get(key));
    mock.method(Settings, "set", async (key: string, value: unknown) => {
        memory.set(key, value);
    });
    const manager = StackReplicationManager.getInstance();
    manager.stop();
    const calls: Array<{ endpoint: string; event: string; args: unknown[] }> = [];
    let snapshotIndex = 0;
    const internal = manager as unknown as {
        call<T>(endpoint: string, event: string, ...args: unknown[]): Promise<T>;
    };
    mock.method(internal, "call", async (endpoint: string, event: string, ...args: unknown[]) => {
        calls.push({ endpoint,
            event,
            args });
        if (event === "analyzeStackTransfer") {
            return { composeYAML: "services:\n  app:\n    image: busybox\n    volumes: [data:/data]\nvolumes:\n  data:\n",
                composeENV: "",
                composeOverrideYAML: "",
                mounts: [ mapping() ] };
        }
        if (event === "getStackTransferDataCapabilities") {
            return { repositories: [{ id: "repository-id" }] };
        }
        if (event === "createStackTransferDataSnapshot") {
            snapshotIndex++;
            return { snapshotId: `snapshot-${snapshotIndex}`,
                archivePath: `/dockge-stack-transfer/run-${snapshotIndex}/copy.tar`,
                bytesTransferred: snapshotIndex * 2048 };
        }
        if (event === "syncStackReplicaTarget") {
            return { synchronizedAt: `2026-07-15T10:0${snapshotIndex}:00.000Z` };
        }
        if (event === "testStackReplicaSnapshot") {
            return { testedAt: `2026-07-15T10:1${snapshotIndex}:00.000Z`,
                bytesRead: 4096 };
        }
        if (event === "activateStackReplicaTarget") {
            return { activatedAt: "2026-07-15T11:00:00.000Z" };
        }
        return {};
    });
    try {
        const policy = await manager.save({
            sourceEndpoint: "",
            sourceStackName: "source",
            targetEndpoint: "remote:5001",
            targetName: "source-replica",
            repositoryId: "repository-id",
            intervalMinutes: 60,
            mappings: [ mapping() ],
            consistency: { mode: "hot" },
            storageMode: "repository",
            retentionCount: 1,
        });
        const first = await manager.run(policy.id);
        assert.equal(first.status, "ready");
        assert.equal(first.lastSnapshotId, "snapshot-1");
        assert.equal(first.lastRestoreTestBytes, 4096);
        assert.equal(first.lastTransferredBytes, 2048);
        assert.equal(first.storageMode, "repository");
        assert.equal((calls.find(call => call.event === "syncStackReplicaTarget")?.args[0] as { storageMode: string }).storageMode, "repository");
        const second = await manager.run(policy.id);
        assert.equal(second.lastSnapshotId, "snapshot-2");
        assert.equal(second.snapshotHistory?.length, 1);
        assert.equal(second.totalTransferredBytes, 6144);
        const cleanup = calls.find(call => call.event === "forgetStackTransferSnapshots");
        assert.deepEqual(cleanup?.args, [ "repository-id", [ "snapshot-1" ]]);
        const completion = calls.filter(call => call.event === "completeStackTransferDataSource").at(-1);
        assert.equal(completion?.args.at(-1), true);

        const tested = await manager.testRecovery(policy.id);
        assert.equal(tested.lastRestoreTestBytes, 4096);
        assert.equal(calls.filter(call => call.event === "testStackReplicaSnapshot").length, 3);

        const active = await manager.activate(policy.id);
        assert.equal(active.status, "active");
        assert.equal(active.enabled, false);
        assert.equal(active.activatedAt, "2026-07-15T11:00:00.000Z");
    } finally {
        mock.restoreAll();
    }
});

test("rejects unsupported replication intervals", async () => {
    const memory = new Map<string, unknown>();
    mock.method(Settings, "get", async (key: string) => memory.get(key));
    mock.method(Settings, "set", async (key: string, value: unknown) => {
        memory.set(key, value);
    });
    try {
        await assert.rejects(StackReplicationManager.getInstance().save({
            sourceEndpoint: "",
            sourceStackName: "source",
            targetEndpoint: "remote:5001",
            targetName: "source-replica",
            repositoryId: "repository-id",
            intervalMinutes: 30,
            mappings: [ mapping() ],
            consistency: { mode: "hot" },
        }), /15 minutes/);
    } finally {
        mock.restoreAll();
    }
});
