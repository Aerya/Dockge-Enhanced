import { AgentSocketHandler } from "../agent-socket-handler";
import { AgentSocket } from "../../common/agent-socket";
import { DockgeServer } from "../dockge-server";
import { callbackError, callbackResult, checkLogin, DockgeSocket, ValidationError } from "../util-server";
import { AuditLogger } from "../audit-log";
import {
    analyzeStackTransfer,
    getPathRules,
    importStackTransfer,
    listTransferJobs,
    preflightStackTransfer,
    restoreStackTransferSource,
    setPathRules,
    StackTransferRequest,
    updateTransferJob,
} from "../transfers/stack-transfer";
import {
    completeStackTransferDataSource,
    createStackTransferDataSnapshot,
    finalizeStackTransferDataSource,
    finalizeStackTransferDataTarget,
    getStackTransferDataCapabilities,
    rollbackStackTransferDataTarget,
    StackTransferDataSnapshotRequest,
    StackTransferDataTargetRequest,
    stageStackTransferDataTarget,
} from "../transfers/stack-data-transfer";

function requireObject(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new ValidationError("Data must be an object");
    }
    return value as Record<string, unknown>;
}

function requireTransferRequest(value: unknown): StackTransferRequest {
    const request = requireObject(value);
    if (![ "copy", "move" ].includes(String(request.operation))) {
        throw new ValidationError("Invalid transfer operation");
    }
    for (const field of [ "sourceEndpoint", "sourceStackName", "targetName", "composeYAML", "composeENV", "composeOverrideYAML" ]) {
        if (typeof request[field] !== "string") {
            throw new ValidationError(`${field} must be a string`);
        }
    }
    if (!Array.isArray(request.mappings)) {
        throw new ValidationError("mappings must be an array");
    }
    for (const rawMapping of request.mappings) {
        const mapping = requireObject(rawMapping);
        for (const field of [ "id", "service", "type", "source", "target", "targetSource", "confidence", "reason" ]) {
            if (typeof mapping[field] !== "string") {
                throw new ValidationError(`mapping.${field} must be a string`);
            }
        }
        if (![ "bind", "volume", "tmpfs", "unknown" ].includes(String(mapping.type))) {
            throw new ValidationError("Invalid mapping type");
        }
        if (typeof mapping.readOnly !== "boolean" || typeof mapping.external !== "boolean") {
            throw new ValidationError("Invalid mapping flags");
        }
        if (mapping.size !== null && typeof mapping.size !== "number") {
            throw new ValidationError("Invalid mapping size");
        }
        if (mapping.transferData !== undefined && typeof mapping.transferData !== "boolean") {
            throw new ValidationError("Invalid data transfer selection");
        }
    }
    if (typeof request.deploy !== "boolean") {
        throw new ValidationError("deploy must be a boolean");
    }
    if (request.dataTransfer !== undefined && typeof request.dataTransfer !== "boolean") {
        throw new ValidationError("dataTransfer must be a boolean");
    }
    return request as unknown as StackTransferRequest;
}

function requireDataSnapshotRequest(value: unknown): StackTransferDataSnapshotRequest {
    const raw = requireObject(value);
    for (const field of [ "transferId", "stackName", "repositoryId", "phase" ]) {
        if (typeof raw[field] !== "string") {
            throw new ValidationError(`${field} must be a string`);
        }
    }
    if (raw.phase !== "copy" && raw.phase !== "initial") {
        throw new ValidationError("Invalid data snapshot phase");
    }
    const policy = requireObject(raw.policy);
    if (![ "hot", "stop", "hooks" ].includes(String(policy.mode))) {
        throw new ValidationError("Invalid consistency mode");
    }
    const transfer = requireTransferRequest({
        operation: "copy",
        sourceEndpoint: "validation",
        sourceStackName: raw.stackName,
        targetName: "validation",
        composeYAML: "",
        composeENV: "",
        composeOverrideYAML: "",
        mappings: raw.mappings,
        deploy: false,
    });
    return { ...raw,
        mappings: transfer.mappings } as unknown as StackTransferDataSnapshotRequest;
}

function requireDataTargetRequest(value: unknown): StackTransferDataTargetRequest {
    const raw = requireObject(value);
    for (const field of [ "transferId", "repositoryId", "snapshotId" ]) {
        if (typeof raw[field] !== "string") {
            throw new ValidationError(`${field} must be a string`);
        }
    }
    return { ...raw,
        transfer: requireTransferRequest(raw.transfer) } as unknown as StackTransferDataTargetRequest;
}

export class StackTransferSocketHandler extends AgentSocketHandler {
    create(socket: DockgeSocket, server: DockgeServer, agentSocket: AgentSocket): void {
        agentSocket.on("analyzeStackTransfer", async (stackName: unknown, sourceEndpoint: unknown, callback: unknown) => {
            try {
                checkLogin(socket);
                if (typeof stackName !== "string" || typeof sourceEndpoint !== "string") {
                    throw new ValidationError("Invalid stack transfer analysis request");
                }
                const rules = await getPathRules(sourceEndpoint);
                callbackResult({ ok: true,
                    data: await analyzeStackTransfer(server, stackName, rules) }, callback);
            } catch (error) {
                callbackError(error, callback);
            }
        });

        agentSocket.on("getStackTransferPathRules", async (sourceEndpoint: unknown, callback: unknown) => {
            try {
                checkLogin(socket);
                if (typeof sourceEndpoint !== "string") {
                    throw new ValidationError("sourceEndpoint must be a string");
                }
                callbackResult({ ok: true,
                    data: await getPathRules(sourceEndpoint) }, callback);
            } catch (error) {
                callbackError(error, callback);
            }
        });

        agentSocket.on("getStackTransferDataCapabilities", async (stackName: unknown, callback: unknown) => {
            try {
                checkLogin(socket);
                if (typeof stackName !== "string") {
                    throw new ValidationError("Stack name must be a string");
                }
                callbackResult({ ok: true,
                    data: await getStackTransferDataCapabilities(stackName) }, callback);
            } catch (error) {
                callbackError(error, callback);
            }
        });

        agentSocket.on("createStackTransferDataSnapshot", async (rawRequest: unknown, callback: unknown) => {
            try {
                checkLogin(socket);
                callbackResult({ ok: true,
                    data: await createStackTransferDataSnapshot(server, requireDataSnapshotRequest(rawRequest)) }, callback);
            } catch (error) {
                callbackError(error, callback);
            }
        });

        agentSocket.on("finalizeStackTransferDataSource", async (transferId: unknown, callback: unknown) => {
            try {
                checkLogin(socket);
                if (typeof transferId !== "string") {
                    throw new ValidationError("Invalid transfer id");
                }
                callbackResult({ ok: true,
                    data: await finalizeStackTransferDataSource(server, transferId) }, callback);
            } catch (error) {
                callbackError(error, callback);
            }
        });

        agentSocket.on("completeStackTransferDataSource", async (transferId: unknown, success: unknown, callback: unknown) => {
            try {
                checkLogin(socket);
                if (typeof transferId !== "string" || typeof success !== "boolean") {
                    throw new ValidationError("Invalid source completion request");
                }
                callbackResult({ ok: true,
                    data: await completeStackTransferDataSource(server, transferId, success) }, callback);
            } catch (error) {
                callbackError(error, callback);
            }
        });

        agentSocket.on("stageStackTransferDataTarget", async (rawRequest: unknown, callback: unknown) => {
            try {
                checkLogin(socket);
                const request = requireDataTargetRequest(rawRequest);
                const result = await stageStackTransferDataTarget(server, socket, request);
                if (request.transfer.operation === "copy") {
                    await AuditLogger.getInstance().logFromSocket(socket, {
                        action: "stack.transfer.copy-data",
                        category: "stack",
                        targetType: "stack",
                        target: request.transfer.targetName,
                        status: "success",
                        metadata: { sourceEndpoint: request.transfer.sourceEndpoint,
                            sourceStackName: request.transfer.sourceStackName,
                            jobId: result.jobId },
                    }).catch(() => {});
                }
                callbackResult({ ok: true,
                    data: result }, callback);
                server.sendStackList();
            } catch (error) {
                callbackError(error, callback);
            }
        });

        agentSocket.on("finalizeStackTransferDataTarget", async (rawRequest: unknown, jobId: unknown, callback: unknown) => {
            try {
                checkLogin(socket);
                if (typeof jobId !== "string") {
                    throw new ValidationError("Invalid target job id");
                }
                const request = requireDataTargetRequest(rawRequest);
                await finalizeStackTransferDataTarget(server, socket, request, jobId);
                await AuditLogger.getInstance().logFromSocket(socket, {
                    action: "stack.transfer.move-data",
                    category: "stack",
                    targetType: "stack",
                    target: request.transfer.targetName,
                    status: "success",
                    metadata: { sourceEndpoint: request.transfer.sourceEndpoint,
                        sourceStackName: request.transfer.sourceStackName,
                        jobId },
                }).catch(() => {});
                callbackResult({ ok: true }, callback);
                server.sendStackList();
            } catch (error) {
                callbackError(error, callback);
            }
        });

        agentSocket.on("rollbackStackTransferDataTarget", async (targetName: unknown, jobId: unknown, callback: unknown) => {
            try {
                checkLogin(socket);
                if (typeof targetName !== "string" || typeof jobId !== "string") {
                    throw new ValidationError("Invalid target rollback request");
                }
                await rollbackStackTransferDataTarget(server, targetName, jobId);
                callbackResult({ ok: true }, callback);
                server.sendStackList();
            } catch (error) {
                callbackError(error, callback);
            }
        });

        agentSocket.on("setStackTransferPathRules", async (sourceEndpoint: unknown, rules: unknown, callback: unknown) => {
            try {
                checkLogin(socket);
                if (typeof sourceEndpoint !== "string") {
                    throw new ValidationError("sourceEndpoint must be a string");
                }
                callbackResult({ ok: true,
                    data: await setPathRules(sourceEndpoint, rules),
                    msg: "Saved",
                    msgi18n: true }, callback);
            } catch (error) {
                callbackError(error, callback);
            }
        });

        agentSocket.on("preflightStackTransfer", async (rawRequest: unknown, callback: unknown) => {
            try {
                checkLogin(socket);
                callbackResult({ ok: true,
                    data: await preflightStackTransfer(server, requireTransferRequest(rawRequest)) }, callback);
            } catch (error) {
                callbackError(error, callback);
            }
        });

        agentSocket.on("restoreStackTransferSource", async (stackName: unknown, services: unknown, callback: unknown) => {
            try {
                checkLogin(socket);
                if (typeof stackName !== "string" || !Array.isArray(services) || services.some(service => typeof service !== "string")) {
                    throw new ValidationError("Invalid source restore request");
                }
                await restoreStackTransferSource(server, stackName, services as string[]);
                server.sendStackList();
                callbackResult({ ok: true,
                    msg: "Started",
                    msgi18n: true }, callback);
            } catch (error) {
                callbackError(error, callback);
            }
        });

        agentSocket.on("importStackTransfer", async (rawRequest: unknown, callback: unknown) => {
            try {
                checkLogin(socket);
                const request = requireTransferRequest(rawRequest);
                const result = await importStackTransfer(server, socket, request);
                await AuditLogger.getInstance().logFromSocket(socket, {
                    action: `stack.transfer.${request.operation}`,
                    category: "stack",
                    targetType: "stack",
                    target: request.targetName,
                    status: "success",
                    metadata: { sourceEndpoint: request.sourceEndpoint,
                        sourceStackName: request.sourceStackName,
                        deploy: request.deploy,
                        jobId: result.job.id },
                });
                server.sendStackList();
                callbackResult({ ok: true,
                    data: result,
                    msg: request.operation === "copy" ? "stackCopiedSuccessfully" : "stackTransferTargetReady",
                    msgi18n: true }, callback);
            } catch (error) {
                callbackError(error, callback);
            }
        });

        agentSocket.on("completeStackTransferJob", async (jobId: unknown, success: unknown, errorMessage: unknown, callback: unknown) => {
            try {
                checkLogin(socket);
                if (typeof jobId !== "string" || typeof success !== "boolean") {
                    throw new ValidationError("Invalid job completion request");
                }
                const job = await updateTransferJob(jobId, {
                    status: success ? "succeeded" : "rolled-back",
                    phase: success ? "completed" : "source-stop-failed",
                    error: typeof errorMessage === "string" && errorMessage ? errorMessage : undefined,
                });
                if (!job) {
                    throw new ValidationError("Transfer job not found");
                }
                callbackResult({ ok: true,
                    data: job }, callback);
            } catch (error) {
                callbackError(error, callback);
            }
        });

        agentSocket.on("listStackTransferJobs", async (callback: unknown) => {
            try {
                checkLogin(socket);
                callbackResult({ ok: true,
                    data: await listTransferJobs() }, callback);
            } catch (error) {
                callbackError(error, callback);
            }
        });
    }
}
