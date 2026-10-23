import test from "node:test";
import assert from "node:assert/strict";
import { AsyncLocalStorage } from "node:async_hooks";
import { createServer } from "node:http";
import { AddressInfo } from "node:net";
import { Server } from "socket.io";
import { io } from "socket.io-client";
import { Stack } from "./stack";
import { Settings } from "./settings";
import { parseDockerPortLink, resolveEndpointHostname } from "../common/util-common";

test("linked stack responses retain each hosting instance's port preference across Socket.IO", async (t) => {
    const store = new AsyncLocalStorage<Record<string, string>>();
    t.mock.method(Settings, "get", async (key: string) => store.getStore()?.[key] || "");
    // Exercise the real Stack serializer without filesystem or Docker operations.
    const stack = Object.create(Stack.prototype) as Stack;
    t.mock.method(stack, "toSimpleJSON", (endpoint: string) => ({ name: "fixture",
        endpoint }));
    t.mock.method(stack as unknown as { readMeta(): Promise<object> }, "readMeta", async () => ({}));
    t.mock.method(stack, "readReadme", async () => "");
    const fixtures = [
        { endpoint: "192.0.2.10:5001",
            primaryHostname: "agent-one",
            portLinkAddressMode: "ip",
            portLinkIp: "" },
        { endpoint: "192.0.2.11:5001",
            primaryHostname: "agent-two",
            portLinkAddressMode: "hostname",
            portLinkIp: "" },
        { endpoint: "agent-three:5001",
            primaryHostname: "agent-three",
            portLinkAddressMode: "ip",
            portLinkIp: "192.0.2.12" },
        { endpoint: "192.0.2.13:5001",
            primaryHostname: "legacy-name",
            portLinkAddressMode: "",
            portLinkIp: "" },
    ];
    const http = createServer();
    const server = new Server(http);
    t.after(() => new Promise<void>(resolve => server.close(() => resolve())));
    server.on("connection", socket => {
        socket.on("fixtureStack", async (index: number, ack) => {
            const fixture = fixtures[index];
            const result = await store.run(fixture, () => stack.toJSON(fixture.endpoint));
            ack(result);
        });
    });
    await new Promise<void>(resolve => http.listen(0, "127.0.0.1", resolve));
    const client = io(`http://127.0.0.1:${(http.address() as AddressInfo).port}`, { reconnection: false });
    t.after(() => {
        client.disconnect();
    });
    for (const [ index, expected ] of [ "192.0.2.10", "agent-two", "192.0.2.12", "legacy-name" ].entries()) {
        const response = await client.timeout(2000).emitWithAck("fixtureStack", index);
        const host = resolveEndpointHostname(response.endpoint, undefined, "192.0.2.99", "http:", response.configuredPrimaryHostname, response.portLinkAddressMode, response.portLinkIp);
        assert.equal(host, expected);
        assert.equal(new URL(parseDockerPortLink("55480:80", host, response.portLinkAddressMode).url).hostname, expected);
    }
});
