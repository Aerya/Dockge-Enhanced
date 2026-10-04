import test from "node:test";
import assert from "node:assert/strict";
import { DockgeServer } from "./dockge-server";

test("agent-list refresh disconnects browsers but preserves federation sockets", () => {
    const calls: string[] = [];
    const socket = (id: string, endpoint = "") => ({
        id,
        endpoint,
        emit: (event: string) => calls.push(`${id}:${event}`),
        disconnect: () => calls.push(`${id}:disconnect`),
    });
    const server = Object.create(DockgeServer.prototype) as DockgeServer;
    server.io = {
        sockets: {
            sockets: new Map([
                [ "current", socket("current") ],
                [ "browser", socket("browser") ],
                [ "agent", socket("agent", "enhanced-b:5001") ],
            ]),
        },
    } as unknown as DockgeServer["io"];

    server.refreshBrowserSocketClients("current");

    assert.deepEqual(calls, [ "browser:refresh", "browser:disconnect" ]);

    calls.length = 0;
    server.disconnectAllSocketClients(undefined, "current");
    assert.deepEqual(calls, [
        "browser:refresh", "browser:disconnect",
        "agent:refresh", "agent:disconnect",
    ]);
});
