import test, { mock } from "node:test";
import assert from "node:assert/strict";
import { execFile, execFileSync } from "node:child_process";
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

const execFileAsync = promisify(execFile);
const integrationAvailable = (() => {
    try {
        execFileSync("docker", [ "info" ], { stdio: "ignore" });
        execFileSync("docker", [ "image", "inspect", "busybox:stable" ], { stdio: "ignore" });
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
