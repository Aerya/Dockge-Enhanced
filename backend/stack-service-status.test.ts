import assert from "node:assert/strict";
import test from "node:test";
import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";
import childProcessAsync from "promisify-child-process";
import { Stack } from "./stack";
import { DockgeServer } from "./dockge-server";
import { AgentSocket } from "../common/agent-socket";
import { DockerSocketHandler } from "./agent-socket-handlers/docker-socket-handler";
import { DockgeSocket } from "./util-server";
import { ExternalStackManager } from "./external-stacks";

test("repeated status polls of an unadopted DDEV project never spawn Docker", async (t) => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "dockge-status-"));
    t.after(() => fs.rm(root, { recursive: true,
        force: true }));
    const spawn = t.mock.method(childProcessAsync, "spawn", () => {
        throw new Error("Docker must not be called for an unadopted stack");
    });
    const stack = new Stack({ stacksDir: root } as DockgeServer, "ddev-unadopted");
    for (let poll = 0; poll < 3; poll++) {
        assert.deepEqual(await stack.getServiceStatusList(), {
            serviceStatusList: new Map(),
            lastUpdated: null,
            lastStartedAt: null,
        });
    }
    assert.equal(spawn.mock.callCount(), 0);
    assert.deepEqual(await fs.readdir(root), []);
});

test("managed service status remains populated and a vanished directory invalidates its cache", async (t) => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "dockge-status-"));
    t.after(() => fs.rm(root, { recursive: true,
        force: true }));
    const dir = path.join(root, "managed-status");
    await fs.mkdir(dir);
    const startedAt = "2026-10-18T08:00:00Z";
    const spawn = t.mock.method(childProcessAsync, "spawn", async (_command: string, args: string[], options: { cwd?: string }) => {
        if (args[0] === "inspect") {
            return { stdout: `/managed-web ${startedAt}\n` };
        }
        assert.equal(options.cwd, dir);
        return { stdout: JSON.stringify({ Service: "web",
            Name: "managed-web",
            State: "running",
            Health: "healthy",
            Ports: "0.0.0.0:8080->80/tcp" }) };
    });
    const stack = new Stack({ stacksDir: root } as DockgeServer, "managed-status");
    const result = await stack.getServiceStatusList();
    assert.deepEqual(result.serviceStatusList.get("web"), {
        state: "healthy",
        ports: [ "0.0.0.0:8080->80/tcp" ],
        startedAt,
    });
    assert.equal(result.lastStartedAt, "2026-10-18T08:00:00.000Z");
    assert.deepEqual(await stack.getServiceStatusList(), result);
    assert.equal(spawn.mock.callCount(), 2);
    await fs.rm(dir, { recursive: true });
    assert.equal((await stack.getServiceStatusList()).serviceStatusList.size, 0);
    assert.equal(spawn.mock.callCount(), 2);
});

test("serviceStatusList socket resolves an adopted external project's directory and Compose files", async (t) => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "dockge-status-"));
    t.after(() => fs.rm(root, { recursive: true,
        force: true }));
    const dir = path.join(root, "external");
    await fs.mkdir(dir);
    const configFiles = [ path.join(dir, "compose.yaml"), path.join(dir, "override.yaml") ];
    for (const file of configFiles) {
        await fs.writeFile(file, "services: {}\n");
    }
    const registration = { name: "adopted-status",
        project: "ddev-real-project",
        workingDir: dir,
        composeFile: configFiles[0],
        configFiles,
        envFiles: [] };
    const externalStacks = {
        get: async () => registration,
        assertRegisteredPath: async () => registration,
    } as unknown as ExternalStackManager;
    const server = { stacksDir: path.join(root, "stacks"),
        config: { dataDir: path.join(root, "data") },
        externalStacks } as DockgeServer;
    const spawn = t.mock.method(childProcessAsync, "spawn", async (command: string, args: string[], options: { cwd?: string }) => {
        assert.equal(command, "docker");
        assert.equal(options.cwd, dir);
        assert.deepEqual(args, [ "compose", "--project-directory", dir, "--project-name", "ddev-real-project", "-f", configFiles[0], "-f", configFiles[1], "ps", "--format", "json" ]);
        return { stdout: JSON.stringify({ Service: "web",
            State: "running",
            Health: "",
            Ports: "" }) };
    });
    const agentSocket = new AgentSocket();
    new DockerSocketHandler().create({ userID: 1 } as DockgeSocket, server, agentSocket);
    const response = await new Promise<{ ok: boolean;
        serviceStatusList: Record<string, { state: string }> }>(resolve => agentSocket.call("serviceStatusList", registration.name, resolve));
    assert.equal(response.ok, true);
    assert.equal(response.serviceStatusList.web.state, "running");
    assert.equal(spawn.mock.callCount(), 1);
    await assert.rejects(fs.stat(path.join(server.stacksDir, registration.name)), { code: "ENOENT" });
});
