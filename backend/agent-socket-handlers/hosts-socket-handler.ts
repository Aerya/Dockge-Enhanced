import { randomBytes } from "node:crypto";
import { hostOperationStatus, queueHostOperation } from "../hosts/operations";
import type { AgentSocket } from "../../common/agent-socket";
import { checkLogin, type DockgeSocket } from "../util-server";
import { loadUserAccess } from "../user-access";
import { HostManager } from "../hosts/manager";
import { AuditLogger } from "../audit-log";

export function registerHosts(socket: DockgeSocket, agent: AgentSocket) {
    const connectionNonce = randomBytes(16).toString("hex");
    for (const event of [ "hosts:capabilities", "hosts:get", "hosts:settings", "hosts:operation", "hosts:packages", "hosts:history" ]) {
        agent.on(event, async (request, callback) => {
            if (typeof callback !== "function") {
                return;
            }
            try {
                checkLogin(socket);
                if ((await loadUserAccess(socket.userID)).role !== "admin") {
                    throw new Error("access.denied");
                }
                if (event === "hosts:capabilities") {
                    callback({ ok: true,
                        data: { protocol: 1,
                            connectionNonce,
                            modes: [ "disabled", "monitor" ] } });
                    return;
                }
                if (event === "hosts:history") {
                    callback({ ok: true,
                        data: await HostManager.instance.history(request) });
                    return;
                }
                if (event === "hosts:packages") {
                    callback({ ok: true,
                        data: await HostManager.instance.packages(request) });
                    return;
                }
                if (event === "hosts:operation") {
                    const payload = request as Record<string, unknown>;
                    if (!payload || payload.connectionNonce !== connectionNonce) {
                        throw new Error("hosts.expired");
                    }
                    const { connectionNonce: _nonce, ...operation } = payload;
                    const hostId = await HostManager.instance.operationAuthority();
                    if (!(await hostOperationStatus(hostId)).manual) {
                        throw new Error("hosts.operationsUnavailable");
                    }
                    await AuditLogger.getInstance().logFromSocket(socket, { action: "hosts.operation.request",
                        category: "host",
                        status: "success" });
                    const data = await queueHostOperation(operation, hostId);
                    callback({ ok: true,
                        data });
                    return;
                }
                if (event === "hosts:settings") {
                    await HostManager.instance.save(request);
                    await AuditLogger.getInstance().logFromSocket(socket, { action: "hosts.settings",
                        category: "host",
                        targetType: "host",
                        status: "success" });
                }
                callback({ ok: true,
                    data: await HostManager.instance.snapshot() });
            } catch {
                callback({ ok: false,
                    msg: "hosts.unavailable",
                    msgi18n: true });
            }
        });
    }
}
