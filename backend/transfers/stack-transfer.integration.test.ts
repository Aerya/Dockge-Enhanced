import test, { mock } from "node:test";
import assert from "node:assert/strict";
import { execFile, execFileSync } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs";
import { promises as fsAsync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { importStackTransfer, StackTransferRequest } from "./stack-transfer";
import { Settings } from "../settings";
import { Terminal } from "../terminal";
import { DockgeServer } from "../dockge-server";
import { DockgeSocket } from "../util-server";

const execFileAsync = promisify(execFile);
const dockerAvailable = (() => {
    try {
        execFileSync("docker", [ "info" ], { stdio: "ignore" });
        execFileSync("docker", [ "image", "inspect", "docker:29.6.1-cli" ], { stdio: "ignore" });
        return true;
    } catch {
        return false;
    }
})();

function request(targetName: string, command = "sleep 300"): StackTransferRequest {
    return {
        operation: "copy",
        sourceEndpoint: "source.test:5001",
        sourceStackName: "source-stack",
        targetName,
        composeYAML: `services:\n  worker:\n    image: docker:29.6.1-cli\n    command: ["sh", "-c", "${command}"]\n    volumes:\n      - ./data:/data\n`,
        composeENV: "TRANSFER_TEST=1\n",
        composeOverrideYAML: "",
        mappings: [{
            id: "worker-data",
            service: "worker",
            type: "bind",
            source: "./data",
            target: "/data",
            readOnly: false,
            external: false,
            size: null,
            targetSource: "./data",
            confidence: "high",
            reason: "relative-bind",
        }],
        deploy: true,
    };
}

async function dockerComposeDown(dir: string, project: string): Promise<void> {
    try {
        await execFileAsync("docker", [ "compose", "-p", project, "down", "--remove-orphans" ], { cwd: dir,
            timeout: 60_000 });
    } catch { /* cleanup best effort */ }
}

test("copies, atomically deploys and verifies a stack in an isolated target instance", { skip: !dockerAvailable,
    timeout: 90_000 }, async () => {
    const root = await fsAsync.mkdtemp(path.join(os.tmpdir(), "dockge-transfer-integration-"));
    const targetName = `transfer-ok-${Date.now()}`;
    const memory = new Map<string, unknown>();
    mock.method(Settings, "get", async (key: string) => memory.get(key));
    mock.method(Settings, "set", async (key: string, value: unknown) => {
        memory.set(key, value);
    });
    mock.method(Terminal, "exec", async (_server: DockgeServer, _socket: DockgeSocket | undefined, _name: string, file: string, args: string | string[], cwd: string) => {
        try {
            await execFileAsync(file, args as string[], { cwd,
                timeout: 60_000 });
            return 0;
        } catch {
            return 1;
        }
    });

    const server = { stacksDir: root } as DockgeServer;
    const socket = { endpoint: "",
        id: "integration",
        connected: true,
        emitAgent() {} } as unknown as DockgeSocket;
    try {
        const transferRequest = request(targetName);
        transferRequest.mappings[0].targetSource = "./mapped-data";
        const result = await importStackTransfer(server, socket, transferRequest);
        const targetDir = path.join(root, targetName);
        assert.equal(result.job.status, "succeeded");
        assert.equal(fs.existsSync(path.join(targetDir, "compose.yaml")), true);
        assert.equal(fs.existsSync(path.join(targetDir, ".env")), true);
        assert.equal(fs.existsSync(path.join(targetDir, "compose.override.yaml")), true);
        const rendered = JSON.parse(String((await execFileAsync("docker", [ "compose", "-p", targetName, "config", "--format", "json" ], { cwd: targetDir })).stdout));
        assert.match(String(rendered.services.worker.volumes[0].source), /mapped-data$/);
        const ps = await execFileAsync("docker", [ "compose", "-p", targetName, "ps", "--status", "running", "--services" ], { cwd: targetDir });
        assert.match(String(ps.stdout), /worker/);
    } finally {
        const targetDir = path.join(root, targetName);
        if (fs.existsSync(targetDir)) {
            await dockerComposeDown(targetDir, targetName);
        }
        await fsAsync.rm(root, { recursive: true,
            force: true });
        mock.restoreAll();
    }
});

test("rolls configuration and containers back when target verification fails", { skip: !dockerAvailable,
    timeout: 90_000 }, async () => {
    const root = await fsAsync.mkdtemp(path.join(os.tmpdir(), "dockge-transfer-rollback-"));
    const targetName = `transfer-fail-${Date.now()}`;
    const memory = new Map<string, unknown>();
    mock.method(Settings, "get", async (key: string) => memory.get(key));
    mock.method(Settings, "set", async (key: string, value: unknown) => {
        memory.set(key, value);
    });
    mock.method(Terminal, "exec", async (_server: DockgeServer, _socket: DockgeSocket | undefined, _name: string, file: string, args: string | string[], cwd: string) => {
        try {
            await execFileAsync(file, args as string[], { cwd,
                timeout: 60_000 });
            return 0;
        } catch {
            return 1;
        }
    });

    const server = { stacksDir: root } as DockgeServer;
    const socket = { endpoint: "",
        id: "integration",
        connected: true,
        emitAgent() {} } as unknown as DockgeSocket;
    try {
        await assert.rejects(importStackTransfer(server, socket, request(targetName, "exit 23")), /worker: exited with code 23/);
        assert.equal(fs.existsSync(path.join(root, targetName)), false);
        const ids = String((await execFileAsync("docker", [ "ps", "-aq", "--filter", `label=com.docker.compose.project=${targetName}` ])).stdout).trim();
        assert.equal(ids, "");
    } finally {
        await fsAsync.rm(root, { recursive: true,
            force: true });
        mock.restoreAll();
    }
});
