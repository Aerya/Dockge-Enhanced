import { SocketHandler } from "../socket-handler";
import { DockgeServer } from "../dockge-server";
import { callbackError, callbackResult, checkLogin, DockgeSocket, ValidationError } from "../util-server";
import { StackReplicationInput, StackReplicationManager } from "../watchers/stack-replication-manager";

function requireId(value: unknown): string {
    if (typeof value !== "string" || !/^[a-zA-Z0-9_-]{8,128}$/.test(value)) {
        throw new ValidationError("Invalid replication id");
    }
    return value;
}

export class StackReplicationSocketHandler extends SocketHandler {
    create(socket: DockgeSocket, _server: DockgeServer): void {
        const manager = StackReplicationManager.getInstance();

        socket.on("listStackReplications", async (sourceEndpoint: unknown, sourceStackName: unknown, callback: unknown) => {
            try {
                checkLogin(socket);
                if (typeof sourceEndpoint !== "string" || typeof sourceStackName !== "string") {
                    throw new ValidationError("Invalid replication source");
                }
                callbackResult({ ok: true,
                    data: await manager.list(sourceEndpoint, sourceStackName) }, callback);
            } catch (error) {
                callbackError(error, callback);
            }
        });

        socket.on("saveStackReplication", async (value: unknown, callback: unknown) => {
            try {
                checkLogin(socket);
                if (!value || typeof value !== "object" || Array.isArray(value)) {
                    throw new ValidationError("Invalid replication policy");
                }
                callbackResult({ ok: true,
                    data: await manager.save(value as StackReplicationInput) }, callback);
            } catch (error) {
                callbackError(error, callback);
            }
        });

        socket.on("runStackReplication", async (id: unknown, callback: unknown) => {
            try {
                checkLogin(socket);
                callbackResult({ ok: true,
                    data: await manager.run(requireId(id)) }, callback);
            } catch (error) {
                callbackError(error, callback);
            }
        });

        socket.on("activateStackReplication", async (id: unknown, confirmed: unknown, callback: unknown) => {
            try {
                checkLogin(socket);
                if (confirmed !== true) {
                    throw new ValidationError("Replica activation must be explicitly confirmed");
                }
                callbackResult({ ok: true,
                    data: await manager.activate(requireId(id)) }, callback);
            } catch (error) {
                callbackError(error, callback);
            }
        });

        socket.on("testStackReplicationRecovery", async (id: unknown, callback: unknown) => {
            try {
                checkLogin(socket);
                callbackResult({ ok: true,
                    data: await manager.testRecovery(requireId(id)) }, callback);
            } catch (error) {
                callbackError(error, callback);
            }
        });

        socket.on("deleteStackReplication", async (id: unknown, callback: unknown) => {
            try {
                checkLogin(socket);
                await manager.remove(requireId(id));
                callbackResult({ ok: true }, callback);
            } catch (error) {
                callbackError(error, callback);
            }
        });
    }
}
