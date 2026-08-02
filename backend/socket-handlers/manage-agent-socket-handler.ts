import { SocketHandler } from "../socket-handler.js";
import { DockgeServer } from "../dockge-server";
import { log } from "../log";
import { callbackError, callbackResult, checkLogin, DockgeSocket } from "../util-server";
import { LooseObject } from "../../common/util-common";
import { meshEndpoint, normalizeMeshSelf, synchronizeAgentMesh, upsertMeshPeers, validateMeshCatalogue } from "../agent-mesh";

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
        socket.on("validateAgentMeshPeer", (_requestData : unknown, callback : unknown) => {
            try {
                checkLogin(socket);
                callbackResult({ ok: true }, callback);
            } catch (e) {
                callbackError(e, callback);
            }
        });

        socket.on("applyAgentMesh", async (requestData : unknown, callback : unknown) => {
            try {
                checkLogin(socket);
                if (!requestData || typeof requestData !== "object") {
                    throw new Error("Data must be an object");
                }
                const data = requestData as LooseObject;
                const peers = validateMeshCatalogue(data.peers as unknown[]);
                await upsertMeshPeers(peers, socket.endpoint);
                callbackResult({ ok: true,
                    count: peers.length }, callback);
                setTimeout(() => server.disconnectAllSocketClients(undefined, socket.id), 100);
            } catch (e) {
                callbackError(e, callback);
            }
        });

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
                const self = normalizeMeshSelf(data.self);
                let manager = socket.instanceManager;
                await manager.test(data.url, data.username, data.password);
                await manager.add(data.url, data.username, data.password, displayName);

                try {
                    await synchronizeAgentMesh(self);
                } catch (error) {
                    await manager.remove(data.url);
                    throw error;
                }

                // connect to the agent
                manager.connect(data.url, data.username, data.password);

                // Refresh another sockets
                // It is a bit difficult to control another browser sessions to connect/disconnect agents, so force them to refresh the page will be easier.
                server.disconnectAllSocketClients(undefined, socket.id);
                manager.sendAgentList();

                callbackResult({
                    ok: true,
                    msg: "agentAddedAndFederated",
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
        socket.on("removeAgent", async (requestData : unknown, callback : unknown) => {
            try {
                log.debug("manage-agent-socket-handler", "removeAgent");
                checkLogin(socket);

                if (!requestData || typeof requestData !== "object") {
                    throw new Error("Data must be an object");
                }
                const data = requestData as LooseObject;
                if (typeof data.url !== "string") throw new Error("URL must be a string");
                const self = normalizeMeshSelf(data.self);

                let manager = socket.instanceManager;
                await synchronizeAgentMesh(self, meshEndpoint({ url: data.url,
                    username: "removed",
                    password: "removed",
                    displayName: "" }));
                await manager.remove(data.url);

                server.disconnectAllSocketClients(undefined, socket.id);
                manager.sendAgentList();

                callbackResult({
                    ok: true,
                    msg: "agentRemovedFromFederation",
                    msgi18n: true,
                }, callback);
            } catch (e) {
                callbackError(e, callback);
            }
        });
    }

}
