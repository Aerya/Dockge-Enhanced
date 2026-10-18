import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { hostname } from "node:os";
import { readFileSync } from "node:fs";
import type { Server, Socket } from "socket.io";
import { io, type Socket as Client } from "socket.io-client";
import { R } from "redbean-node";
import { Agent } from "./models/agent";
import { User } from "./models/user";
import { AgentManager } from "./agent-manager";
import type { DockgeServer } from "./dockge-server";
import { log } from "./log";

export const REVERSE_AGENT_USERNAME = "__dockge_reverse_agent__";
const NAMESPACE = "/reverse-agent";
const TOKEN_PATTERN = /^([a-f0-9-]{36})\.([A-Za-z0-9_-]{43})$/;

export function newReverseCredential() {
    const id = randomUUID();
    const token = `${id}.${randomBytes(32).toString("base64url")}`;
    return { id,
        token,
        hash: createHash("sha256").update(token).digest("hex") };
}

export function reverseCredentialMatches(token: unknown, hash: string): boolean {
    if (typeof token !== "string" || !TOKEN_PATTERN.test(token) || !/^[a-f0-9]{64}$/.test(hash)) {
        return false;
    }
    return timingSafeEqual(createHash("sha256").update(token).digest(), Buffer.from(hash, "hex"));
}

export function reverseHubURL(value: string): string {
    const url = new URL(value);
    if (![ "http:", "https:" ].includes(url.protocol) || url.username || url.password || url.search || url.hash || ![ "", "/" ].includes(url.pathname)) {
        throw new Error("Reverse hub must be an HTTP(S) origin without credentials, path or query");
    }
    return url.origin;
}

export async function issueReverseAgent(name: string, userId: number): Promise<{ token: string;
    endpoint: string }> {
    const credential = newReverseCredential();
    const agent = R.dispense("agent") as Agent;
    agent.url = `reverse://${credential.id}`;
    agent.username = REVERSE_AGENT_USERNAME;
    agent.password = JSON.stringify({ hash: credential.hash,
        userId });
    agent.display_name = name;
    await R.store(agent);
    await AgentManager.refreshFromDatabase();
    return { token: credential.token,
        endpoint: credential.id };
}

async function authorizeReverse(token: unknown): Promise<Agent> {
    const match = typeof token === "string" && token.match(TOKEN_PATTERN);
    if (!match) {
        throw new Error("Invalid reverse agent credential");
    }
    const agent = await R.findOne("agent", " url = ? AND username = ? ", [ `reverse://${match[1]}`, REVERSE_AGENT_USERNAME ]) as Agent | null;
    const stored = agent && JSON.parse(agent.password);
    if (!agent || !stored || !reverseCredentialMatches(token, stored.hash) || !await R.findOne("user", " id = ? AND active = 1 ", [ stored.userId ])) {
        throw new Error("Invalid reverse agent credential");
    }
    return agent;
}

/** A reverse credential admits one node only; this namespace exposes no hub RPCs. */
export function installReverseHub(ioServer: Server, authorize = authorizeReverse): void {
    const namespace = ioServer.of(NAMESPACE);
    const attempts = new Map<string, { time: number;
        count: number }>();
    namespace.use(async (socket, next) => {
        const key = socket.handshake.address;
        const now = Date.now();
        const previous = attempts.get(key);
        const attempt = previous && now - previous.time < 60_000 ? previous : { time: now,
            count: 0 };
        attempt.count++;
        if (attempts.size > 4096) {
            attempts.clear();
        }
        attempts.set(key, attempt);
        if (attempt.count > 20) {
            next(new Error("Reverse agent connection rate limited"));
            return;
        }
        try {
            socket.data.agent = await authorize(socket.handshake.auth.token);
            next();
        } catch {
            next(new Error("Reverse agent authentication failed"));
        }
    });
    namespace.on("connection", (socket: Socket) => {
        const agent = socket.data.agent as Agent;
        let attached = false;
        const attachTimer = setTimeout(() => socket.disconnect(true), 15_000);
        // Keep revocation effective even when the node has no active requests.
        const revocationTimer = setInterval(() => {
            void authorize(socket.handshake.auth.token).catch(() => socket.disconnect(true));
        }, 30_000);
        socket.on("ready", async (details: unknown, acknowledge?: () => void) => {
            if (attached) {
                return;
            }
            attached = true;
            try {
                await authorize(socket.handshake.auth.token);
            } catch {
                socket.disconnect(true);
                return;
            }
            clearTimeout(attachTimer);
            const name = details && typeof details === "object" ? (details as { hostname?: unknown }).hostname : undefined;
            if (!agent.display_name && typeof name === "string" && /^[a-zA-Z0-9._-]{1,100}$/.test(name)) {
                try {
                    agent.display_name = name;
                    await R.store(agent);
                } catch {
                    socket.disconnect(true);
                    return;
                }
            }
            if (!socket.connected) {
                return;
            }
            AgentManager.attachReverse(agent.endpoint, socket);
            if (typeof acknowledge === "function") {
                acknowledge();
            }
        });
        socket.on("disconnect", () => {
            clearTimeout(attachTimer);
            clearInterval(revocationTimer);
        });
    });
}

/** Bridge only local agent RPCs, using an existing local federation identity. */
export function bridgeReverseNode(remote: Client, local: Client, endpoint: string): () => void {
    const forward = (event: unknown, ...args: unknown[]) => {
        if (remote.connected && typeof event === "string") {
            remote.emit("agent-event", event, ...args);
        }
    };
    const command = (event: unknown, args: unknown, ack?: (result: unknown) => void) => {
        if (typeof event !== "string" || !Array.isArray(args) || !local.connected) {
            ack?.({ ok: false,
                msg: "Reverse agent local transport unavailable" });
            return;
        }
        if (typeof ack === "function") {
            local.timeout(30 * 60_000).emit("agent", endpoint, event, ...args, (error: Error | null, result: unknown) => {
                ack(error ? { ok: false,
                    msg: "Reverse agent response timed out; the operation may still be running. Check its state before retrying." } : result);
            });
        } else {
            local.emit("agent", endpoint, event, ...args);
        }
    };
    local.on("agent", forward);
    remote.on("command", command);
    return () => {
        local.off("agent", forward);
        remote.off("command", command);
    };
}

let stopNode: (() => void) | undefined;

export function stopReverseNode(): void {
    stopNode?.();
    stopNode = undefined;
}

export function startReverseNode(server: DockgeServer): void {
    if (!process.env.DOCKGE_REVERSE_HUB_URL) {
        return;
    }
    const hub = reverseHubURL(process.env.DOCKGE_REVERSE_HUB_URL);
    const token = (process.env.DOCKGE_REVERSE_TOKEN_FILE
        ? readFileSync(process.env.DOCKGE_REVERSE_TOKEN_FILE, "utf8")
        : process.env.DOCKGE_REVERSE_TOKEN || "").trim();
    const match = token.match(TOKEN_PATTERN);
    if (!match) {
        throw new Error("A valid DOCKGE_REVERSE_TOKEN or DOCKGE_REVERSE_TOKEN_FILE is required");
    }
    const endpoint = match[1];
    let stopped = false;
    let generation = 0;
    let retry: NodeJS.Timeout | undefined;
    let remote: Client | undefined;
    let local: Client | undefined;
    let detach: (() => void) | undefined;
    const clearConnections = () => {
        generation++;
        detach?.();
        remote?.removeAllListeners();
        local?.removeAllListeners();
        remote?.disconnect();
        local?.disconnect();
    };
    const reconnect = () => {
        if (stopped || retry) {
            return;
        }
        clearConnections();
        retry = setTimeout(() => {
            retry = undefined;
            void connect();
        }, 30_000 + Math.floor(Math.random() * 15_000));
    };
    const connect = async () => {
        const attempt = ++generation;
        try {
            const user = await R.findOne("user", " active = 1 ") as User | null;
            if (stopped || attempt !== generation) {
                return;
            }
            if (!user || server.needSetup) {
                log.warn("reverse-agent", "Complete local account setup before connecting the reverse agent");
                reconnect();
                return;
            }
            const protocol = server.config.sslKey && server.config.sslCert ? "https" : "http";
            const address = server.config.hostname && ![ "0.0.0.0", "::" ].includes(server.config.hostname) ? server.config.hostname : "127.0.0.1";
            const host = address.includes(":") ? `[${address}]` : address;
            local = io(`${protocol}://${host}:${server.config.port}`, { reconnection: false,
                timeout: 10_000,
                extraHeaders: { endpoint } });
            local.on("connect_error", reconnect);
            local.on("disconnect", reconnect);
            local.on("connect", () => {
                local!.timeout(10_000).emit("loginByToken", User.createFederationJWT(user, server.jwtSecret), (error: Error | null, response: { ok?: boolean }) => {
                    if (stopped || attempt !== generation) {
                        return;
                    }
                    if (error || !response?.ok) {
                        reconnect();
                        return;
                    }
                    remote = io(`${hub}${NAMESPACE}`, { auth: { token },
                        reconnection: false,
                        timeout: 10_000 });
                    detach = bridgeReverseNode(remote, local!, endpoint);
                    remote.on("connect_error", () => {
                        log.warn("reverse-agent", "Hub unavailable or credential rejected; retrying later");
                        reconnect();
                    });
                    remote.on("disconnect", reconnect);
                    remote.on("connect", () => {
                        remote!.timeout(10_000).emit("ready", { hostname: hostname() }, (error: Error | null) => {
                            if (stopped || attempt !== generation) {
                                return;
                            }
                            if (error) {
                                reconnect();
                                return;
                            }
                            local!.emit("agent", endpoint, "requestStackList", () => {});
                            log.info("reverse-agent", "Reverse agent connected");
                        });
                    });
                });
            });
        } catch {
            log.warn("reverse-agent", "Unable to initialize reverse transport; retrying later");
            reconnect();
        }
    };
    stopReverseNode();
    stopNode = () => {
        stopped = true;
        clearTimeout(retry);
        clearConnections();
    };
    void connect();
}
