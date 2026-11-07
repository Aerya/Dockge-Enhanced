import { ApplicationCatalog } from "../app-catalog";
import { loadUserAccess } from "../user-access";
import { callbackError, callbackResult, checkLogin, type DockgeSocket } from "../util-server";
import type { AgentSocket } from "../../common/agent-socket";

const catalog = new ApplicationCatalog();
export function registerCatalog(socket: DockgeSocket, agent: AgentSocket) {
    for (const event of [ "appCatalogList", "appCatalogDraft" ]) {
        let busy = false;
        agent.on(event, async (request, callback) => {
            try {
                checkLogin(socket);
                if ((await loadUserAccess(socket.userID)).role !== "admin") {
                    throw new Error("Permission denied");
                }
                if (busy || !request || typeof request !== "object") {
                    throw new Error("appCatalog.busy");
                }
                busy = true;
                try {
                    const input = request as Record<string, unknown>;
                    const data = event === "appCatalogList" ? await catalog.list(input.source, input.refresh === true) : await catalog.draft(input.source, input.revision, input.index);
                    callbackResult({ ok: true,
                        data }, callback);
                } finally {
                    busy = false;
                }
            } catch (error) {
                callbackError(error, callback);
            }
        });
    }
}
