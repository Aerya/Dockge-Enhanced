import { R } from "redbean-node";
import { SocketHandler } from "../socket-handler";
import type { DockgeServer } from "../dockge-server";
import type { DockgeSocket } from "../util-server";
import { authorizeStackGroups } from "./stack-groups-socket-handler";
import { UiPreferencesStore } from "../ui-preferences";

export class UiPreferencesSocketHandler extends SocketHandler {
    create(socket: DockgeSocket, server: DockgeServer) {
        const respond = async (callback: unknown, input?: unknown) => {
            if (typeof callback !== "function") {
                return;
            }
            try {
                const id = await authorizeStackGroups(socket);
                const store = new UiPreferencesStore(R.knex);
                const config = input === undefined ? await store.load(id) : await store.save(id, input);
                callback({ ok: true,
                    config });
                if (input !== undefined) {
                    for (const client of server.io.sockets.sockets.values()) {
                        const target = client as DockgeSocket;
                        if (target.id !== socket.id && target.userID === id && !target.endpoint && !target.federationAuthenticated) {
                            target.emit("uiPreferences:changed");
                        }
                    }
                }
            } catch (error) {
                const message = error instanceof Error ? error.message : "";
                callback({ ok: false,
                    msg: [ "uiPreferences.conflict", "uiPreferences.invalid", "access.denied" ].includes(message) ? message : "uiPreferences.unavailable" });
            }
        };
        socket.on("uiPreferences:get", callback => respond(callback));
        socket.on("uiPreferences:save", (input, callback) => respond(callback, input ?? null));
    }
}
