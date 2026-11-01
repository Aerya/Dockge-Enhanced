import test from "node:test";
import assert from "node:assert/strict";
import {
    parseResolvedComposeModel,
    resolveNetworkNamespaceRecreateTargets,
    targetedComposeRecreateArgs,
    targetedComposeRecreateArgsForTargets,
    restartComposeServices,
} from "./compose-network-namespace";

const model = (services: Record<string, { network_mode?: string;
    container_name?: string }>) => ({ services });

test("keeps a provider without consumers as the only target", () => {
    assert.deepEqual(resolveNetworkNamespaceRecreateTargets(model({ app: {} }), [ "app" ]), [ "app" ]);
});

test("restart waits for the namespace provider before its consumer, regardless of YAML order", async () => {
    const calls: string[][] = [];
    let release!: () => void;
    const barrier = new Promise<void>(resolve => {
        release = resolve;
    });
    const operation = restartComposeServices(model({
        app: { network_mode: "service:vpn" },
        vpn: {},
    }), undefined, async (...args) => {
        calls.push(args);
        if (args.at(-1) === "vpn") {
            await barrier;
        }
    });
    await Promise.resolve();
    assert.deepEqual(calls, [[ "restart", "--no-deps", "vpn" ]]);
    release();
    await operation;
    assert.deepEqual(calls, [[ "restart", "--no-deps", "vpn" ], [ "restart", "--no-deps", "app" ]]);
});

test("targeted restart includes transitive consumers but never an unrelated service", async () => {
    const calls: string[][] = [];
    await restartComposeServices(model({
        unrelated: {},
        app: { network_mode: "container:proxy-fixed" },
        proxy: { network_mode: "service:vpn",
            container_name: "proxy-fixed" },
        vpn: {},
    }), [ "vpn" ], async (...args) => {
        calls.push(args);
    });
    assert.deepEqual(calls, [ "vpn", "proxy", "app" ].map(name => [ "restart", "--no-deps", name ]));
});

test("provider restart failure stops before consumers and is propagated", async () => {
    const calls: string[][] = [];
    await assert.rejects(restartComposeServices(model({ vpn: {},
        app: { network_mode: "service:vpn" } }), [ "vpn" ], async (...args) => {
        calls.push(args);
        throw new Error("Docker refused restart");
    }), /Docker refused restart/);
    assert.equal(calls.length, 1);
});

test("stacks without shared network namespaces retain their original restart command", async () => {
    const calls: string[][] = [];
    const simple = model({ web: {},
        worker: {} });
    await restartComposeServices(simple, undefined, async (...args) => {
        calls.push(args);
    });
    await restartComposeServices(simple, [ "worker" ], async (...args) => {
        calls.push(args);
    });
    assert.deepEqual(calls, [[ "restart" ], [ "restart", "worker" ]]);
});

test("cyclic network namespaces fail before any restart", async () => {
    let calls = 0;
    await assert.rejects(restartComposeServices(model({
        a: { network_mode: "service:b" },
        b: { network_mode: "service:a" },
    }), undefined, async () => {
        calls++;
    }), /cyclic/);
    assert.equal(calls, 0);
});

test("an empty restart selection never becomes a whole-stack restart", async () => {
    let calls = 0;
    await assert.rejects(restartComposeServices(model({ app: {} }), [], async () => {
        calls++;
    }), /no service was selected/);
    assert.equal(calls, 0);
});

test("includes a service namespace consumer", () => {
    assert.deepEqual(resolveNetworkNamespaceRecreateTargets(model({
        vpn: {},
        app: { network_mode: "service:vpn" },
    }), [ "vpn" ]), [ "vpn", "app" ]);
});

test("resolves a container namespace through the provider container_name", () => {
    assert.deepEqual(resolveNetworkNamespaceRecreateTargets(model({
        provider: { container_name: "stable-provider" },
        browser: { network_mode: "container:stable-provider" },
    }), [ "provider" ]), [ "provider", "browser" ]);
});

test("orders multiple consumers deterministically without duplicates", () => {
    assert.deepEqual(resolveNetworkNamespaceRecreateTargets(model({
        vpn: { container_name: "vpn-container" },
        zeta: { network_mode: "service:vpn" },
        alpha: { network_mode: "container:vpn-container" },
        duplicatePath: { network_mode: "service:alpha" },
    }), [ "vpn", "vpn" ]), [ "vpn", "alpha", "zeta", "duplicatePath" ]);
});

test("includes transitive namespace consumers", () => {
    assert.deepEqual(resolveNetworkNamespaceRecreateTargets(model({
        vpn: {},
        proxy: {
            network_mode: "service:vpn",
            container_name: "proxy-container",
        },
        browser: { network_mode: "container:proxy-container" },
    }), [ "vpn" ]), [ "vpn", "proxy", "browser" ]);
});

test("supports providers without container_name", () => {
    assert.deepEqual(resolveNetworkNamespaceRecreateTargets(model({
        vpn: {},
        app: { network_mode: "service:vpn" },
    }), [ "vpn" ]), [ "vpn", "app" ]);
});

test("ignores container references external to the Compose project", () => {
    assert.deepEqual(resolveNetworkNamespaceRecreateTargets(model({
        app: {},
        external: { network_mode: "container:host-vpn" },
    }), [ "app" ]), [ "app" ]);
});

test("builds the explicit safe recreate command used by updates and rollbacks", () => {
    const composeModel = model({
        vpn: { container_name: "vpn-container" },
        app: { network_mode: "container:vpn-container" },
    });
    assert.deepEqual(targetedComposeRecreateArgs(composeModel, [ "vpn" ]), [
        "up", "-d", "--force-recreate", "--no-deps", "vpn", "app",
    ]);
});

test("fails explicitly when the resolved Compose model cannot be read", () => {
    assert.throws(
        () => parseResolvedComposeModel("not-json"),
        /Unable to resolve Compose network namespace dependencies/,
    );
    assert.throws(
        () => parseResolvedComposeModel("{}"),
        /docker compose config returned no services/,
    );
});

test("fails safely when the requested service is absent", () => {
    assert.throws(
        () => resolveNetworkNamespaceRecreateTargets(model({ app: {} }), [ "missing" ]),
        /service "missing" is not present/,
    );
});

test("never turns an empty target list into a whole-stack recreation", () => {
    assert.throws(
        () => targetedComposeRecreateArgsForTargets([]),
        /no service was selected for targeted recreation/,
    );
});
