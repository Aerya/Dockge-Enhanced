import { SocketHandler } from "../socket-handler";
import { DockgeServer } from "../dockge-server";
import { callbackError, callbackResult, checkLogin, DockgeSocket, ValidationError } from "../util-server";
import { PendingStackMoveInput, StackMoveManager } from "../watchers/stack-move-manager";

export class StackMoveSocketHandler extends SocketHandler {
    create(socket: DockgeSocket, _server: DockgeServer): void {
        const manager = StackMoveManager.getInstance();
        socket.on("listPendingStackMoves", async (sourceEndpoint: unknown, sourceStackName: unknown, callback: unknown) => {
            try {
                checkLogin(socket);
                if (typeof sourceEndpoint !== "string" || typeof sourceStackName !== "string") throw new ValidationError("Invalid stack move source");
                callbackResult({ ok: true,
                    data: await manager.list(sourceEndpoint, sourceStackName) }, callback);
            } catch (error) { callbackError(error, callback); }
        });
        socket.on("savePendingStackMove", async (value: unknown, callback: unknown) => {
            try {
                checkLogin(socket);
                if (!value || typeof value !== "object" || Array.isArray(value)) throw new ValidationError("Invalid stack move");
                callbackResult({ ok: true,
                    data: await manager.save(value as PendingStackMoveInput) }, callback);
            } catch (error) { callbackError(error, callback); }
        });
        socket.on("completePendingStackMove", async (id: unknown, status: unknown, callback: unknown) => {
            try {
                checkLogin(socket);
                if (typeof id !== "string" || (status !== "finalized" && status !== "rolled-back")) throw new ValidationError("Invalid stack move completion");
                callbackResult({ ok: true,
                    data: await manager.complete(id, status) }, callback);
            } catch (error) { callbackError(error, callback); }
        });
    }
}
