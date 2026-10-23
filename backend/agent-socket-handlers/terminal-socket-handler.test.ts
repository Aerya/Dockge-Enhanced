import assert from "node:assert/strict";
import test, { mock } from "node:test";
import { AgentSocket } from "../../common/agent-socket";
import { Terminal, InteractiveTerminal } from "../terminal";
import type { DockgeSocket } from "../util-server";
import type { DockgeServer } from "../dockge-server";
import { TerminalSocketHandler } from "./terminal-socket-handler";

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
