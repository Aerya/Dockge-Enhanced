import { R } from "redbean-node";
import { SocketHandler } from "../socket-handler";
import type { DockgeServer } from "../dockge-server";
import { checkLogin, type DockgeSocket } from "../util-server";
import { loadUserAccess } from "../user-access";
import { StackGroupPreferencesStore } from "../stack-group-preferences";

export async function authorizeStackGroups(socket: DockgeSocket): Promise<number> {
    checkLogin(socket);
    if (socket.endpoint || socket.federationAuthenticated || (await loadUserAccess(socket.userID)).role !== "admin") {
        throw new Error("access.denied");
    }
    return socket.userID;
}

export class StackGroupsSocketHandler extends SocketHandler {
    create(socket: DockgeSocket, server: DockgeServer) {
        const respond = async (callback: unknown, action: () => Promise<unknown>) => {
            if (typeof callback !== "function") {
                return;
            }
            try {
                callback({ ok: true,
                    config: await action() });
            } catch (error) {
                const message = error instanceof Error ? error.message : "";
                callback({ ok: false,
                    msg: [ "stackGroups.conflict", "stackGroups.invalid", "access.denied" ].includes(message) ? message : "stackGroups.storageError" });
            }
        };
        socket.on("stackGroups:get", callback => respond(callback, async () => {
            const id = await authorizeStackGroups(socket);
            return new StackGroupPreferencesStore(R.knex).load(id);
        }));
        socket.on("stackGroups:save", (input, callback) => respond(callback, async () => {
            const id = await authorizeStackGroups(socket);
            const result = await new StackGroupPreferencesStore(R.knex).save(id, input);
            // Invalidation only, never send group contents to other accounts or agents.
            for (const client of server.io.sockets.sockets.values()) {
                const target = client as DockgeSocket;
                if (target.id !== socket.id && target.userID === id && !target.endpoint && !target.federationAuthenticated) {
                    target.emit("stackGroups:changed");
                }
            }
            return result;
        }));
    }
}
