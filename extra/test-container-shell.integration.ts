// Opt-in test through Enhanced's real Stack API. Existing busybox image only.
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { promisify } from "node:util";
import { execFile } from "../backend/buffered-process";
import { Stack } from "../backend/stack";
import { Terminal } from "../backend/terminal";
import type { DockgeServer } from "../backend/dockge-server";
import type { DockgeSocket } from "../backend/util-server";

if (process.env.DOCKGE_SHELL_TEST !== "1") {
    throw new Error("Explicit DOCKGE_SHELL_TEST=1 required");
}
const exec = promisify(execFile);
await exec("docker", [ "image", "inspect", "--format", "{{.Id}}", "busybox:stable" ]);
const root = await mkdtemp(join(tmpdir(), "enhanced-shell-test-"));
const stacksDir = join(root, "stacks");
await mkdir(stacksDir);
const name = "enhanced-shell-" + randomBytes(5).toString("hex");
const server = { stacksDir,
    config: { dataDir: join(root, "data") } } as DockgeServer;
const stack = new Stack(server, name, "services:\n  _app:\n    image: busybox:stable\n    pull_policy: never\n    command: [sleep, '3600']\n    stop_grace_period: 1s\n", "", true);
const output: string[] = [];
const socket = { id: name,
    endpoint: "",
    connected: true,
    emitAgent: (event: string, _name: string, text: string) => {
        if (event === "terminalWrite") {
            output.push(text);
        }
    } } as unknown as DockgeSocket;
let terminal: Terminal | undefined;
try {
    await stack.save(true);
    await stack.start(socket);
    const result = await stack.joinContainerTerminal(socket, "_app", "bash", 0, true);
    assert.equal(result.shell, "sh");
    assert.equal(result.fallback, true);
    terminal = Terminal.getTerminal(result.terminalName);
    assert.ok(terminal?.ptyProcess);
    const exited = new Promise<number>(resolve => terminal!.onExit(resolve));
    terminal.ptyProcess.write("printf 'REAL_SHELL_OK\\n'; exit\r");
    assert.equal(await exited, 0);
    assert.match(output.join(""), /REAL_SHELL_OK/);
    console.log("PASS real Compose _app service: missing bash, fallback sh, interactive PTY command");
} finally {
    terminal?.ptyProcess?.kill();
    await exec("docker", stack.getComposeOptions("down", "--remove-orphans"), { cwd: stack.path,
        timeout: 45000 });
    await rm(root, { recursive: true,
        force: true });
    console.log("PASS shell fixture containers, network and data removed; existing image retained");
}
