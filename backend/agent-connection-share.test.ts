import assert from "node:assert/strict";
import test from "node:test";
import { Agent } from "./models/agent";
import { shareTargets, sharedConnection, shareAgentConnection } from "./agent-connection-share";
import { callPeer } from "./agent-mesh";

const agents = {
    remote: { url: "https://remote.example",
        oneWay: true },
    first: { url: "https://first.example",
        oneWay: false },
    second: { url: "http://second.example",
        oneWay: false },
    reverse: { url: "reverse://node",
        oneWay: false },
} as unknown as Record<string, Agent>;

test("offline or incompatible recipients receive no source credentials and do not block other targets", async () => {
    const list = { ...agents,
        remote: { ...agents.remote,
            username: "remote-user",
            password: "source-secret",
            connection_options: { oneWay: true,
                proxyUsername: "",
                proxyPassword: "" } } } as unknown as Record<string, Agent>;
    for (const failure of [ "offline", "old" ]) {
        const sent: string[] = [];
        const result = await shareAgentConnection("remote", [ "first", "second" ], true, {
            getAgents: async () => list,
            callPeer: (async (peer, event, data) => {
                if (event === "getAgentConnectionShareCapabilities") {
                    assert.deepEqual(data, {});
                    if (peer.url === agents.first.url) {
                        if (failure === "offline") {
                            throw new Error("secret remote diagnostic must never escape");
                        }
                        return { version: 0 };
                    }
                    return { version: 1 };
                }
                sent.push(peer.url);
                return { ok: true };
            }) as typeof callPeer,
        });
        assert.deepEqual(sent, [ agents.second.url ]);
        assert.deepEqual(result.map(item => item.ok), [ false, true ]);
        assert.ok(!JSON.stringify(result).includes("secret"));
    }
});

test("sharing only includes explicitly selected existing direct peers", () => {
    assert.deepEqual(shareTargets(agents, "remote", [ "first" ], true), [ "first" ]);
    assert.deepEqual(shareTargets(agents, "remote", [ "first", "second" ], true), [ "first", "second" ]);
});

test("rejects missing consent, self, recursive, unknown and duplicate targets before sending secrets", () => {
    for (const targets of [[], [ "remote" ], [ "reverse" ], [ "missing" ], [ "first", "first" ], [ "__proto__" ], [ 12 ], [ "" ]]) {
        assert.throws(() => shareTargets(agents, "remote", targets, true));
    }
    assert.throws(() => shareTargets(agents, "remote", [ "first" ], false));
    assert.throws(() => shareTargets(agents, "remote", [ "first" ], "true"));
    assert.throws(() => shareTargets(agents, "first", [ "second" ], true));
    assert.throws(() => shareTargets(agents, "__proto__", [ "first" ], true));
});

test("receiver only accepts one-way configurations with validated HTTPS proxy credentials", () => {
    const peer = { url: "https://remote.example",
        username: "user",
        password: "enhanced-secret",
        displayName: "Remote",
        connectionOptions: { oneWay: true,
            proxyUsername: "proxy-user",
            proxyPassword: "proxy-secret" } };
    const result = sharedConnection(peer);
    assert.equal(JSON.parse(result.connectionOptions).oneWay, true);
    assert.equal(result.password, "enhanced-secret");
    assert.throws(() => sharedConnection({ ...peer,
        url: "http://remote.example" }));
    assert.throws(() => sharedConnection({ ...peer,
        connectionOptions: { oneWay: false } }));
    assert.throws(() => sharedConnection({ ...peer,
        connectionOptions: { oneWay: true,
            proxyUsername: "user" } }));
});
