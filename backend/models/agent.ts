import { BeanModel } from "redbean-node/dist/bean-model";
import { R } from "redbean-node";
import { LooseObject } from "../../common/util-common";
import { agentConnectionOptions } from "../agent-connection-options";

export class Agent extends BeanModel {

    static async getAgentList() : Promise<Record<string, Agent>> {
        let list = await R.findAll("agent") as Agent[];
        let result : Record<string, Agent> = {};
        for (let agent of list) {
            result[agent.endpoint] = agent;
        }
        return result;
    }

    get endpoint() : string {
        let obj = new URL(this.url);
        return obj.host;
    }

    get oneWay(): boolean {
        return agentConnectionOptions(this.url, this.connection_options).oneWay;
    }

    toJSON() : LooseObject {
        return {
            url: this.url,
            reverse: this.url.startsWith("reverse://"),
            oneWay: this.oneWay,
            username: this.username,
            endpoint: this.endpoint,
            displayName: this.display_name || "",
            suppressOfflineAlerts: Boolean(Number(this.suppress_offline_alerts)),
        };
    }

}

export default Agent;
