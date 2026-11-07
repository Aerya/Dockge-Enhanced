import assert from "node:assert/strict";
import test, { mock } from "node:test";
import { AgentSocket } from "../../common/agent-socket";
import { Terminal, InteractiveTerminal } from "../terminal";
import type { DockgeSocket } from "../util-server";
import type { DockgeServer } from "../dockge-server";
import { TerminalSocketHandler } from "./terminal-socket-handler";
import { Stack } from "../stack";

test("terminal input acknowledges successful writes and rejects unauthenticated writes", async () => {
    const commands: string[] = [];
    const terminal = Object.create(InteractiveTerminal.prototype) as InteractiveTerminal;
    terminal.write = command => {
        commands.push(command);
    };
    mock.method(Terminal, "getTerminal", () => terminal);
    try {
        const socket = { userID: 1 } as DockgeSocket;
        const agent = new AgentSocket();
        new TerminalSocketHandler().create(socket, {} as DockgeServer, agent);
        const send = () => new Promise<{ ok: boolean }>(resolve => agent.call("terminalInput", "terminal", "hello", resolve));
        assert.equal((await send()).ok, true);
        assert.deepEqual(commands, [ "hello" ]);
        socket.userID = 0;
        assert.equal((await send()).ok, false);
        assert.deepEqual(commands, [ "hello" ]);
    } finally {
        mock.restoreAll();
    }
});

test("container terminal acknowledgements wait for launch and report asynchronous failures", async () => {
    const socket = { userID: 1 } as DockgeSocket;
    const agent = new AgentSocket();
    new TerminalSocketHandler().create(socket, {} as DockgeServer, agent);
    let release!: () => void;
    const barrier = new Promise<void>(resolve => {
        release = resolve;
    });
    mock.method(Stack, "getStack", async () => ({
        joinContainerTerminal: async (_socket: unknown, _service: unknown, _shell: unknown, _index: unknown, separate: boolean) => {
            await barrier;
            if (!separate) {
                throw new Error("containerShell.unavailable");
            }
            return { terminalName: "isolated-shell",
                shell: "sh",
                fallback: true };
        },
    }));
    try {
        let acknowledged = false;
        const send = (event: string) => new Promise<{ ok: boolean;
            shell?: string }>(resolve => agent.call(event, "demo", "app", "default", (result: { ok: boolean;
            shell?: string }) => {
            acknowledged = true;
            resolve(result);
        }));
        const pending = send("interactiveTerminalV2");
        await Promise.resolve();
        await Promise.resolve();
        assert.equal(acknowledged, false);
        release();
        assert.deepEqual(await pending, { ok: true,
            terminalName: "isolated-shell",
            shell: "sh",
            fallback: true });
        assert.equal((await send("interactiveTerminal")).ok, false);
        socket.userID = 0;
        assert.equal((await send("interactiveTerminalV2")).ok, false);
    } finally {
        mock.restoreAll();
    }
});
