import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Stack } from "./stack";
import { Terminal } from "./terminal";
import type { DockgeServer } from "./dockge-server";
import type { DockgeSocket } from "./util-server";
import test from "node:test";
import { execFileSync } from "node:child_process";
import { resolveContainerShell, withShellCreation } from "./container-shell";
import { preferredContainerShell, validContainerShell, shellTerminalName } from "../common/container-shell";

test("shell preferences are single executable names or absolute paths, never command strings", () => {
    for (const value of [ "sh", "bash", "zsh", "/bin/ash", "/usr/local/bin/fish" ]) {
        assert.equal(validContainerShell(value), true);
    }
    for (const value of [ "-c", "bash -c id", "sh;id", "../bin/sh", "/bin/../sh", "", "\nsh", null ]) {
        assert.equal(validContainerShell(value), false);
    }
    assert.equal(preferredContainerShell(undefined), "sh");
    assert.equal(preferredContainerShell("bash"), "bash");
    assert.equal(preferredContainerShell("default"), "sh");
    assert.notEqual(shellTerminalName("same", "sh"), shellTerminalName("same", "bash"));
});

test("a missing shell falls back once, while Docker failures and a missing sh do not loop", async () => {
    const calls: string[] = [];
    assert.deepEqual(await resolveContainerShell("default", "zsh", async shell => {
        calls.push(shell);
        return { code: shell === "sh" ? 0 : 127 };
    }), { shell: "sh",
        fallback: true });
    assert.deepEqual(calls, [ "zsh", "sh" ]);
    for (const code of [ -1, 1, 125 ]) {
        calls.length = 0;
        await assert.rejects(resolveContainerShell("bash", "", async shell => {
            calls.push(shell);
            return { code,
                stderr: "Docker unavailable" };
        }), /unavailable/);
        assert.deepEqual(calls, [ "bash" ]);
    }
    calls.length = 0;
    await assert.rejects(resolveContainerShell("sh", "", async shell => {
        calls.push(shell);
        return { code: 127 };
    }), /unavailable/);
    assert.deepEqual(calls, [ "sh" ]);
    await assert.rejects(resolveContainerShell("sh -c id", "", async () => {
        throw new Error("must not run");
    }), /invalid/);
});

test("a real shell no-op confirms launch without executing any user command", async () => {
    const result = await resolveContainerShell("/bin/sh", "", async shell => {
        execFileSync(shell, [ "-c", "exit 0" ], { timeout: 3000 });
        return { code: 0 };
    });
    assert.deepEqual(result, { shell: "/bin/sh",
        fallback: false });
});

test("concurrent opens share preparation and an error releases the reservation", async () => {
    let release!: () => void;
    const barrier = new Promise<void>(resolve => {
        release = resolve;
    });
    let calls = 0;
    const create = async () => {
        calls++;
        await barrier;
        return "session";
    };
    const first = withShellCreation("same", create);
    const second = withShellCreation("same", create);
    await Promise.resolve();
    assert.equal(calls, 1);
    release();
    assert.deepEqual(await Promise.all([ first, second ]), [ "session", "session" ]);
    await assert.rejects(withShellCreation("failure", async () => {
        throw new Error("failed");
    }), /failed/);
    assert.equal(await withShellCreation("failure", async () => "recovered"), "recovered");
});

test("Stack opens real isolated PTYs with a missing-shell fallback and separate sessions", async () => {
    const root = mkdtempSync(join(tmpdir(), "dockge-shell-"));
    mkdirSync(join(root, "demo"));
    // A local executable fixture replaces Docker, never connects to a daemon.
    writeFileSync(join(root, "docker"), "#!/bin/sh\nfor arg do\n case \"$arg\" in\n bash) echo \"exec: bash: executable file not found\" >&2; exit 127;;\n sh) shift; break;;\n esac\n shift\ndone\nexec /bin/sh \"$@\"\n", { mode: 0o700 });
    const oldPath = process.env.PATH;
    process.env.PATH = root + ":" + oldPath;
    const stack = new Stack({ stacksDir: root } as DockgeServer, "demo", "services:\n  _app:\n    image: busybox\n", "", true);
    const commands: string[][] = [];
    const originalOptions = stack.getComposeOptions.bind(stack);
    stack.getComposeOptions = (command, ...args) => {
        commands.push([ command, ...args ]);
        return originalOptions(command, ...args);
    };
    const output: string[] = [];
    const socket = { id: "shell-fixture",
        endpoint: "linked",
        connected: true,
        emitAgent: (event: string, _name: string, text: string) => {
            if (event === "terminalWrite") {
                output.push(text);
            }
        } } as unknown as DockgeSocket;
    const terminals: Terminal[] = [];
    try {
        const first = await stack.joinContainerTerminal(socket, "_app", "bash", 0, true);
        assert.equal(first.shell, "sh");
        assert.equal(first.fallback, true);
        terminals.push(Terminal.getTerminal(first.terminalName)!);
        const second = await stack.joinContainerTerminal(socket, "_app", "sh", 0, true);
        terminals.push(Terminal.getTerminal(second.terminalName)!);
        assert.notEqual(first.terminalName, second.terminalName);
        assert.ok(terminals.every(terminal => terminal.ptyProcess));
        const reused = await stack.joinContainerTerminal(socket, "_app", "bash", 0, true);
        assert.equal(reused.terminalName, first.terminalName);
        assert.ok(commands.every(args => args.includes("--") && args[args.indexOf("--") + 1] === "_app"));
        for (const terminal of terminals) {
            const exit = new Promise<number>(resolve => terminal.onExit(resolve));
            terminal.ptyProcess!.write("printf 'SHELL_OK\\n'; exit\r");
            assert.equal(await exit, 0);
        }
        assert.match(output.join(""), /SHELL_OK/);
        assert.ok(terminals.every(terminal => !Terminal.getTerminal(terminal.name)));
    } finally {
        for (const terminal of terminals) {
            terminal.ptyProcess?.kill();
        }
        process.env.PATH = oldPath;
        rmSync(root, { recursive: true,
            force: true });
    }
});
