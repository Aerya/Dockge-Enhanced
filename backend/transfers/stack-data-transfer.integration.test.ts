import test, { mock } from "node:test";
import assert from "node:assert/strict";
import { execFile, execFileSync } from "node:child_process";
import express from "express";
import { createServer } from "node:http";
import { promisify } from "node:util";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { BackupManager } from "../watchers/backup-manager";
import { DockgeServer } from "../dockge-server";
import { DockgeSocket } from "../util-server";
import { Settings } from "../settings";
import { Terminal } from "../terminal";
import { StackTransferMount, StackTransferRequest } from "./stack-transfer";
import {
    completeStackTransferDataSource,
    createStackTransferDataSnapshot,
    finalizeStackTransferDataSource,
    finalizeStackTransferDataTarget,
    stageStackTransferDataTarget,
} from "./stack-data-transfer";
import { getStackTransferRepositories } from "./stack-transfer-restic";
import { activateStackReplicaTarget, inspectStackReplicaDrift, syncStackReplicaTarget, testStackReplicaSnapshot } from "./stack-replication-target";
import { configureHttpDirectTransport, directHttpRepositoryId, serveDirectHttpArchive } from "./http-direct-transport";

const execFileAsync = promisify(execFile);
const dockerAvailable = (() => {
    try {
        execFileSync("docker", [ "info" ], { stdio: "ignore" });
        execFileSync("docker", [ "image", "inspect", "busybox:stable" ], { stdio: "ignore" });
        return true;
    } catch {
        return false;
    }
})();
const integrationAvailable = (() => {
    try {
        if (!dockerAvailable) {
            return false;
        }
        execFileSync("restic", [ "version" ], { stdio: "ignore" });
        return true;
    } catch {
        return false;
    }
})();

function mappings(): StackTransferMount[] {
    return [
        {
            id: "0-worker-/bind",
            service: "worker",
            type: "bind",
            source: "./bind",
            target: "/bind",
            readOnly: false,
            external: false,
            size: null,
            targetSource: "./restored-bind",
            confidence: "high",
            reason: "relative-bind",
            transferData: true,
        },
        {
            id: "1-worker-/named",
            service: "worker",
            type: "volume",
            source: "payload",
            target: "/named",
            readOnly: false,
            external: false,
            size: null,
            targetSource: "target_payload",
            confidence: "high",
            reason: "named-volume",
            transferData: true,
        },
    ];
}

function transfer(sourceName: string, targetName: string, operation: "copy" | "move", command = "sleep 300"): StackTransferRequest {
    return {
        operation,
        sourceEndpoint: "source.test:5001",
        sourceStackName: sourceName,
        targetName,
        composeYAML: `services:\n  worker:\n    image: busybox:stable\n    command: ["sh", "-c", "${command}"]\n    volumes:\n      - ./bind:/bind\n      - payload:/named\nvolumes:\n  payload:\n`,
        composeENV: "",
        composeOverrideYAML: "",
        mappings: mappings(),
        deploy: true,
        dataTransfer: true,
    };
}

async function writeSource(root: string, name: string): Promise<void> {
    const dir = path.join(root, name);
    await fs.mkdir(path.join(dir, "bind"), { recursive: true });
    await fs.writeFile(path.join(dir, "compose.yaml"), transfer(name, "unused", "copy").composeYAML);
    await execFileAsync("docker", [ "compose", "-p", name, "up", "-d" ], { cwd: dir,
        timeout: 120_000 });
    await execFileAsync("docker", [ "compose", "-p", name, "exec", "-T", "worker", "sh", "-c", "printf bind-v1 >/bind/value; printf named-v1 >/named/value" ], { cwd: dir });
}

async function down(root: string, name: string): Promise<void> {
    const dir = path.join(root, name);
    try {
        await execFileAsync("docker", [ "compose", "-p", name, "down", "-v", "--remove-orphans" ], { cwd: dir,
            timeout: 120_000 });
    } catch { /* best effort */ }
}

async function createContext(root: string, repository: string): Promise<{ server: DockgeServer; socket: DockgeSocket; repositoryId: string }> {
    const memory = new Map<string, unknown>();
    mock.method(Settings, "get", async (key: string) => memory.get(key));
    mock.method(Settings, "set", async (key: string, value: unknown) => {
        memory.set(key, value);
    });
    mock.method(Terminal, "exec", async (_server: DockgeServer, _socket: DockgeSocket | undefined, _name: string, file: string, args: string | string[], cwd: string) => {
        try {
            await execFileAsync(file, args as string[], { cwd,
                timeout: 120_000 });
            return 0;
        } catch {
            return 1;
        }
    });
    const manager = BackupManager.getInstance();
    manager.settings.destinations = [{
        label: "Transfer test",
        enabled: true,
        type: "local",
        local: { path: repository },
        resticPassword: "integration-secret",
    }];
    const server = { stacksDir: root,
        config: { dataDir: path.join(root, ".data"),
            stacksDir: root } } as DockgeServer;
    const socket = { endpoint: "",
        id: "integration",
        connected: true,
        emitAgent() {} } as unknown as DockgeSocket;
    return { server,
        socket,
        repositoryId: getStackTransferRepositories()[0].id };
}

test("copies bind and named-volume data through a shared Restic repository", { skip: !integrationAvailable,
    timeout: 180_000 }, async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "dockge-data-copy-"));
    const sourceName = `data-source-${Date.now()}`;
    const targetName = `data-copy-${Date.now()}`;
    const transferId = `transfer-copy-${Date.now()}`;
    try {
        const context = await createContext(root, path.join(root, ".repository"));
        await writeSource(root, sourceName);
        const snapshot = await createStackTransferDataSnapshot(context.server, {
            transferId,
            stackName: sourceName,
            repositoryId: context.repositoryId,
            mappings: mappings(),
            policy: {
                mode: "hooks",
                hookService: "worker",
                preHook: "printf hook-pre >/bind/hook",
                postHook: "printf hook-post >/bind/post-hook",
            },
            phase: "copy",
        });
        const staged = await stageStackTransferDataTarget(context.server, context.socket, {
            transferId,
            repositoryId: context.repositoryId,
            snapshotId: snapshot.snapshotId,
            transfer: transfer(sourceName, targetName, "copy"),
        });
        assert.ok(staged.jobId);
        const targetDir = path.join(root, targetName);
        const output = await execFileAsync("docker", [ "compose", "-p", targetName, "exec", "-T", "worker", "sh", "-c", "cat /bind/value; cat /named/value; cat /bind/hook" ], { cwd: targetDir });
        assert.equal(output.stdout, "bind-v1named-v1hook-pre");
        const sourceRunning = await execFileAsync("docker", [ "compose", "-p", sourceName, "ps", "--status", "running", "--services" ], { cwd: path.join(root, sourceName) });
        assert.match(sourceRunning.stdout, /worker/);
        const postHook = await execFileAsync("docker", [ "compose", "-p", sourceName, "exec", "-T", "worker", "cat", "/bind/post-hook" ], { cwd: path.join(root, sourceName) });
        assert.equal(postHook.stdout, "hook-post");
        await completeStackTransferDataSource(context.server, transferId, true);
    } finally {
        await down(root, sourceName);
        await down(root, targetName);
        await fs.rm(root, { recursive: true,
            force: true });
        mock.restoreAll();
    }
});

test("copies bind and named-volume data through resumable direct HTTP", { skip: !dockerAvailable,
    timeout: 180_000 }, async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "dockge-data-http-"));
    const sourceName = `http-source-${Date.now()}`;
    const targetName = `http-copy-${Date.now()}`;
    const transferId = `transfer-http-${Date.now()}`;
    configureHttpDirectTransport(path.join(root, ".data"));
    const app = express();
    app.get("/api/transfer/http/:id", (request, response) => void serveDirectHttpArchive(request, response));
    app.head("/api/transfer/http/:id", (request, response) => void serveDirectHttpArchive(request, response));
    const httpServer = createServer(app);
    await new Promise<void>(resolve => httpServer.listen(0, "127.0.0.1", resolve));
    try {
        const context = await createContext(root, path.join(root, ".repository"));
        const address = httpServer.address();
        assert.ok(address && typeof address === "object");
        const repositoryId = directHttpRepositoryId(`http://127.0.0.1:${address.port}`);
        await writeSource(root, sourceName);
        const snapshot = await createStackTransferDataSnapshot(context.server, { transferId,
            stackName: sourceName,
            repositoryId,
            mappings: mappings(),
            policy: { mode: "hot" },
            phase: "copy" });
        await stageStackTransferDataTarget(context.server, context.socket, { transferId,
            repositoryId,
            snapshotId: snapshot.snapshotId,
            transfer: transfer(sourceName, targetName, "copy") });
        const output = await execFileAsync("docker", [ "compose", "-p", targetName, "exec", "-T", "worker", "sh", "-c", "cat /bind/value; cat /named/value" ], { cwd: path.join(root, targetName) });
        assert.equal(output.stdout, "bind-v1named-v1");
        await completeStackTransferDataSource(context.server, transferId, true);
    } finally {
        await down(root, sourceName);
        await down(root, targetName);
        await new Promise<void>((resolve, reject) => httpServer.close(error => error ? reject(error) : resolve()));
        await fs.rm(root, { recursive: true,
            force: true });
        mock.restoreAll();
    }
});

test("migrates a final delta, verifies the target and leaves the source stopped", { skip: !integrationAvailable,
    timeout: 240_000 }, async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "dockge-data-move-"));
    const sourceName = `data-source-${Date.now()}`;
    const targetName = `data-move-${Date.now()}`;
    const transferId = `transfer-move-${Date.now()}`;
    try {
        const context = await createContext(root, path.join(root, ".repository"));
        await writeSource(root, sourceName);
        const initial = await createStackTransferDataSnapshot(context.server, {
            transferId,
            stackName: sourceName,
            repositoryId: context.repositoryId,
            mappings: mappings(),
            policy: { mode: "hot" },
            phase: "initial",
        });
        const staged = await stageStackTransferDataTarget(context.server, context.socket, {
            transferId,
            repositoryId: context.repositoryId,
            snapshotId: initial.snapshotId,
            transfer: transfer(sourceName, targetName, "move"),
        });
        await execFileAsync("docker", [ "compose", "-p", sourceName, "exec", "-T", "worker", "sh", "-c", "rm /bind/value /named/value; printf bind-v2 >/bind/final; printf named-v2 >/named/final" ], { cwd: path.join(root, sourceName) });
        const final = await finalizeStackTransferDataSource(context.server, transferId);
        await finalizeStackTransferDataTarget(context.server, context.socket, {
            transferId,
            repositoryId: context.repositoryId,
            snapshotId: final.snapshotId,
            transfer: transfer(sourceName, targetName, "move"),
        }, staged.jobId);
        const targetDir = path.join(root, targetName);
        const output = await execFileAsync("docker", [ "compose", "-p", targetName, "exec", "-T", "worker", "sh", "-c", "test ! -e /bind/value; test ! -e /named/value; cat /bind/final; cat /named/final" ], { cwd: targetDir });
        assert.equal(output.stdout, "bind-v2named-v2");
        const sourceRunning = await execFileAsync("docker", [ "compose", "-p", sourceName, "ps", "--status", "running", "--services" ], { cwd: path.join(root, sourceName) });
        assert.equal(sourceRunning.stdout.trim(), "");
        await completeStackTransferDataSource(context.server, transferId, true);
    } finally {
        await down(root, sourceName);
        await down(root, targetName);
        await fs.rm(root, { recursive: true,
            force: true });
        mock.restoreAll();
    }
});

test("rolls the target back and restarts the source when migrated deployment fails", { skip: !integrationAvailable,
    timeout: 240_000 }, async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "dockge-data-rollback-"));
    const sourceName = `data-source-${Date.now()}`;
    const targetName = `data-rollback-${Date.now()}`;
    const transferId = `transfer-rollback-${Date.now()}`;
    try {
        const context = await createContext(root, path.join(root, ".repository"));
        await writeSource(root, sourceName);
        const initial = await createStackTransferDataSnapshot(context.server, {
            transferId,
            stackName: sourceName,
            repositoryId: context.repositoryId,
            mappings: mappings(),
            policy: { mode: "hot" },
            phase: "initial",
        });
        const failingTransfer = transfer(sourceName, targetName, "move", "exit 23");
        const staged = await stageStackTransferDataTarget(context.server, context.socket, {
            transferId,
            repositoryId: context.repositoryId,
            snapshotId: initial.snapshotId,
            transfer: failingTransfer,
        });
        const final = await finalizeStackTransferDataSource(context.server, transferId);
        await assert.rejects(finalizeStackTransferDataTarget(context.server, context.socket, {
            transferId,
            repositoryId: context.repositoryId,
            snapshotId: final.snapshotId,
            transfer: failingTransfer,
        }, staged.jobId), /exited with code 23/);
        await completeStackTransferDataSource(context.server, transferId, false);
        const sourceRunning = await execFileAsync("docker", [ "compose", "-p", sourceName, "ps", "--status", "running", "--services" ], { cwd: path.join(root, sourceName) });
        assert.match(sourceRunning.stdout, /worker/);
        await assert.rejects(fs.access(path.join(root, targetName)));
    } finally {
        await down(root, sourceName);
        await down(root, targetName);
        await fs.rm(root, { recursive: true,
            force: true });
        mock.restoreAll();
    }
});

test("restores existing target configuration and data after an overwrite deployment failure", { skip: !integrationAvailable,
    timeout: 300_000 }, async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "dockge-data-overwrite-"));
    const sourceName = `overwrite-source-${Date.now()}`;
    const targetName = `overwrite-target-${Date.now()}`;
    const transferId = `transfer-overwrite-${Date.now()}`;
    try {
        const context = await createContext(root, path.join(root, ".repository"));
        await writeSource(root, sourceName);
        await writeSource(root, targetName);
        await execFileAsync("docker", [ "compose", "-p", targetName, "exec", "-T", "worker", "sh", "-c", "printf target-old >/bind/value; printf named-old >/named/value" ], { cwd: path.join(root, targetName) });
        await execFileAsync("docker", [ "compose", "-p", targetName, "stop" ], { cwd: path.join(root, targetName),
            timeout: 120_000 });
        const snapshot = await createStackTransferDataSnapshot(context.server, { transferId,
            stackName: sourceName,
            repositoryId: context.repositoryId,
            mappings: mappings(),
            policy: { mode: "hot" },
            phase: "copy" });
        await assert.rejects(stageStackTransferDataTarget(context.server, context.socket, { transferId,
            repositoryId: context.repositoryId,
            snapshotId: snapshot.snapshotId,
            transfer: { ...transfer(sourceName, targetName, "copy", "exit 23"),
                overwriteExisting: true } }), /exited with code 23/);
        const restoredCompose = await fs.readFile(path.join(root, targetName, "compose.yaml"), "utf8");
        assert.match(restoredCompose, /sleep 300/);
        assert.doesNotMatch(restoredCompose, /exit 23/);
        const output = await execFileAsync("docker", [ "compose", "-p", targetName, "run", "--rm", "--no-deps", "worker", "sh", "-c", "cat /bind/value; cat /named/value" ], { cwd: path.join(root, targetName),
            timeout: 120_000 });
        assert.equal(output.stdout, "target-oldnamed-old");
        assert.equal((await fs.readdir(root)).some(name => name.startsWith(".dockge-overwrite-")), false);
        await completeStackTransferDataSource(context.server, transferId, true);
    } finally {
        await down(root, sourceName);
        await down(root, targetName);
        await fs.rm(root, { recursive: true,
            force: true });
        mock.restoreAll();
    }
});

test("refreshes a cold replica, rolls back a failed refresh and activates the standby", { skip: !integrationAvailable,
    timeout: 300_000 }, async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "dockge-data-replica-"));
    const sourceName = `data-source-${Date.now()}`;
    const targetName = `data-replica-${Date.now()}`;
    const replicaId = `replica-${Date.now()}`;
    try {
        const context = await createContext(root, path.join(root, ".repository"));
        await writeSource(root, sourceName);
        let previous: { snapshotId: string; archivePath: string } | undefined;
        for (const [ index, expected ] of [ "v1", "v2" ].entries()) {
            if (index === 1) {
                await execFileAsync("docker", [ "compose", "-p", sourceName, "exec", "-T", "worker", "sh", "-c", "printf bind-v2 >/bind/value; printf named-v2 >/named/value" ], { cwd: path.join(root, sourceName) });
            }
            const transferId = `replication-${index}-${Date.now()}`;
            const snapshot = await createStackTransferDataSnapshot(context.server, {
                transferId,
                stackName: sourceName,
                repositoryId: context.repositoryId,
                mappings: mappings(),
                policy: { mode: "hot" },
                phase: "copy",
            });
            const request = {
                replicaId,
                transferId,
                repositoryId: context.repositoryId,
                snapshotId: snapshot.snapshotId,
                archivePath: snapshot.archivePath,
                transfer: transfer(sourceName, targetName, "copy"),
            };
            request.transfer.deploy = false;
            await syncStackReplicaTarget(context.server, context.socket, request);
            await completeStackTransferDataSource(context.server, transferId, true, true);
            const targetDir = path.join(root, targetName);
            const running = await execFileAsync("docker", [ "compose", "-p", targetName, "ps", "--status", "running", "--services" ], { cwd: targetDir });
            assert.equal(running.stdout.trim(), "");
            const output = await execFileAsync("docker", [ "compose", "-p", targetName, "run", "--rm", "--no-deps", "worker", "sh", "-c", "cat /bind/value; cat /named/value" ], { cwd: targetDir,
                timeout: 120_000 });
            assert.equal(output.stdout, `bind-${expected}named-${expected}`);
            previous = snapshot;
        }

        const badRequest = {
            replicaId,
            transferId: `replication-bad-${Date.now()}`,
            repositoryId: context.repositoryId,
            snapshotId: "deadbeef",
            archivePath: "/dockge-stack-transfer/missing/copy.tar",
            transfer: transfer(sourceName, targetName, "copy"),
        };
        badRequest.transfer.deploy = false;
        await assert.rejects(syncStackReplicaTarget(context.server, context.socket, badRequest));
        const restored = await execFileAsync("docker", [ "compose", "-p", targetName, "run", "--rm", "--no-deps", "worker", "sh", "-c", "cat /bind/value; cat /named/value" ], { cwd: path.join(root, targetName),
            timeout: 120_000 });
        assert.equal(restored.stdout, "bind-v2named-v2");

        const recovery = await testStackReplicaSnapshot(context.server, context.socket, targetName, replicaId, true);
        assert.equal(recovery.containersStarted, true);
        assert.equal(recovery.mountsChecked, 2);
        assert.equal(recovery.fileCount, 2);
        assert.ok(recovery.bytesRead > 0);
        assert.equal((await fs.readdir(root)).some(name => name.startsWith("dockge-recovery-")), false);
        const recoveryVolumes = await execFileAsync("docker", [ "volume", "ls", "--format", "{{.Name}} {{.Labels}}" ]);
        assert.doesNotMatch(recoveryVolumes.stdout, new RegExp(`com.docker.compose.project=dockge-recovery-${replicaId}`));

        const activated = await activateStackReplicaTarget(context.server, context.socket, targetName, replicaId);
        assert.ok(activated.activatedAt);
        const running = await execFileAsync("docker", [ "compose", "-p", targetName, "ps", "--status", "running", "--services" ], { cwd: path.join(root, targetName) });
        assert.match(running.stdout, /worker/);
        assert.ok(previous?.snapshotId);
    } finally {
        await down(root, sourceName);
        await down(root, targetName);
        await fs.rm(root, { recursive: true,
            force: true });
        mock.restoreAll();
    }
});

test("keeps a repository-only replica empty until activation and detects target drift", { skip: !integrationAvailable,
    timeout: 240_000 }, async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "dockge-data-repository-replica-"));
    const sourceName = `repository-source-${Date.now()}`;
    const targetName = `repository-target-${Date.now()}`;
    const replicaId = `replica-${Date.now()}`;
    const transferId = `replication-repository-${Date.now()}`;
    try {
        const context = await createContext(root, path.join(root, ".repository"));
        await writeSource(root, sourceName);
        const snapshot = await createStackTransferDataSnapshot(context.server, { transferId,
            stackName: sourceName,
            repositoryId: context.repositoryId,
            mappings: mappings(),
            policy: { mode: "hot" },
            phase: "copy" });
        const request = { replicaId,
            transferId,
            repositoryId: context.repositoryId,
            snapshotId: snapshot.snapshotId,
            archivePath: snapshot.archivePath,
            storageMode: "repository" as const,
            transfer: { ...transfer(sourceName, targetName, "copy"),
                deploy: false } };
        await syncStackReplicaTarget(context.server, context.socket, request);
        await assert.rejects(fs.access(path.join(root, targetName, "restored-bind", "value")));
        assert.deepEqual(await inspectStackReplicaDrift(context.server, targetName, replicaId), { drifted: false });
        await fs.appendFile(path.join(root, targetName, "compose.yaml"), "\n# drift\n");
        const drift = await inspectStackReplicaDrift(context.server, targetName, replicaId);
        assert.equal(drift.drifted, true);
        assert.match(drift.reason || "", /configuration was modified/);
        await fs.writeFile(path.join(root, targetName, "compose.yaml"), request.transfer.composeYAML);
        await activateStackReplicaTarget(context.server, context.socket, targetName, replicaId);
        const output = await execFileAsync("docker", [ "compose", "-p", targetName, "exec", "-T", "worker", "sh", "-c", "cat /bind/value; cat /named/value" ], { cwd: path.join(root, targetName) });
        assert.equal(output.stdout, "bind-v1named-v1");
    } finally {
        await down(root, sourceName);
        await down(root, targetName);
        await fs.rm(root, { recursive: true,
            force: true });
        mock.restoreAll();
    }
});
