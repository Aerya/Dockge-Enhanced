import { AgentSocketHandler } from "../agent-socket-handler";
import { DockgeServer } from "../dockge-server";
import { callbackError, callbackResult, checkLogin, DockgeSocket, ValidationError } from "../util-server";
import { Stack } from "../stack";
import { AgentSocket } from "../../common/agent-socket";
import { imageStatusStore } from "../watchers/image-watcher";
import { BackupManager } from "../watchers/backup-manager";
import { isLowPower } from "../low-power";
import { AuditLogger } from "../audit-log";
import { getVolumeMounts, listDir, readFile, writeFile, createEntry, renameEntry, removeEntry, uploadFile } from "../volume-files";

export class DockerSocketHandler extends AgentSocketHandler {
    create(socket : DockgeSocket, server : DockgeServer, agentSocket : AgentSocket) {
        // Do not call super.create()

        agentSocket.on("deployStack", async (name : unknown, composeYAML : unknown, composeENV : unknown, isAdd : unknown, composeOverrideYAML : unknown, callback) => {
            // Compat : ancien client sans override → le dernier arg est le callback
            if (typeof composeOverrideYAML === "function") {
                callback = composeOverrideYAML;
                composeOverrideYAML = undefined;
            }
            try {
                checkLogin(socket);
                const stack = await this.saveStack(server, name, composeYAML, composeENV, isAdd, composeOverrideYAML);
                BackupManager.getInstance().triggerBackupOnSave(typeof name === "string" ? name : "unknown");
                await stack.deploy(socket);
                await this.auditStack(socket, "stack.deploy", String(name));
                server.sendStackList();
                callbackResult({
                    ok: true,
                    msg: "Deployed",
                    msgi18n: true,
                }, callback);
                stack.joinCombinedTerminal(socket);
            } catch (e) {
                callbackError(e, callback);
            }
        });

        agentSocket.on("saveStack", async (name : unknown, composeYAML : unknown, composeENV : unknown, isAdd : unknown, composeOverrideYAML : unknown, callback) => {
            // Compat : ancien client sans override → le dernier arg est le callback
            if (typeof composeOverrideYAML === "function") {
                callback = composeOverrideYAML;
                composeOverrideYAML = undefined;
            }
            try {
                checkLogin(socket);
                await this.saveStack(server, name, composeYAML, composeENV, isAdd, composeOverrideYAML);
                await this.auditStack(socket, "stack.save", String(name), "success", null, { isAdd: Boolean(isAdd) });
                BackupManager.getInstance().triggerBackupOnSave(typeof name === "string" ? name : "unknown");
                callbackResult({
                    ok: true,
                    msg: "Saved",
                    msgi18n: true,
                }, callback);
                server.sendStackList();
            } catch (e) {
                callbackError(e, callback);
            }
        });

        agentSocket.on("deleteStack", async (name : unknown, options : unknown, callback) => {
            // Compat : ancien client sans options → le 2e arg est le callback
            if (typeof options === "function") {
                callback = options;
                options = {};
            }
            try {
                checkLogin(socket);
                if (typeof(name) !== "string") {
                    throw new ValidationError("Name must be a string");
                }
                const opts = (options && typeof options === "object") ? options as { removeFiles?: boolean; force?: boolean } : {};
                const stack = await Stack.getStack(server, name);

                try {
                    await stack.delete(socket, opts);
                } catch (e) {
                    await this.auditStack(socket, "stack.delete", name, "failure", String(e), opts);
                    server.sendStackList();
                    throw e;
                }

                await this.auditStack(socket, "stack.delete", name, "success", null, opts);
                server.sendStackList();
                callbackResult({
                    ok: true,
                    msg: "Deleted",
                    msgi18n: true,
                }, callback);

            } catch (e) {
                callbackError(e, callback);
            }
        });

        agentSocket.on("getStack", async (stackName : unknown, callback) => {
            try {
                checkLogin(socket);

                if (typeof(stackName) !== "string") {
                    throw new ValidationError("Stack name must be a string");
                }

                const stack = await Stack.getStack(server, stackName);

                if (stack.isManagedByDockge) {
                    stack.joinCombinedTerminal(socket);
                }

                callbackResult({
                    ok: true,
                    stack: await stack.toJSON(socket.endpoint),
                }, callback);
            } catch (e) {
                callbackError(e, callback);
            }
        });

        agentSocket.on("getStackVolumeUsage", async (stackName : unknown, callback) => {
            try {
                checkLogin(socket);

                if (typeof(stackName) !== "string") {
                    throw new ValidationError("Stack name must be a string");
                }

                const stack = await Stack.getStack(server, stackName);
                callbackResult({
                    ok: true,
                    data: await stack.getVolumeUsage(),
                }, callback);
            } catch (e) {
                callbackError(e, callback);
            }
        });

        // requestStackList
        agentSocket.on("requestStackList", async (callback) => {
            try {
                checkLogin(socket);
                server.sendStackList();
                callbackResult({
                    ok: true,
                    msg: "Updated",
                    msgi18n: true,
                }, callback);
            } catch (e) {
                callbackError(e, callback);
            }
        });

        // startStack
        agentSocket.on("startStack", async (stackName : unknown, callback) => {
            try {
                checkLogin(socket);

                if (typeof(stackName) !== "string") {
                    throw new ValidationError("Stack name must be a string");
                }

                const stack = await Stack.getStack(server, stackName);
                await stack.start(socket);
                await this.auditStack(socket, "stack.start", stackName);
                callbackResult({
                    ok: true,
                    msg: "Started",
                    msgi18n: true,
                }, callback);
                server.sendStackList();

                stack.joinCombinedTerminal(socket);

            } catch (e) {
                callbackError(e, callback);
            }
        });

        // stopStack
        agentSocket.on("stopStack", async (stackName : unknown, callback) => {
            try {
                checkLogin(socket);

                if (typeof(stackName) !== "string") {
                    throw new ValidationError("Stack name must be a string");
                }

                const stack = await Stack.getStack(server, stackName);
                await stack.stop(socket);
                await this.auditStack(socket, "stack.stop", stackName);
                callbackResult({
                    ok: true,
                    msg: "Stopped",
                    msgi18n: true,
                }, callback);
                server.sendStackList();
            } catch (e) {
                callbackError(e, callback);
            }
        });

        // restartStack
        agentSocket.on("restartStack", async (stackName : unknown, callback) => {
            try {
                checkLogin(socket);

                if (typeof(stackName) !== "string") {
                    throw new ValidationError("Stack name must be a string");
                }

                const stack = await Stack.getStack(server, stackName);
                await stack.restart(socket);
                await this.auditStack(socket, "stack.restart", stackName);
                callbackResult({
                    ok: true,
                    msg: "Restarted",
                    msgi18n: true,
                }, callback);
                server.sendStackList();
            } catch (e) {
                callbackError(e, callback);
            }
        });

        // recreateStack
        agentSocket.on("recreateStack", async (stackName : unknown, callback) => {
            try {
                checkLogin(socket);

                if (typeof(stackName) !== "string") {
                    throw new ValidationError("Stack name must be a string");
                }

                const stack = await Stack.getStack(server, stackName);
                await stack.recreate(socket);
                await this.auditStack(socket, "stack.recreate", stackName);
                callbackResult({
                    ok: true,
                    msg: "Recreated",
                    msgi18n: true,
                }, callback);
                server.sendStackList();
            } catch (e) {
                callbackError(e, callback);
            }
        });

        // updateStack
        agentSocket.on("updateStack", async (stackName : unknown, callback) => {
            try {
                checkLogin(socket);

                if (typeof(stackName) !== "string") {
                    throw new ValidationError("Stack name must be a string");
                }

                const stack = await Stack.getStack(server, stackName);
                await stack.update(socket);
                await this.auditStack(socket, "stack.update", stackName);
                // Clear update badges for this stack — images are now up to date
                for (const key of imageStatusStore.keys()) {
                    if (key.startsWith(`${stackName}::`)) {
                        imageStatusStore.delete(key);
                    }
                }
                callbackResult({
                    ok: true,
                    msg: "Updated",
                    msgi18n: true,
                }, callback);
                server.sendStackList();
            } catch (e) {
                callbackError(e, callback);
            }
        });

        // pullAndRecreateStack
        agentSocket.on("pullAndRecreateStack", async (stackName : unknown, callback) => {
            try {
                checkLogin(socket);

                if (typeof(stackName) !== "string") {
                    throw new ValidationError("Stack name must be a string");
                }

                const stack = await Stack.getStack(server, stackName);
                await stack.pullAndRecreate(socket);
                await this.auditStack(socket, "stack.pull_and_recreate", stackName);
                // Clear update badges for this stack — images are now up to date
                for (const key of imageStatusStore.keys()) {
                    if (key.startsWith(`${stackName}::`)) {
                        imageStatusStore.delete(key);
                    }
                }
                callbackResult({
                    ok: true,
                    msg: "PulledAndRecreated",
                    msgi18n: true,
                }, callback);
                server.sendStackList();
            } catch (e) {
                callbackError(e, callback);
            }
        });

        // down stack
        agentSocket.on("downStack", async (stackName : unknown, callback) => {
            try {
                checkLogin(socket);

                if (typeof(stackName) !== "string") {
                    throw new ValidationError("Stack name must be a string");
                }

                const stack = await Stack.getStack(server, stackName);
                await stack.down(socket);
                await this.auditStack(socket, "stack.down", stackName);
                callbackResult({
                    ok: true,
                    msg: "Downed",
                    msgi18n: true,
                }, callback);
                server.sendStackList();
            } catch (e) {
                callbackError(e, callback);
            }
        });

        // Services status
        agentSocket.on("serviceStatusList", async (stackName : unknown, callback) => {
            try {
                checkLogin(socket);

                if (typeof(stackName) !== "string") {
                    throw new ValidationError("Stack name must be a string");
                }

                const stack = await Stack.getStack(server, stackName, true);
                const { serviceStatusList, lastUpdated, lastStartedAt } = await stack.getServiceStatusList();
                callbackResult({
                    ok: true,
                    serviceStatusList: Object.fromEntries(serviceStatusList),
                    lastUpdated,
                    lastStartedAt,
                    lowPowerMode: isLowPower(),
                }, callback);
            } catch (e) {
                callbackError(e, callback);
            }
        });

        // getExternalNetworkList
        agentSocket.on("getDockerNetworkList", async (callback) => {
            try {
                checkLogin(socket);
                const dockerNetworkList = await server.getDockerNetworkList();
                callbackResult({
                    ok: true,
                    dockerNetworkList,
                }, callback);
            } catch (e) {
                callbackError(e, callback);
            }
        });

        // ── Navigateur/éditeur de fichiers de volumes ──────────────────────

        agentSocket.on("volumeMounts", async (stackName : unknown, service : unknown, callback) => {
            try {
                checkLogin(socket);
                if (typeof stackName !== "string" || typeof service !== "string") {
                    throw new ValidationError("Stack and service must be strings");
                }
                const mounts = await getVolumeMounts(server, stackName, service);
                callbackResult({ ok: true, mounts }, callback);
            } catch (e) {
                callbackError(e, callback);
            }
        });

        agentSocket.on("volumeListDir", async (stackName : unknown, service : unknown, dirPath : unknown, callback) => {
            try {
                checkLogin(socket);
                if (typeof stackName !== "string" || typeof service !== "string" || typeof dirPath !== "string") {
                    throw new ValidationError("Invalid parameters");
                }
                const entries = await listDir(server, stackName, service, dirPath);
                callbackResult({ ok: true, entries }, callback);
            } catch (e) {
                callbackError(e, callback);
            }
        });

        agentSocket.on("volumeReadFile", async (stackName : unknown, service : unknown, filePath : unknown, callback) => {
            try {
                checkLogin(socket);
                if (typeof stackName !== "string" || typeof service !== "string" || typeof filePath !== "string") {
                    throw new ValidationError("Invalid parameters");
                }
                const content = await readFile(server, stackName, service, filePath);
                callbackResult({ ok: true, content }, callback);
            } catch (e) {
                callbackError(e, callback);
            }
        });

        agentSocket.on("volumeWriteFile", async (stackName : unknown, service : unknown, filePath : unknown, content : unknown, callback) => {
            try {
                checkLogin(socket);
                if (typeof stackName !== "string" || typeof service !== "string" || typeof filePath !== "string" || typeof content !== "string") {
                    throw new ValidationError("Invalid parameters");
                }
                await writeFile(server, stackName, service, filePath, content);
                await AuditLogger.getInstance().logFromSocket(socket, {
                    action: "volume.write",
                    category: "stack",
                    targetType: "volume-file",
                    target: `${stackName}/${service}:${filePath}`,
                    status: "success",
                });
                callbackResult({ ok: true, msg: "Saved", msgi18n: true }, callback);
            } catch (e) {
                callbackError(e, callback);
            }
        });

        agentSocket.on("volumeCreate", async (stackName : unknown, service : unknown, dirPath : unknown, name : unknown, kind : unknown, callback) => {
            try {
                checkLogin(socket);
                if (typeof stackName !== "string" || typeof service !== "string" || typeof dirPath !== "string" || typeof name !== "string") {
                    throw new ValidationError("Invalid parameters");
                }
                const entryKind = kind === "dir" ? "dir" : "file";
                await createEntry(server, stackName, service, dirPath, name, entryKind);
                await AuditLogger.getInstance().logFromSocket(socket, {
                    action: "volume.create",
                    category: "stack",
                    targetType: "volume-file",
                    target: `${stackName}/${service}:${dirPath}/${name}`,
                    status: "success",
                });
                callbackResult({ ok: true, msg: "Created", msgi18n: true }, callback);
            } catch (e) {
                callbackError(e, callback);
            }
        });

        agentSocket.on("volumeRename", async (stackName : unknown, service : unknown, targetPath : unknown, newName : unknown, callback) => {
            try {
                checkLogin(socket);
                if (typeof stackName !== "string" || typeof service !== "string" || typeof targetPath !== "string" || typeof newName !== "string") {
                    throw new ValidationError("Invalid parameters");
                }
                await renameEntry(server, stackName, service, targetPath, newName);
                await AuditLogger.getInstance().logFromSocket(socket, {
                    action: "volume.rename",
                    category: "stack",
                    targetType: "volume-file",
                    target: `${stackName}/${service}:${targetPath} → ${newName}`,
                    status: "success",
                });
                callbackResult({ ok: true, msg: "Renamed", msgi18n: true }, callback);
            } catch (e) {
                callbackError(e, callback);
            }
        });

        agentSocket.on("volumeDelete", async (stackName : unknown, service : unknown, targetPath : unknown, callback) => {
            try {
                checkLogin(socket);
                if (typeof stackName !== "string" || typeof service !== "string" || typeof targetPath !== "string") {
                    throw new ValidationError("Invalid parameters");
                }
                await removeEntry(server, stackName, service, targetPath);
                await AuditLogger.getInstance().logFromSocket(socket, {
                    action: "volume.delete",
                    category: "stack",
                    targetType: "volume-file",
                    target: `${stackName}/${service}:${targetPath}`,
                    status: "success",
                });
                callbackResult({ ok: true, msg: "Deleted", msgi18n: true }, callback);
            } catch (e) {
                callbackError(e, callback);
            }
        });

        agentSocket.on("volumeUpload", async (stackName : unknown, service : unknown, dirPath : unknown, name : unknown, base64 : unknown, callback) => {
            try {
                checkLogin(socket);
                if (typeof stackName !== "string" || typeof service !== "string" || typeof dirPath !== "string" || typeof name !== "string" || typeof base64 !== "string") {
                    throw new ValidationError("Invalid parameters");
                }
                await uploadFile(server, stackName, service, dirPath, name, base64);
                await AuditLogger.getInstance().logFromSocket(socket, {
                    action: "volume.upload",
                    category: "stack",
                    targetType: "volume-file",
                    target: `${stackName}/${service}:${dirPath}/${name}`,
                    status: "success",
                });
                callbackResult({ ok: true, msg: "Uploaded", msgi18n: true }, callback);
            } catch (e) {
                callbackError(e, callback);
            }
        });
    }

    async saveStack(server : DockgeServer, name : unknown, composeYAML : unknown, composeENV : unknown, isAdd : unknown, composeOverrideYAML : unknown = "") : Promise<Stack> {
        // Check types
        if (typeof(name) !== "string") {
            throw new ValidationError("Name must be a string");
        }
        if (typeof(composeYAML) !== "string") {
            throw new ValidationError("Compose YAML must be a string");
        }
        if (typeof(composeENV) !== "string") {
            throw new ValidationError("Compose ENV must be a string");
        }
        if (isAdd !== undefined && typeof(isAdd) !== "boolean") {
            throw new ValidationError("isAdd must be a boolean");
        }
        if (composeOverrideYAML !== undefined && typeof(composeOverrideYAML) !== "string") {
            throw new ValidationError("Compose override YAML must be a string");
        }

        const stack = new Stack(server, name, composeYAML, composeENV, false, composeOverrideYAML as string | undefined);
        await stack.save(isAdd as boolean);
        return stack;
    }

    private async auditStack(
        socket: DockgeSocket,
        action: string,
        stackName: string,
        status: "success" | "failure" = "success",
        message?: string | null,
        metadata?: unknown
    ) {
        await AuditLogger.getInstance().logFromSocket(socket, {
            action,
            category: "stack",
            targetType: "stack",
            target: stackName,
            status,
            message,
            metadata,
        });
    }

}

