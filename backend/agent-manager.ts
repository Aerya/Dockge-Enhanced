import type { DockgeSocket } from "./util-server";
import { io, type Socket as SocketClient } from "socket.io-client";
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

export function loginAgentClient<T>(
    client: SocketClient,
    username: string,
    password: string,
    callback: (res: T) => void,
) {
    if (username === AGENT_TOKEN_USERNAME) {
        client.emit("loginByToken", password, callback);
    } else {
        client.emit("login", {
            username,
            password,
        }, callback);
    }
}

interface SharedAgentConfig {
    url: string;
    username: string;
    password: string;
}

type SharedAgentStatus = "connecting" | "online" | "offline";

/**
 * WebUI adapter + process-wide federation transport.
 *
 * All AgentManager instances share the same outbound Socket.IO clients.
 * Browser sockets only subscribe to events/status and never own the remote
 * connections, so closing the last WebUI cannot tear down federation.
 */
export class AgentManager {

    private static readonly sharedAgentSocketList : Record<string, SocketClient> = {};
    private static readonly sharedAgentLoggedInList : Record<string, boolean> = {};
    private static readonly sharedReconnectFailureList : Record<string, number> = {};
    private static readonly sharedCircuitRetryTimerList : Record<string, NodeJS.Timeout> = {};
    private static readonly sharedConfigs : Record<string, SharedAgentConfig> = {};
    private static readonly subscribers = new Set<DockgeSocket>();
    private static sharedFirstConnectTime : Dayjs = dayjs();

    protected socket? : DockgeSocket;

    constructor(socket?: DockgeSocket) {
        this.socket = socket;
    }

    get firstConnectTime() : Dayjs {
        return AgentManager.sharedFirstConnectTime;
    }

    static async bootstrap(): Promise<void> {
        log.info("agent-manager", "Starting process-wide federation transport");
        await AgentManager.refreshFromDatabase();
    }

    static async refreshFromDatabase(): Promise<void> {
        AgentManager.sharedFirstConnectTime = dayjs();
        const manager = new AgentManager();
        const list : Record<string, Agent> = await Agent.getAgentList();
        const wanted = new Set(Object.keys(list));

        for (const endpoint of Object.keys(AgentManager.sharedConfigs)) {
            if (!wanted.has(endpoint)) {
                manager.disconnect(endpoint);
            }
        }

        for (const endpoint of Object.keys(list)) {
            const agent = list[endpoint];
            const next : SharedAgentConfig = {
                url: agent.url,
                username: agent.username,
                password: agent.password,
            };
            const previous = AgentManager.sharedConfigs[endpoint];

            if (previous && (
                previous.url !== next.url
                || previous.username !== next.username
                || previous.password !== next.password
            )) {
                manager.disconnect(endpoint);
            }

            manager.connect(next.url, next.username, next.password);
        }
    }

    static shutdown(): void {
        const manager = new AgentManager();
        for (const endpoint of Object.keys(AgentManager.sharedCircuitRetryTimerList)) {
            manager.clearCircuitRetry(endpoint);
        }
        for (const endpoint of Object.keys(AgentManager.sharedAgentSocketList)) {
            manager.disconnect(endpoint);
        }
        AgentManager.subscribers.clear();
    }

    subscribe(): void {
        if (!this.socket || this.socket.endpoint) {
            return;
        }

        AgentManager.subscribers.add(this.socket);

        for (const endpoint of Object.keys(AgentManager.sharedConfigs)) {
            this.socket.emit("agentStatus", {
                endpoint,
                status: this.statusFor(endpoint),
            });
        }
    }

    release(): void {
        if (this.socket) {
            AgentManager.subscribers.delete(this.socket);
        }
    }

    private statusFor(endpoint: string): SharedAgentStatus {
        const client = AgentManager.sharedAgentSocketList[endpoint];

        if (client?.connected && AgentManager.sharedAgentLoggedInList[endpoint]) {
            return "online";
        }

        if (client && !AgentManager.sharedCircuitRetryTimerList[endpoint]) {
            return "connecting";
        }

        return "offline";
    }

    private broadcast(event: string, ...args: unknown[]): void {
        for (const subscriber of AgentManager.subscribers) {
            if (!subscriber.connected) {
                AgentManager.subscribers.delete(subscriber);
                continue;
            }
            subscriber.emit(event, ...args);
        }
    }

    private broadcastStatus(endpoint: string, status: SharedAgentStatus, msg?: string): void {
        const payload : LooseObject = {
            endpoint,
            status,
        };

        if (msg) {
            payload.msg = msg;
        }

        this.broadcast("agentStatus", payload);
    }

    private clearCircuitRetry(endpoint: string): void {
        const timer = AgentManager.sharedCircuitRetryTimerList[endpoint];

        if (timer) {
            clearTimeout(timer);
            delete AgentManager.sharedCircuitRetryTimerList[endpoint];
        }
    }

    private openReconnectCircuit(endpoint: string, detail: string): void {
        if (AgentManager.sharedCircuitRetryTimerList[endpoint]) {
            return;
        }

        const config = AgentManager.sharedConfigs[endpoint];

        if (!config) {
            return;
        }

        const failures = AgentManager.sharedReconnectFailureList[endpoint]
            ?? FEDERATION_FAILURE_THRESHOLD;
        const client = AgentManager.sharedAgentSocketList[endpoint];

        delete AgentManager.sharedAgentSocketList[endpoint];
        delete AgentManager.sharedAgentLoggedInList[endpoint];
        client?.disconnect();

        this.broadcastStatus(endpoint, "offline");

        void notifyFederationIncident({
            kind: "reconnect-circuit-open",
            endpoint,
            attempts: failures,
            detail,
        });

        const delay = federationCircuitRetryDelayMs(FEDERATION_CIRCUIT_OPEN_MS);
        log.warn(
            "agent-manager",
            `${endpoint}: shared federation circuit open, retry in ${Math.round(delay / 1000)}s`,
        );

        const timer = setTimeout(() => {
            delete AgentManager.sharedCircuitRetryTimerList[endpoint];
            AgentManager.sharedReconnectFailureList[endpoint] = 0;

            const latest = AgentManager.sharedConfigs[endpoint];

            if (!latest) {
                return;
            }

            this.connect(latest.url, latest.username, latest.password);
        }, delay);

        timer.unref?.();
        AgentManager.sharedCircuitRetryTimerList[endpoint] = timer;
    }

    test(url : string, username : string, password : string, allowExisting = false) : Promise<void> {
        return new Promise((resolve, reject) => {
            const endpoint = new URL(url).host;

            if (!endpoint) {
                reject(new Error("Invalid Dockge URL"));
                return;
            }

            if (!allowExisting && (
                AgentManager.sharedConfigs[endpoint]
                || AgentManager.sharedAgentSocketList[endpoint]
            )) {
                reject(new Error("The Dockge URL already exists"));
                return;
            }

            const client = io(url, {
                reconnection: false,
                timeout: 10_000,
                extraHeaders: {
                    endpoint,
                },
            });

            client.on("connect", () => {
                loginAgentClient<LooseObject>(client, username, password, (res) => {
                    if (res.ok) {
                        resolve();
                    } else {
                        reject(new Error(res.msg));
                    }
                    client.disconnect();
                });
            });

            client.on("connect_error", (error) => {
                reject(error.message === "xhr poll error"
                    ? new Error("Unable to connect to the Dockge instance")
                    : error);
                client.disconnect();
            });
        });
    }

    async add(url : string, username : string, password : string, displayName = "") : Promise<Agent> {
        const bean = R.dispense("agent") as Agent;
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
        this.connect(url, username, password);
    }

    async remove(url : string) {
        const bean = await R.findOne("agent", " url = ? ", [ url ]);

        if (bean) {
            await R.trash(bean);
            this.disconnect(bean.endpoint);
            await this.sendAgentList();
        } else {
            this.disconnect(new URL(url).host);
        }
    }

    connect(url : string, username : string, password : string): void {
        const endpoint = new URL(url).host;

        if (!endpoint) {
            log.error("agent-manager", "Invalid endpoint for URL: " + url);
            return;
        }

        const next : SharedAgentConfig = {
            url,
            username,
            password,
        };
        const previous = AgentManager.sharedConfigs[endpoint];

        if (previous && (
            previous.url !== next.url
            || previous.username !== next.username
            || previous.password !== next.password
        )) {
            this.disconnect(endpoint);
        }

        AgentManager.sharedConfigs[endpoint] = next;

        if (AgentManager.sharedCircuitRetryTimerList[endpoint]) {
            this.broadcastStatus(endpoint, "offline");
            return;
        }

        if (AgentManager.sharedAgentSocketList[endpoint]) {
            return;
        }

        this.broadcastStatus(endpoint, "connecting");
        log.info("agent-manager", "Connecting shared transport to: " + endpoint);

        const client = io(url, {
            reconnection: true,
            reconnectionAttempts: FEDERATION_RECONNECT_ATTEMPTS,
            reconnectionDelay: FEDERATION_RECONNECT_DELAY_MS,
            reconnectionDelayMax: FEDERATION_RECONNECT_DELAY_MAX_MS,
            randomizationFactor: FEDERATION_RECONNECT_RANDOMIZATION,
            timeout: 10_000,
            extraHeaders: {
                endpoint,
            },
        });

        AgentManager.sharedAgentSocketList[endpoint] = client;

        client.on("connect", () => {
            if (AgentManager.sharedAgentSocketList[endpoint] !== client) {
                return;
            }

            loginAgentClient<LooseObject>(client, username, password, (res) => {
                if (AgentManager.sharedAgentSocketList[endpoint] !== client) {
                    return;
                }

                if (res.ok) {
                    AgentManager.sharedReconnectFailureList[endpoint] = 0;
                    AgentManager.sharedAgentLoggedInList[endpoint] = true;
                    this.broadcastStatus(endpoint, "online");
                    return;
                }

                const detail = safeFederationErrorMessage(
                    res.msg || "Federation login failed",
                );

                delete AgentManager.sharedAgentSocketList[endpoint];
                delete AgentManager.sharedAgentLoggedInList[endpoint];
                this.broadcastStatus(endpoint, "offline");

                void notifyFederationIncident({
                    kind: "authentication-failed",
                    endpoint,
                    detail,
                });

                client.disconnect();
            });
        });

        client.on("connect_error", (error) => {
            if (AgentManager.sharedAgentSocketList[endpoint] !== client) {
                return;
            }

            const detail = safeFederationErrorMessage(
                `${error.name || "Error"}: ${error.message || String(error)}`,
            );
            const failures = (AgentManager.sharedReconnectFailureList[endpoint] ?? 0) + 1;
            AgentManager.sharedReconnectFailureList[endpoint] = failures;

            this.broadcastStatus(endpoint, "offline");
            log.error(
                "agent-manager",
                `${endpoint}: shared federation connection error ${failures}/${FEDERATION_FAILURE_THRESHOLD} - ${detail}`,
            );

            if (failures >= FEDERATION_FAILURE_THRESHOLD) {
                this.openReconnectCircuit(endpoint, detail);
            }
        });

        client.io.on("reconnect_attempt", (attempt) => {
            if (AgentManager.sharedAgentSocketList[endpoint] !== client) {
                return;
            }
            log.warn(
                "agent-manager",
                `${endpoint}: bounded shared reconnect ${attempt}/${FEDERATION_RECONNECT_ATTEMPTS}`,
            );
        });

        client.io.on("reconnect_failed", () => {
            if (AgentManager.sharedAgentSocketList[endpoint] !== client) {
                return;
            }
            this.openReconnectCircuit(
                endpoint,
                "Socket.IO bounded reconnection attempts exhausted",
            );
        });

        client.on("disconnect", () => {
            if (AgentManager.sharedAgentSocketList[endpoint] !== client) {
                return;
            }
            AgentManager.sharedAgentLoggedInList[endpoint] = false;
            this.broadcastStatus(endpoint, "offline");
        });

        client.on("agent", (...args : unknown[]) => {
            if (AgentManager.sharedAgentSocketList[endpoint] === client) {
                this.broadcast("agent", ...args);
            }
        });

        client.on("info", (res) => {
            if (AgentManager.sharedAgentSocketList[endpoint] !== client) {
                return;
            }

            if (!isDev && semver.satisfies(res.version, "< 1.4.0")) {
                delete AgentManager.sharedAgentSocketList[endpoint];
                delete AgentManager.sharedAgentLoggedInList[endpoint];
                this.broadcastStatus(
                    endpoint,
                    "offline",
                    `${endpoint}: Unsupported version: ` + res.version,
                );
                client.disconnect();
            }
        });
    }

    disconnect(endpoint : string): void {
        this.clearCircuitRetry(endpoint);

        const client = AgentManager.sharedAgentSocketList[endpoint];
        delete AgentManager.sharedAgentSocketList[endpoint];
        delete AgentManager.sharedAgentLoggedInList[endpoint];
        delete AgentManager.sharedReconnectFailureList[endpoint];
        delete AgentManager.sharedConfigs[endpoint];

        client?.disconnect();
        this.broadcastStatus(endpoint, "offline");
    }

    async connectAll(): Promise<void> {
        if (this.socket?.endpoint) {
            return;
        }
        this.subscribe();
    }

    disconnectAll(): void {
        this.release();
    }

    async emitToEndpoint(endpoint: string, eventName: string, ...args : unknown[]) {
        let client = AgentManager.sharedAgentSocketList[endpoint];
        let diff = dayjs().diff(this.firstConnectTime, "second");

        while (!client && diff < 10) {
            await sleep(250);
            client = AgentManager.sharedAgentSocketList[endpoint];
            diff = dayjs().diff(this.firstConnectTime, "second");
        }

        if (!client) {
            throw new Error("Socket client not found for endpoint: " + endpoint);
        }

        if (!client.connected || !AgentManager.sharedAgentLoggedInList[endpoint]) {
            diff = dayjs().diff(this.firstConnectTime, "second");
            let ok = false;

            while (diff < 10) {
                if (client.connected && AgentManager.sharedAgentLoggedInList[endpoint]) {
                    ok = true;
                    break;
                }
                await sleep(1000);
                diff = dayjs().diff(this.firstConnectTime, "second");
            }

            if (!ok) {
                throw new Error("Socket client not connected for endpoint: " + endpoint);
            }
        }

        client.emit("agent", endpoint, eventName, ...args);
    }

    requestEndpoint<T>(endpoint: string, eventName: string, ...args: unknown[]): Promise<T> {
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error(`Agent request timed out: ${endpoint}`));
            }, 60_000);

            this.emitToEndpoint(endpoint, eventName, ...args, (response: T) => {
                clearTimeout(timeout);
                resolve(response);
            }).catch((error) => {
                clearTimeout(timeout);
                reject(error);
            });
        });
    }

    emitToAllEndpoints(eventName: string, ...args : unknown[]): void {
        for (const endpoint of Object.keys(AgentManager.sharedAgentSocketList)) {
            this.emitToEndpoint(endpoint, eventName, ...args).catch((error) => {
                log.warn(
                    "agent-manager",
                    error instanceof Error ? error.message : String(error),
                );
            });
        }
    }

    async sendAgentList() {
        if (!this.socket) {
            return;
        }

        const list = await Agent.getAgentList();
        const result : Record<string, LooseObject> = {};
        const localDisplayName = await Settings.get(LOCAL_AGENT_DISPLAY_NAME_SETTING);

        result[""] = {
            url: "",
            username: "",
            endpoint: "",
            displayName: typeof localDisplayName === "string" ? localDisplayName : "",
        };

        for (const endpoint in list) {
            result[endpoint] = list[endpoint].toJSON();
        }

        this.socket.emit("agentList", {
            ok: true,
            agentList: result,
        });
    }
}
