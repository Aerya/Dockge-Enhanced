import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { Stack } from "./stack";
import { Terminal } from "./terminal";
import type { DockgeSocket } from "./util-server";

test("real Docker: scheduled start repairs a recreated external network without replacing the sibling", {
    skip: process.env.DOCKGE_NETWORK_REPAIR_INTEGRATION !== "1",
}, async t => {
    assert.match(process.env.DOCKER_HOST || "", /^unix:\/\/.*\/docker\.sock$/);
    assert.notEqual(process.env.DOCKER_HOST, "unix:///var/run/docker.sock", "Use an isolated Docker daemon only");
    const directory = await mkdtemp(path.join(tmpdir(), "network-repair-"));
    const project = path.basename(directory).toLowerCase();
    const network = `${project}-external`;
    const file = path.join(directory, "compose.yaml");
    const docker = (...args: string[]) => execFileSync("docker", args, { encoding: "utf8",
        timeout: 30_000,
        stdio: [ "ignore", "pipe", "pipe" ] }).trim();
    const compose = (...args: string[]) => docker("compose", "-p", project, "-f", file, ...args);
    try {
        await writeFile(file, JSON.stringify({ services: {
            app: { image: "busybox:stable",
                command: [ "sleep", "600" ],
                labels: { "dockge.start.repair-network": "true" },
                networks: [ "external" ] },
            sibling: { image: "busybox:stable",
                command: [ "sleep", "600" ],
                network_mode: "none" },
        },
        networks: { external: { external: true,
            name: network } } }));
        docker("network", "create", network);
        compose("up", "-d");
        const before = compose("ps", "-q", "app");
        const sibling = compose("ps", "-q", "sibling");
        compose("stop", "-t", "0", "app");
        docker("network", "rm", network);
        docker("network", "create", network);
        assert.throws(() => compose("up", "-d"), /network .* not found/);
        const stack = Object.create(Stack.prototype) as Stack;
        Object.defineProperties(stack, { name: { value: project },
            path: { value: directory },
            server: { value: {} },
            assertStartGuard: { value: async () => {} },
            writeMeta: { value: async () => {} },
            getComposeOptions: { value: (...args: string[]) => [ "compose", "-p", project, "-f", file, ...args ] } });
        assert.equal(await stack.startScheduled(), 0);
        const repaired = compose("ps", "-q", "app");
        assert.ok(repaired);
        assert.notEqual(repaired, before);
        assert.equal(compose("ps", "-q", "sibling"), sibling);
        assert.equal(await stack.startScheduled(), 0);
        assert.equal(compose("ps", "-q", "app"), repaired, "a subsequent start must not recreate a healthy attachment");
        t.mock.method(Terminal, "exec", async (...parameters: Parameters<typeof Terminal.exec>) => {
            docker(...parameters[4] as string[]);
            return 0;
        });
        const socket = { endpoint: "" } as DockgeSocket;
        for (const start of [
            () => stack.serviceScheduled("app", "start"),
            () => stack.start(socket),
            () => stack.deploy(socket),
            () => stack.serviceAction(socket, "app", "start", async targets => {
                assert.deepEqual(targets, [ "app" ], "linked/scoped service authorization cannot expand to siblings");
            }),
        ]) {
            const previous = compose("ps", "-q", "app");
            compose("stop", "-t", "0", "app");
            docker("network", "rm", network);
            docker("network", "create", network);
            await start();
            assert.notEqual(compose("ps", "-q", "app"), previous);
            assert.equal(compose("ps", "-q", "sibling"), sibling);
        }
    } finally {
        try {
            compose("down", "-t", "0");
        } finally {
            docker("network", "rm", network);
            await rm(directory, { recursive: true,
                force: true });
        }
    }
});
