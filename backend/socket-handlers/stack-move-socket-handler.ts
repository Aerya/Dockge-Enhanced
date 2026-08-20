import { SocketHandler } from "../socket-handler";
import { DockgeServer } from "../dockge-server";
import { callbackError, callbackResult, checkLogin, DockgeSocket, ValidationError } from "../util-server";
import { PendingStackMoveInput, StackMoveManager } from "../watchers/stack-move-manager";
import {
    createRegistryCredentialTransferKey,
    exportRegistryCredentialEnvelope,
    importRegistryCredentialEnvelope,
    RegistryCredentialEnvelope,
    RegistryCredentialTransferKey,
} from "../transfers/registry-credential-transfer";
import { AuditLogger } from "../audit-log";

interface AgentResponse<T> {
    ok: boolean;
    data?: T;
    msg?: string;
}

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
        socket.on("transferStackRegistryCredential", async (sourceEndpoint: unknown, targetEndpoint: unknown, registry: unknown, callback: unknown) => {
            try {
                checkLogin(socket);
                if (typeof sourceEndpoint !== "string" || typeof targetEndpoint !== "string" || typeof registry !== "string" || sourceEndpoint === targetEndpoint) {
                    throw new ValidationError("Invalid registry credential transfer");
                }
                const key = targetEndpoint
                    ? await socket.instanceManager.requestEndpoint<AgentResponse<RegistryCredentialTransferKey>>(targetEndpoint, "createStackRegistryCredentialTransfer")
                    : { ok: true,
                        data: createRegistryCredentialTransferKey() };
                if (!key.ok || !key.data) {
                    throw new Error(key.msg || "Target could not prepare registry credential transfer");
                }
                const envelope = sourceEndpoint
                    ? await socket.instanceManager.requestEndpoint<AgentResponse<RegistryCredentialEnvelope>>(sourceEndpoint, "exportStackRegistryCredential", registry, key.data)
                    : { ok: true,
                        data: exportRegistryCredentialEnvelope(registry, key.data) };
                if (!envelope.ok || !envelope.data) {
                    throw new Error(envelope.msg || "Source could not export registry credential");
                }
                const imported = targetEndpoint
                    ? await socket.instanceManager.requestEndpoint<AgentResponse<{ registry: string }>>(targetEndpoint, "importStackRegistryCredential", envelope.data)
                    : { ok: true,
                        data: { registry: await importRegistryCredentialEnvelope(envelope.data) } };
                if (!imported.ok) {
                    throw new Error(imported.msg || "Target could not import registry credential");
                }
                await AuditLogger.getInstance().logFromSocket(socket, {
                    action: "stack.transfer.registry-credential",
                    category: "stack",
                    targetType: "registry",
                    target: registry,
                    status: "success",
                    metadata: { sourceEndpoint,
                        targetEndpoint },
                });
                callbackResult({ ok: true,
                    data: imported.data }, callback);
            } catch (error) {
                callbackError(error, callback);
            }
        });
    }
}
