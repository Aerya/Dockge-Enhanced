import { readContainerFiles } from "../container-files";
import { Stack } from "../stack";
import { loadUserAccess } from "../user-access";
import {
    checkLogin,
    callbackError,
    callbackResult,
    type DockgeSocket,
} from "../util-server";
import type { AgentSocket } from "../../common/agent-socket";
import type { DockgeServer } from "../dockge-server";

export function registerContainerFiles(
    server: DockgeServer,
    socket: DockgeSocket,
    agent: AgentSocket,
) {
    let busy = false;
    agent.on("containerFilesRead", async (request, callback) => {
        try {
            const input = (request && typeof request === "object" ? request : {}) as Record<string, unknown>;
            checkLogin(socket);
            if ((await loadUserAccess(socket.userID)).role !== "admin") {
                throw new Error("Permission denied");
            }
            if (!input || typeof input.stack !== "string" || busy) {
                throw new Error("containerFiles.unavailable");
            }
            busy = true;
            try {
                const stack = await Stack.getStack(server, input.stack);
                const data = await readContainerFiles(
                    (id) => stack.getContainerInstance(id),
                    input.id,
                    input.path,
                    input.action,
                );
                callbackResult({ ok: true,
                    data }, callback);
            } finally {
                busy = false;
            }
        } catch (error) {
            callbackError(error, callback);
        }
    });
}
