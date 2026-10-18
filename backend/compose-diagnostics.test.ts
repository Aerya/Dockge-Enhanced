import assert from "node:assert/strict";
import test from "node:test";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { Stack } from "./stack";
import type { DockgeServer } from "./dockge-server";
import { inspectComposeDraft } from "./compose-diagnostics";
import { DockerSocketHandler } from "./agent-socket-handlers/docker-socket-handler";
import { AgentSocket } from "../common/agent-socket";
import type { DockgeSocket } from "./util-server";

test("diagnostic socket rejects unauthenticated callers before accessing Docker", async () => {
    const socket = new AgentSocket();
    new DockerSocketHandler().create({} as DockgeSocket, {} as DockgeServer, socket);
    const result = await new Promise<{ ok: boolean }>(resolve => {
        socket.call("inspectComposeDraft", { name: "demo",
            compose: "services: {}",
            env: "",
            override: "",
            isAdd: true }, resolve);
    });
    assert.equal(result.ok, false);
});

test("diagnostics use resolved Compose, report stopped stacks and running unmanaged ports without writes", async t => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "compose-diagnostics-test-"));
    t.after(() => fs.rm(root, { recursive: true,
        force: true }));
    const server = { stacksDir: root } as DockgeServer;
    const other = new Stack(server, "stopped", "services: {}", "");
    t.mock.method(Stack, "getStackList", async () => new Map([[ "stopped", other ]]));
    Object.defineProperty(other, "isManagedByDockge", { get: () => true });
    const commands: string[][] = [];
    let temporary = "";
    const result = await inspectComposeDraft(server, "example", "services:\n  web:\n    image: nginx:1\n", "PORT=8080", "", true, async (args, cwd) => {
        commands.push(args);
        if (args.includes("config")) {
            if (!cwd) {
                const envFile = args[args.indexOf("--env-file") + 1];
                temporary = path.dirname(envFile);
                assert.equal((await fs.stat(envFile)).mode & 0o777, 0o600);
                return JSON.stringify({ services: { web: { image: "nginx:1",
                    ports: [{ published: "8080" }, { published: "9090" }] } } });
            }
            return JSON.stringify({ services: { app: { ports: [{ published: "8080" }] } } });
        }
        if (args[0] === "ps") {
            return "fixture\n";
        }
        assert.equal(args[0], "inspect");
        return JSON.stringify([{ Name: "/outside",
            Config: { Image: "nginx:1",
                Labels: {} },
            NetworkSettings: { Ports: { "80/tcp": [{ HostIp: "0.0.0.0",
                HostPort: "9090" }] } } }]);
    });
    assert.deepEqual(result.conflicts.map(item => item.occupied.owner).sort(), [ "outside", "stopped" ]);
    assert.deepEqual(await fs.readdir(root), []);
    await assert.rejects(fs.access(temporary));
    assert.equal(commands.filter(args => args[0] === "inspect").length, 1);
    assert.ok(commands.every(args => args[0] === "ps" || args[0] === "inspect" || args.includes("config")));
});

test("concurrent scans are bounded; failure releases reservation and removes temporary credentials", async t => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "compose-diagnostics-lock-"));
    t.after(() => fs.rm(root, { recursive: true,
        force: true }));
    const server = { stacksDir: root } as DockgeServer;
    let release!: () => void;
    let entered!: () => void;
    const barrier = new Promise<void>(resolve => {
        release = resolve;
    });
    const started = new Promise<void>(resolve => {
        entered = resolve;
    });
    let temporary = "";
    const first = inspectComposeDraft(server, "demo", "services: {}", "SECRET=test", "", true, async args => {
        temporary = path.dirname(args[args.indexOf("--env-file") + 1]);
        entered();
        await barrier;
        throw new Error("failure");
    });
    await started;
    await assert.rejects(inspectComposeDraft(server, "demo", "services: {}", "", "", true), /unavailable/);
    release();
    await assert.rejects(first, /failure/);
    await assert.rejects(fs.access(temporary));
    await assert.rejects(inspectComposeDraft(server, "demo", "services: {}", "", "", true, async () => {
        throw new Error("new scan");
    }), /new scan/);
});

test("real Compose resolves global.env, draft env, overrides and port ranges without a Docker daemon", async t => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "compose-diagnostics-config-"));
    t.after(() => fs.rm(root, { recursive: true,
        force: true }));
    await fs.writeFile(path.join(root, "global.env"), "HOST_PORT=8080\nTAG=1\n");
    const server = { stacksDir: root } as DockgeServer;
    t.mock.method(Stack, "getStackList", async () => new Map());
    let resolved: { services: { web: { image: string;
        ports: { published: string }[] } } } | undefined;
    const result = await inspectComposeDraft(server, "demo", "services:\n  web:\n    image: nginx:${TAG}\n    ports:\n      - '${HOST_PORT}:80'\n", "TAG=2\n", "services:\n  web:\n    ports:\n      - '9000-9002:9000-9002/udp'\n", true, async args => {
        if (args.includes("config")) {
            const { stdout } = await promisify(execFile)("docker", args);
            resolved = JSON.parse(stdout);
            return stdout;
        }
        assert.deepEqual(args, [ "ps", "-q" ]);
        return "";
    });
    assert.equal(resolved?.services.web.image, "nginx:2");
    assert.ok(resolved?.services.web.ports.some(port => port.published === "8080"));
    assert.ok(resolved?.services.web.ports.some(port => port.published === "9000"));
    assert.deepEqual(result.conflicts, []);
    assert.deepEqual((await fs.readdir(root)).sort(), [ "global.env" ]);
});

test("real Compose keeps the project directory for relative include files and explicit project names", async t => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "compose-diagnostics-include-"));
    t.after(() => fs.rm(root, { recursive: true,
        force: true }));
    await fs.mkdir(path.join(root, "demo"));
    await fs.writeFile(path.join(root, "demo", "shared.yaml"), "services:\n  included:\n    image: busybox:stable\n");
    const server = { stacksDir: root } as DockgeServer;
    t.mock.method(Stack, "getStackList", async () => new Map());
    let model: { name: string;
        services: Record<string, unknown> } | undefined;
    await inspectComposeDraft(server, "demo", "name: actual-project\ninclude: [./shared.yaml]\nservices:\n  web:\n    image: nginx:1\n", "", "", true, async args => {
        if (args.includes("config")) {
            const { stdout } = await promisify(execFile)("docker", args);
            model = JSON.parse(stdout);
            return stdout;
        }
        return "";
    });
    assert.equal(model?.name, "actual-project");
    assert.ok(model?.services.included);
});

test("external diagnostics preserve registered project, extra env files and override chain", async t => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "compose-diagnostics-external-"));
    t.after(() => fs.rm(root, { recursive: true,
        force: true }));
    const files = [ path.join(root, "compose.yaml"), path.join(root, "second.yaml") ];
    await fs.writeFile(files[0], "services:\n  web:\n    image: nginx:1\n");
    await fs.writeFile(files[1], "services:\n  web:\n    image: nginx:${TAG}\n");
    const envFiles = [ path.join(root, "first.env"), path.join(root, "second.env") ];
    await fs.writeFile(envFiles[0], "TAG=1\n");
    await fs.writeFile(envFiles[1], "TAG=2\n");
    const server = { stacksDir: root } as DockgeServer;
    const stack = new Stack(server, "adopted", undefined, undefined, false, undefined, root, "actual-project", files, envFiles);
    t.mock.method(Stack, "getStack", async () => stack);
    t.mock.method(Stack, "getStackList", async () => new Map());
    const result = await inspectComposeDraft(server, "adopted", await fs.readFile(files[0], "utf8"), "TAG=3\n", "", false, async args => {
        if (args.includes("config")) {
            const { stdout } = await promisify(execFile)("docker", args);
            const model = JSON.parse(stdout);
            assert.equal(model.name, "actual-project");
            assert.equal(model.services.web.image, "nginx:2");
            return stdout;
        }
        if (args[0] === "ps") {
            return "fixture";
        }
        return JSON.stringify([{ Name: "/fixture",
            Config: { Image: "nginx:4",
                Labels: { "com.docker.compose.project": "actual-project",
                    "com.docker.compose.service": "web" } },
            NetworkSettings: {} }]);
    });
    assert.equal(result.drift[0].configured, "nginx:2");
    assert.deepEqual(result.drift[0].running, [ "nginx:4" ]);
    assert.equal(await fs.readFile(envFiles[0], "utf8"), "TAG=1\n");
    assert.equal(await fs.readFile(files[1], "utf8"), "services:\n  web:\n    image: nginx:${TAG}\n");
});

test("Compose errors never expose interpolated environment values", async t => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "compose-diagnostics-errors-"));
    t.after(() => fs.rm(root, { recursive: true,
        force: true }));
    await assert.rejects(inspectComposeDraft({ stacksDir: root } as DockgeServer, "demo",
        "services:\n  web:\n    image: nginx\n    ports: ['${SECRET}:80']\n", "SECRET=fixture-secret-never-returned\n", "", true),
    error => error instanceof Error && error.message === "composeDiagnostics.unavailable");
});
