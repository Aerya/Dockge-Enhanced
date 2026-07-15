import { SocketHandler } from "../socket-handler.js";
import { DockgeServer } from "../dockge-server";
import { log } from "../log";
import { callbackError, callbackResult, checkLogin, DockgeSocket } from "../util-server";
import { LooseObject } from "../../common/util-common";

export function normalizeAgentDisplayName(value: unknown): string {
    if (value === undefined || value === null) return "";
    if (typeof value !== "string") {
        throw new Error("Display name must be a string");
    }
    const displayName = value.trim();
    if (displayName.length > 100) {
        throw new Error("Display name must not exceed 100 characters");
    }
    return displayName;
}

export class ManageAgentSocketHandler extends SocketHandler {

    create(socket : DockgeSocket, server : DockgeServer) {
        // addAgent
        socket.on("addAgent", async (requestData : unknown, callback : unknown) => {
            try {
                log.debug("manage-agent-socket-handler", "addAgent");
                checkLogin(socket);

                if (typeof(requestData) !== "object") {
                    throw new Error("Data must be an object");
                }

                let data = requestData as LooseObject;
                const displayName = normalizeAgentDisplayName(data.displayName);
                let manager = socket.instanceManager;
                await manager.test(data.url, data.username, data.password);
                await manager.add(data.url, data.username, data.password, displayName);

                // connect to the agent
                manager.connect(data.url, data.username, data.password);

                // Refresh another sockets
                // It is a bit difficult to control another browser sessions to connect/disconnect agents, so force them to refresh the page will be easier.
                server.disconnectAllSocketClients(undefined, socket.id);
                manager.sendAgentList();

                callbackResult({
                    ok: true,
                    msg: "agentAddedSuccessfully",
                    msgi18n: true,
                }, callback);

            } catch (e) {
                callbackError(e, callback);
            }
        });

        socket.on("renameAgent", async (requestData : unknown, callback : unknown) => {
            try {
                log.debug("manage-agent-socket-handler", "renameAgent");
                checkLogin(socket);
                if (!requestData || typeof requestData !== "object") {
                    throw new Error("Data must be an object");
                }
                const data = requestData as LooseObject;
                if (typeof data.url !== "string") {
                    throw new Error("URL must be a string");
                }
                const displayName = normalizeAgentDisplayName(data.displayName);
                await socket.instanceManager.rename(data.url, displayName);

                server.disconnectAllSocketClients(undefined, socket.id);
                await socket.instanceManager.sendAgentList();
                callbackResult({
                    ok: true,
                    msg: "agentRenamedSuccessfully",
                    msgi18n: true,
                }, callback);
            } catch (e) {
                callbackError(e, callback);
            }
        });

        // removeAgent
        socket.on("removeAgent", async (url : unknown, callback : unknown) => {
            try {
                log.debug("manage-agent-socket-handler", "removeAgent");
                checkLogin(socket);

                if (typeof(url) !== "string") {
                    throw new Error("URL must be a string");
                }

                let manager = socket.instanceManager;
                await manager.remove(url);

                server.disconnectAllSocketClients(undefined, socket.id);
                manager.sendAgentList();

                callbackResult({
                    ok: true,
                    msg: "agentRemovedSuccessfully",
                    msgi18n: true,
                }, callback);
            } catch (e) {
                callbackError(e, callback);
            }
        });
    }

}
