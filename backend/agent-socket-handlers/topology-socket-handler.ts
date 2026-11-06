import { AgentSocketHandler } from "../agent-socket-handler";
import type { DockgeServer } from "../dockge-server";
import type { DockgeSocket } from "../util-server";
import { AgentSocket } from "../../common/agent-socket";
import { authorizeServiceLinks } from "../socket-handlers/service-links-socket-handler";
import { collectTopology, topologyStackNames, TopologyCache } from "../docker-topology";
import { Settings } from "../settings";
export class TopologySocketHandler extends AgentSocketHandler {
    private cache?: TopologyCache;
    create(socket: DockgeSocket, server: DockgeServer, agent: AgentSocket) {
        this.cache ??= new TopologyCache(async () => {
            const snapshot = await collectTopology(await topologyStackNames(server));
            snapshot.primaryHostname = await Settings.get("primaryHostname") || "";
            snapshot.portLinkIp = await Settings.get("portLinkIp") || "";
            snapshot.portLinkAddressMode = await Settings.get("portLinkAddressMode") === "ip" ? "ip" : "hostname";
            return snapshot;
        });
        agent.on("topology:get", async (callback) => {
            if (typeof callback !== "function") {
                return;
            }
            try {
                await authorizeServiceLinks(socket);
                const snapshot = await this.cache!.get();
                await authorizeServiceLinks(socket);
                callback({ ok: true,
                    snapshot });
            } catch {
                callback({ ok: false,
                    msg: "topology.unavailable" });
            }
        });
    }
}
