import { DockgeSocket } from "./util-server";
import { io, Socket as SocketClient } from "socket.io-client";
import { log } from "./log";
import { Agent } from "./models/agent";
import { isDev, LooseObject, sleep } from "../common/util-common";
import semver from "semver";
import { R } from "redbean-node";
import dayjs, { Dayjs } from "dayjs";
import { Settings } from "./settings";
import {
    FEDERATION_CIRCUIT_OPEN_MS,
    FEDERATION_FAILURE_THRESHOLD,
    FEDERATION_RECONNECT_ATTEMPTS,
    FEDERATION_RECONNECT_DELAY_MAX_MS,
    FEDERATION_RECONNECT_DELAY_MS,
    FEDERATION_RECONNECT_RANDOMIZATION,
    federationCircuitRetryDelayMs,
    notifyFederationIncident,
    safeFederationErrorMessage,
} from "./federation-health";

const LOCAL_AGENT_DISPLAY_NAME_SETTING = "localAgentDisplayName";
export const AGENT_TOKEN_USERNAME = "__dockge_federation_token__";

export function loginAgentClient<T>(client: SocketClient, username: string, password: string, callback: (res: T) => void) {
    if (username === AGENT_TOKEN_USERNAME) {
        client.emit("loginByToken", password, callback);
    } else {
        client.emit("login", { username,
            password }, callback);
    }
}

/**
 * Dockge Instance Manager
 * One AgentManager per Socket connection
 */
export class AgentManager {

    protected socket : DockgeSocket;
    protected agentSocketList : Record<string, SocketClient> = {};
    protected agentLoggedInList : Record<string, boolean> = {};
    protected reconnectFailureList : Record<string, number> = {};
    protected circuitRetryTimerList : Record<string, NodeJS.Timeout> = {};
    protected _firstConnectTime : Dayjs = dayjs();

    constructor(socket: DockgeSocket) {
        this.socket = socket;
    }

    get firstConnectTime() : Dayjs {
        return this._firstConnectTime;
    }

    private clearCircuitRetry(endpoint: string) {
        const timer = this.circuitRetryTimerList[endpoint];
        if (timer) {
            clearTimeout(timer);
            delete this.circuitRetryTimerList[endpoint];
        }
    }

    private openReconnectCircuit(endpoint: string, url: string, username: string, password: string, detail: string) {
        if (this.circuitRetryTimerList[endpoint]) return;

        const failures = this.reconnectFailureList[endpoint] ?? FEDERATION_FAILURE_THRESHOLD;
        const client = this.agentSocketList[endpoint];
        client?.disconnect();
        delete this.agentSocketList[endpoint];
        delete this.agentLoggedInList[endpoint];
        this.socket.emit("agentStatus", { endpoint, status: "offline" });

        void notifyFederationIncident({
            kind: "reconnect-circuit-open",
            endpoint,
            attempts: failures,
            detail,
        });

        const delay = federationCircuitRetryDelayMs(FEDERATION_CIRCUIT_OPEN_MS);
        log.warn("agent-manager", `${endpoint}: federation circuit open, retry in ${Math.round(delay / 1000)}s`);
        const timer = setTimeout(() => {
            delete this.circuitRetryTimerList[endpoint];
            this.reconnectFailureList[endpoint] = 0;
            if (!this.socket.connected) return;
            this.connect(url, username, password);
        }, delay);
        timer.unref?.();
        this.circuitRetryTimerList[endpoint] = timer;
    }

    test(url : string, username : string, password : string, allowExisting = false) : Promise<void> {
        return new Promise((resolve, reject) => {
            let obj = new URL(url);
            let endpoint = obj.host;

            if (!endpoint) {
                reject(new Error("Invalid Dockge URL"));
            }

            if (!allowExisting && this.agentSocketList[endpoint]) {
                reject(new Error("The Dockge URL already exists"));
            }

            let client = io(url, {
                reconnection: false,
                extraHeaders: {
                    endpoint,
                }
            });

            client.on("connect", () => {
                loginAgentClient(client, username, password, (res : LooseObject) => {
                    if (res.ok) {
                        resolve();
                    } else {
                        reject(new Error(res.msg));
                    }
                    client.disconnect();
                });
            });

            client.on("connect_error", (err) => {
                if (err.message === "xhr poll error") {
                    reject(new Error("Unable to connect to the Dockge instance"));
                } else {
                    reject(err);
                }
                client.disconnect();
            });
        });
    }

    /**
     *
     * @param url
     * @param username
     * @param password
     */
    async add(url : string, username : string, password : string, displayName = "") : Promise<Agent> {
        let bean = R.dispense("agent") as Agent;
        bean.url = url;
        bean.username = username;
        bean.password = password;
        bean.display_name = displayName;
        await R.store(bean);
        return bean;
    }

    async rename(url: string, displayName: string): Promise<void> {
        if (url === "") {
            await Settings.set(LOCAL_AGENT_DISPLAY_NAME_SETTING, displayName, "general");
            return;
        }

        const bean = await R.findOne("agent", " url = ? ", [ url ]) as Agent | null;
        if (!bean) {
            throw new Error("Agent not found");
        }
        bean.display_name = displayName;
        await R.store(bean);
    }

    async updateCredentials(url: string, username: string, password: string): Promise<void> {
        const bean = await R.findOne("agent", " url = ? ", [ url ]) as Agent | null;
        if (!bean) {
            throw new Error("Agent not found");
        }
        bean.username = username;
        bean.password = password;
        await R.store(bean);

        const endpoint = new URL(url).host;
        this.disconnect(endpoint);
        delete this.agentSocketList[endpoint];
        delete this.agentLoggedInList[endpoint];
        this.connect(url, username, password);
    }

    /**
     *
     * @param url
     */
    async remove(url : string) {
        let bean = await R.findOne("agent", " url = ? ", [
            url,
        ]);

        if (bean) {
            await R.trash(bean);
            let endpoint = bean.endpoint;
            this.disconnect(endpoint);
            this.sendAgentList();
            delete this.agentSocketList[endpoint];
        } else {
            const endpoint = new URL(url).host;
            this.disconnect(endpoint);
            delete this.agentSocketList[endpoint];
        }
    }

    connect(url : string, username : string, password : string) {
        let obj = new URL(url);
        let endpoint = obj.host;

        this.socket.emit("agentStatus", {
            endpoint: endpoint,
            status: "connecting",
        });

        if (!endpoint) {
            log.error("agent-manager", "Invalid endpoint: " + endpoint + " URL: " + url);
            return;
        }

        if (this.circuitRetryTimerList[endpoint]) {
            log.warn("agent-manager", `${endpoint}: connection held offline by federation circuit breaker`);
            this.socket.emit("agentStatus", { endpoint, status: "offline" });
            return;
        }

        if (this.agentSocketList[endpoint]) {
            log.debug("agent-manager", "Already connected to the socket server: " + endpoint);
            return;
        }

        log.info("agent-manager", "Connecting to the socket server: " + endpoint);
        let client = io(url, {
            reconnection: true,
            reconnectionAttempts: FEDERATION_RECONNECT_ATTEMPTS,
            reconnectionDelay: FEDERATION_RECONNECT_DELAY_MS,
            reconnectionDelayMax: FEDERATION_RECONNECT_DELAY_MAX_MS,
            randomizationFactor: FEDERATION_RECONNECT_RANDOMIZATION,
            timeout: 10_000,
            extraHeaders: {
                endpoint,
            }
        });

        client.on("connect", () => {
            log.info("agent-manager", "Connected to the socket server: " + endpoint);

            loginAgentClient(client, username, password, (res : LooseObject) => {
                if (res.ok) {
                    log.info("agent-manager", "Logged in to the socket server: " + endpoint);
                    this.reconnectFailureList[endpoint] = 0;
                    this.agentLoggedInList[endpoint] = true;
                    this.socket.emit("agentStatus", {
                        endpoint: endpoint,
                        status: "online",
                    });
                } else {
                    const detail = safeFederationErrorMessage(res.msg || "Federation login failed");
                    log.error("agent-manager", `Failed to login to the socket server: ${endpoint} - ${detail}`);
                    this.agentLoggedInList[endpoint] = false;
                    this.socket.emit("agentStatus", {
                        endpoint: endpoint,
                        status: "offline",
                    });
                    void notifyFederationIncident({ kind: "authentication-failed", endpoint, detail });
                    client.disconnect();
                }
            });
        });

        client.on("connect_error", (err) => {
            const detail = safeFederationErrorMessage(`${err.name || "Error"}: ${err.message || String(err)}`);
            const failures = (this.reconnectFailureList[endpoint] ?? 0) + 1;
            this.reconnectFailureList[endpoint] = failures;
            log.error("agent-manager", `${endpoint}: federation connection error ${failures}/${FEDERATION_FAILURE_THRESHOLD} - ${detail}`);
            this.socket.emit("agentStatus", {
                endpoint: endpoint,
                status: "offline",
            });
            if (failures >= FEDERATION_FAILURE_THRESHOLD) {
                this.openReconnectCircuit(endpoint, url, username, password, detail);
            }
        });

        client.io.on("reconnect_attempt", (attempt) => {
            log.warn("agent-manager", `${endpoint}: bounded federation reconnect ${attempt}/${FEDERATION_RECONNECT_ATTEMPTS}`);
        });

        client.io.on("reconnect_failed", () => {
            this.openReconnectCircuit(endpoint, url, username, password, "Socket.IO bounded reconnection attempts exhausted");
        });

        client.on("disconnect", () => {
            log.info("agent-manager", "Disconnected from the socket server: " + endpoint);
            this.socket.emit("agentStatus", {
                endpoint: endpoint,
                status: "offline",
            });
        });

        client.on("agent", (...args : unknown[]) => {
            this.socket.emit("agent", ...args);
        });

        client.on("info", (res) => {
            log.debug("agent-manager", res);

            // Disconnect if the version is lower than 1.4.0
            if (!isDev && semver.satisfies(res.version, "< 1.4.0")) {
                this.socket.emit("agentStatus", {
                    endpoint: endpoint,
                    status: "offline",
                    msg: `${endpoint}: Unsupported version: ` + res.version,
                });
                client.disconnect();
            }
        });

        this.agentSocketList[endpoint] = client;
    }

    disconnect(endpoint : string) {
        this.clearCircuitRetry(endpoint);
        let client = this.agentSocketList[endpoint];
        client?.disconnect();
    }

    async connectAll() {
        this._firstConnectTime = dayjs();

        if (this.socket.endpoint) {
            log.info("agent-manager", "This connection is connected as an agent, skip connectAll()");
            return;
        }

        let list : Record<string, Agent> = await Agent.getAgentList();

        if (Object.keys(list).length !== 0) {
            log.info("agent-manager", "Connecting to all instance socket server(s)...");
        }

        for (let endpoint in list) {
            let agent = list[endpoint];
            this.connect(agent.url, agent.username, agent.password);
        }
    }

    disconnectAll() {
        for (let endpoint in this.circuitRetryTimerList) {
            this.clearCircuitRetry(endpoint);
        }
        for (let endpoint in this.agentSocketList) {
            this.disconnect(endpoint);
        }
    }

    async emitToEndpoint(endpoint: string, eventName: string, ...args : unknown[]) {
        log.debug("agent-manager", "Emitting event to endpoint: " + endpoint);
        let client = this.agentSocketList[endpoint];

        // afterLogin() starts connectAll() asynchronously. A freshly reloaded UI can
        // emit its first request before connect() has registered the socket client.
        let diff = dayjs().diff(this.firstConnectTime, "second");
        while (!client && diff < 10) {
            await sleep(250);
            client = this.agentSocketList[endpoint];
            diff = dayjs().diff(this.firstConnectTime, "second");
        }

        if (!client) {
            log.error("agent-manager", "Socket client not found for endpoint: " + endpoint);
            throw new Error("Socket client not found for endpoint: " + endpoint);
        }

        if (!client.connected || !this.agentLoggedInList[endpoint]) {
            // Maybe the request is too quick, the socket is not connected yet, check firstConnectTime
            // If it is within 10 seconds, we should apply retry logic here
            diff = dayjs().diff(this.firstConnectTime, "second");
            log.debug("agent-manager", endpoint + ": diff: " + diff);
            let ok = false;
            while (diff < 10) {
                if (client.connected && this.agentLoggedInList[endpoint]) {
                    log.debug("agent-manager", `${endpoint}: Connected & Logged in`);
                    ok = true;
                    break;
                }
                log.debug("agent-manager", endpoint + ": not ready yet, retrying in 1 second...");
                await sleep(1000);
                diff = dayjs().diff(this.firstConnectTime, "second");
            }

            if (!ok) {
                log.error("agent-manager", `${endpoint}: Socket client not connected`);
                throw new Error("Socket client not connected for endpoint: " + endpoint);
            }
        }

        client.emit("agent", endpoint, eventName, ...args);
    }

    requestEndpoint<T>(endpoint: string, eventName: string, ...args: unknown[]): Promise<T> {
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error(`Agent request timed out: ${endpoint}`)), 60_000);
            this.emitToEndpoint(endpoint, eventName, ...args, (response: T) => {
                clearTimeout(timeout);
                resolve(response);
            }).catch((error) => {
                clearTimeout(timeout);
                reject(error);
            });
        });
    }

    emitToAllEndpoints(eventName: string, ...args : unknown[]) {
        log.debug("agent-manager", "Emitting event to all endpoints");
        for (let endpoint in this.agentSocketList) {
            this.emitToEndpoint(endpoint, eventName, ...args).catch((e) => {
                log.warn("agent-manager", e.message);
            });
        }
    }

    async sendAgentList() {
        let list = await Agent.getAgentList();
        let result : Record<string, LooseObject> = {};
        const localDisplayName = await Settings.get(LOCAL_AGENT_DISPLAY_NAME_SETTING);

        // Myself
        result[""] = {
            url: "",
            username: "",
            endpoint: "",
            displayName: typeof localDisplayName === "string" ? localDisplayName : "",
        };

        for (let endpoint in list) {
            let agent = list[endpoint];
            result[endpoint] = agent.toJSON();
        }

        this.socket.emit("agentList", {
            ok: true,
            agentList: result,
        });
    }
}
