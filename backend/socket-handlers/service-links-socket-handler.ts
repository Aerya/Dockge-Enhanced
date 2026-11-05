import { SocketHandler } from "../socket-handler";
import { DockgeServer } from "../dockge-server";
import { callbackError, checkLogin, type DockgeSocket } from "../util-server";
import { loadUserAccess } from "../user-access";
import { Settings } from "../settings";
import { ServiceLinksStore } from "../service-links";

export async function authorizeServiceLinks(socket: DockgeSocket): Promise<void> {
    checkLogin(socket);
    if ((await loadUserAccess(socket.userID)).role !== "admin") {
        throw new Error("access.denied");
    }
}

export class ServiceLinksSocketHandler extends SocketHandler {
    private store = new ServiceLinksStore(() => Settings.get("serviceLinks"), value => Settings.set("serviceLinks", value));
    create(socket: DockgeSocket, _server: DockgeServer) {
        socket.on("serviceLinks:get", async callback => {
            try {
                await authorizeServiceLinks(socket);
                callback({ ok: true,
                    config: await this.store.load() });
            } catch (error) {
                callbackError(error, callback);
            }
        });
        socket.on("serviceLinks:save", async (value: unknown, callback) => {
            try {
                await authorizeServiceLinks(socket);
                callback({ ok: true,
                    config: await this.store.save(value) });
            } catch (error) {
                callbackError(error, callback);
            }
        });
    }
}
