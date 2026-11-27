import { hostOperationStatus, queueHostOperation } from "../hosts/operations";
import type { AgentSocket } from "../../common/agent-socket";
import { checkLogin, type DockgeSocket } from "../util-server";
import { loadUserAccess } from "../user-access";
import { HostManager } from "../hosts/manager";
import { AuditLogger } from "../audit-log";

export function registerHosts(socket: DockgeSocket, agent: AgentSocket) {
    for (const event of [ "hosts:capabilities", "hosts:get", "hosts:settings", "hosts:operation", "hosts:packages" ]) {
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
                            modes: [ "disabled", "monitor" ] } });
                    return;
                }
                if (event === "hosts:packages") {
                    callback({ ok: true,
                        data: await HostManager.instance.packages(request) });
                    return;
                }
                if (event === "hosts:operation") {
                    const hostId = await HostManager.instance.operationAuthority();
                    if (!(await hostOperationStatus(hostId)).manual) {
                        throw new Error("hosts.operationsUnavailable");
                    }
                    await AuditLogger.getInstance().logFromSocket(socket, { action: "hosts.operation.request",
                        category: "host",
                        status: "success" });
                    const data = await queueHostOperation(request, hostId);
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
