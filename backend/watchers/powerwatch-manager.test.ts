import assert from "node:assert/strict";
import test from "node:test";
import {
    buildPowerWatchCompose,
    DEFAULT_POWERWATCH_SETTINGS,
    PowerWatchManager,
    validatePowerWatchUrl,
} from "./powerwatch-manager";

function result(stdout = "", code = 0, stderr = "") {
    return { stdout,
        stderr,
        code };
}

function managerWith(overrides: {
    docker?: (args: string[]) => Promise<ReturnType<typeof result>>;
    fetchJson?: (url: string, timeout: number) => Promise<unknown>;
    now?: () => number;
} = {}) {
    return new PowerWatchManager({
        docker: overrides.docker ?? (async () => result()),
        fetchJson: overrides.fetchJson ?? (async () => ({ timestamp: "2026-10-08T00:00:00Z",
            total: { watts: 42.7,
                confidence: "Measured" } })),
        platform: () => "linux",
        now: overrides.now ?? (() => 1000),
    });
}

test("external HTTP normalizes snapshots and rejects unsafe URLs", async () => {
    let requested = "";
    const manager = managerWith({ fetchJson: async (url) => {
        requested = url;
        return { timestamp: "2026-10-08T00:00:00Z",
            total: { watts: 42.7,
                confidence: "Measured" } };
    } });
    manager.settings = { ...DEFAULT_POWERWATCH_SETTINGS,
        enabled: true,
        apiUrl: "https://example.test/reverse/powerwatch",
        webUrl: "https://power.example.test" };
    const snapshot = await manager.getSnapshot();
    assert.equal(requested, "https://example.test/reverse/powerwatch/api/snapshot");
    assert.equal(snapshot.reachable, true);
    assert.equal(snapshot.totalWatts, 42.7);
    assert.equal(snapshot.confidence, "Measured");
    assert.equal(snapshot.webUrl, "https://power.example.test");
    assert.throws(() => validatePowerWatchUrl("file:///tmp/data", "apiUrl"));
    assert.throws(() => validatePowerWatchUrl("http://user:secret@example.test", "apiUrl"));
});

test("disabled mode makes no request and invalid watts become null", async () => {
    let calls = 0;
    const manager = managerWith({ fetchJson: async () => {
        calls += 1;
        return { total: { watts: "bad",
            confidence: "Estimated" } };
    } });
    assert.equal((await manager.getSnapshot()).enabled, false);
    assert.equal(calls, 0);
    manager.settings = { ...DEFAULT_POWERWATCH_SETTINGS,
        enabled: true,
        apiUrl: "http://power.test" };
    const snapshot = await manager.getSnapshot(true);
    assert.equal(snapshot.totalWatts, null);
    assert.equal(snapshot.confidence, "Estimated");
});

test("a reachable snapshot with total null exposes no watts", async () => {
    const manager = managerWith({ fetchJson: async () => ({ timestamp: "2026-10-08T00:00:00Z",
        total: null }) });
    manager.settings = { ...DEFAULT_POWERWATCH_SETTINGS,
        enabled: true,
        apiUrl: "http://power.test" };
    const snapshot = await manager.getSnapshot();
    assert.equal(snapshot.reachable, true);
    assert.equal(snapshot.totalWatts, null);
    assert.equal(snapshot.confidence, null);
});

test("HTTP failures are non-blocking and clear current watts", async () => {
    const manager = managerWith({ fetchJson: async () => {
        throw new Error("HTTP 500");
    } });
    manager.settings = { ...DEFAULT_POWERWATCH_SETTINGS,
        enabled: true,
        apiUrl: "http://power.test" };
    const snapshot = await manager.getSnapshot();
    assert.equal(snapshot.reachable, false);
    assert.equal(snapshot.totalWatts, null);
    assert.match(snapshot.lastError ?? "", /HTTP 500/);
    assert.equal(snapshot.status, "offline");
});

test("PowerWatch Hub uses its documented snapshot endpoint and remains optional", async () => {
    let requested = "";
    const manager = managerWith({ fetchJson: async (url) => {
        requested = url;
        return { nodes: [] };
    } });
    assert.deepEqual(await manager.getHubStatus(), { enabled: false,
        reachable: false,
        webUrl: null });
    manager.settings = { ...DEFAULT_POWERWATCH_SETTINGS,
        hubEnabled: true,
        hubWebUrl: "https://hub.example.test/powerwatch" };
    const status = await manager.getHubStatus();
    assert.equal(requested, "https://hub.example.test/powerwatch/api/hub/snapshot");
    assert.equal(status.reachable, true);
    assert.equal(status.webUrl, "https://hub.example.test/powerwatch");
});

test("PowerWatch Hub failures do not affect individual PowerWatch settings", async () => {
    const manager = managerWith({ fetchJson: async () => {
        throw new Error("request timed out");
    } });
    manager.settings = { ...DEFAULT_POWERWATCH_SETTINGS,
        enabled: true,
        apiUrl: "http://power.example.test",
        hubEnabled: true,
        hubWebUrl: "http://hub.example.test" };
    const status = await manager.getHubStatus();
    assert.equal(status.reachable, false);
    assert.match(status.lastError ?? "", /timed out/);
    assert.equal(manager.settings.apiUrl, "http://power.example.test");
});

test("HTTP timeout and invalid JSON failures stay non-blocking", async (t) => {
    for (const error of [ new Error("request timed out"), new SyntaxError("Unexpected token") ]) {
        await t.test(error.message, async () => {
            const manager = managerWith({ fetchJson: async (_url, timeout) => {
                assert.equal(timeout, 4000);
                throw error;
            } });
            manager.settings = { ...DEFAULT_POWERWATCH_SETTINGS,
                enabled: true,
                apiUrl: "http://power.test" };
            const snapshot = await manager.getSnapshot();
            assert.equal(snapshot.reachable, false);
            assert.equal(snapshot.totalWatts, null);
            assert.equal(snapshot.status, "offline");
        });
    }
});

test("cache and concurrent reads share one in-flight request", async () => {
    let calls = 0;
    let release!: () => void;
    const pending = new Promise<void>((resolve) => {
        release = resolve;
    });
    const manager = managerWith({ fetchJson: async () => {
        calls += 1;
        await pending;
        return { total: { watts: 7.34 } };
    } });
    manager.settings = { ...DEFAULT_POWERWATCH_SETTINGS,
        enabled: true,
        apiUrl: "http://power.test" };
    const first = manager.getSnapshot();
    const second = manager.getSnapshot();
    release();
    assert.equal((await first).totalWatts, 7.34);
    assert.equal((await second).totalWatts, 7.34);
    assert.equal((await manager.getSnapshot()).totalWatts, 7.34);
    assert.equal(calls, 1);
});

test("local external container is validated and only queried with fixed exec arguments", async () => {
    const commands: string[][] = [];
    const manager = managerWith({ docker: async (args) => {
        commands.push(args);
        if (args[0] === "inspect") {
            return result(JSON.stringify([{ Config: { Image: "ghcr.io/aerya/powerwatch:latest" },
                State: { Running: true },
                HostConfig: { PortBindings: { "3000/tcp": [{ HostPort: "3064" }] } } }]));
        }
        if (args[0] === "exec") {
            return result(JSON.stringify({ total: { watts: 18.4,
                confidence: "Measured" } }));
        }
        return result();
    } });
    manager.settings = { ...DEFAULT_POWERWATCH_SETTINGS,
        enabled: true,
        externalContainer: "powerwatch-existing" };
    const snapshot = await manager.getSnapshot();
    assert.equal(snapshot.totalWatts, 18.4);
    assert.equal(snapshot.webUrl, "http://127.0.0.1:3064");
    assert.deepEqual(commands.at(-1), [ "exec", "powerwatch-existing", "curl", "--fail", "--silent", "--show-error", "--max-time", "4", "http://127.0.0.1:3000/api/snapshot" ]);
    assert.equal(commands.some((args) => [ "stop", "rm", "start" ].includes(args[0])), false);
});

test("external local containers report stopped, curl and JSON errors without lifecycle operations", async (t) => {
    const cases = [
        { name: "stopped",
            running: false,
            execResult: result(),
            expectedStatus: "stopped" },
        { name: "curl failure",
            running: true,
            execResult: result("", 22, "connection refused"),
            expectedStatus: "offline" },
        { name: "invalid JSON",
            running: true,
            execResult: result("not-json"),
            expectedStatus: "offline" },
    ];
    for (const fixture of cases) {
        await t.test(fixture.name, async () => {
            const commands: string[][] = [];
            const manager = managerWith({ docker: async (args) => {
                commands.push(args);
                if (args[0] === "inspect") {
                    return result(JSON.stringify([{ Config: { Image: "ghcr.io/aerya/powerwatch:latest" },
                        State: { Running: fixture.running },
                        HostConfig: { PortBindings: {} } }]));
                }
                if (args[0] === "exec") {
                    return fixture.execResult;
                }
                return result();
            } });
            manager.settings = { ...DEFAULT_POWERWATCH_SETTINGS,
                enabled: true,
                externalContainer: "powerwatch-existing" };
            const snapshot = await manager.getSnapshot();
            assert.equal(snapshot.reachable, false);
            assert.equal(snapshot.webUrl, null);
            assert.equal(snapshot.status, fixture.expectedStatus);
            assert.equal(commands.some((args) => [ "stop", "rm", "start" ].includes(args[0])), false);
        });
    }
});

test("detection lists multiple official PowerWatch containers without controlling them", async () => {
    const commands: string[][] = [];
    const inspections = new Map([
        [ "first", { Name: "/powerwatch-a",
            Config: { Image: "ghcr.io/aerya/powerwatch:latest" },
            State: { Running: true },
            HostConfig: { PortBindings: { "3000/tcp": [{ HostPort: "3064" }] } } }],
        [ "second", { Name: "/powerwatch-b",
            Config: { Image: "ghcr.io/aerya/powerwatch:v1" },
            State: { Running: false },
            HostConfig: { PortBindings: {} } }],
        [ "other", { Name: "/not-powerwatch",
            Config: { Image: "example/other:latest" },
            State: { Running: true },
            HostConfig: { PortBindings: {} } }],
    ]);
    const manager = managerWith({ docker: async (args) => {
        commands.push(args);
        if (args[0] === "ps") {
            return result("first\nsecond\nother\n");
        }
        if (args[0] === "inspect") {
            return result(JSON.stringify([ inspections.get(args[1]) ]));
        }
        if (args[0] === "run") {
            return result("powercap\nnvidia-device\n");
        }
        if (args[0] === "info") {
            return result("{\"nvidia\":{}}");
        }
        return result();
    } });
    const detection = await manager.detect();
    assert.deepEqual(detection.containers, [
        { name: "powerwatch-a",
            image: "ghcr.io/aerya/powerwatch:latest",
            state: "running",
            hostPort: 3064 },
        { name: "powerwatch-b",
            image: "ghcr.io/aerya/powerwatch:v1",
            state: "stopped",
            hostPort: null },
    ]);
    assert.deepEqual(detection.capabilities, { linux: true,
        powercap: true,
        msr: false,
        nvidia: true });
    assert.equal(commands.some((args) => [ "stop", "rm", "start" ].includes(args[0])), false);
});

test("managed compose enables only available optional hardware", () => {
    const base = { ...DEFAULT_POWERWATCH_SETTINGS,
        enabled: true,
        mode: "managed" as const,
        hostPort: 3456,
        bindAddress: "127.0.0.1" };
    const cpu = buildPowerWatchCompose(base, { linux: true,
        powercap: true,
        msr: true,
        nvidia: false });
    assert.match(cpu, /127\.0\.0\.1:3456:3000/);
    assert.match(cpu, /com\.dockge-enhanced\.managed: powerwatch/);
    assert.match(cpu, /powerwatch_dockge_data/);
    assert.match(cpu, /no-new-privileges:true/);
    assert.match(cpu, /read_only: true/);
    assert.doesNotMatch(cpu, /privileged:/);
    assert.doesNotMatch(cpu, /SYS_RAWIO/);
    assert.doesNotMatch(cpu, /driver: nvidia/);

    const optional = buildPowerWatchCompose({ ...base,
        msrMode: "enabled",
        nvidiaMode: "enabled" }, { linux: true,
        powercap: false,
        msr: true,
        nvidia: true });
    assert.match(optional, /SYS_RAWIO/);
    assert.match(optional, /\/dev\/cpu\/0\/msr/);
    assert.match(optional, /driver: nvidia/);
    assert.match(optional, /NVIDIA_DRIVER_CAPABILITIES: utility/);

    const noOptionalHardware = buildPowerWatchCompose(base, { linux: true,
        powercap: false,
        msr: false,
        nvidia: false });
    assert.doesNotMatch(noOptionalHardware, /SYS_RAWIO/);
    assert.doesNotMatch(noOptionalHardware, /driver: nvidia/);

    const ipv6 = buildPowerWatchCompose({ ...base,
        bindAddress: "2001:db8::2" }, { linux: true,
        powercap: true,
        msr: false,
        nvidia: false });
    assert.match(ipv6, /\[2001:db8::2\]:3456:3000/);
});

test("managed ownership collision blocks lifecycle operations", async () => {
    const commands: string[][] = [];
    const manager = managerWith({ docker: async (args) => {
        commands.push(args);
        if (args[0] === "inspect") {
            return result(JSON.stringify([{ Config: { Image: "ghcr.io/aerya/powerwatch:latest",
                Labels: {} },
            State: { Running: true } }]));
        }
        return result();
    } });
    manager.settings = { ...DEFAULT_POWERWATCH_SETTINGS,
        enabled: true,
        mode: "managed" };
    await assert.rejects(() => manager.stop(), /not owned/);
    assert.equal(commands.some((args) => args.includes("down")), false);
});

test("forced unavailable hardware blocks managed start before Compose is written", async (t) => {
    for (const mode of [ "msr", "nvidia" ] as const) {
        await t.test(mode, async () => {
            const commands: string[][] = [];
            const manager = managerWith({ docker: async (args) => {
                commands.push(args);
                if (args[0] === "inspect") {
                    return result("", 1, "not found");
                }
                if (args[0] === "ps") {
                    return result("");
                }
                if (args[0] === "run" || args[0] === "info") {
                    return result("");
                }
                return result();
            } });
            manager.settings = { ...DEFAULT_POWERWATCH_SETTINGS,
                enabled: true,
                mode: "managed",
                ...(mode === "msr" ? { msrMode: "enabled" as const } : { nvidiaMode: "enabled" as const }) };
            await assert.rejects(() => manager.start(), new RegExp(mode, "i"));
            assert.equal(commands.some((args) => args[0] === "compose"), false);
        });
    }
});

test("managed lifecycle cannot start while the integration is disabled", async () => {
    const manager = managerWith();
    manager.settings = { ...DEFAULT_POWERWATCH_SETTINGS,
        mode: "managed" };
    await assert.rejects(() => manager.start(), /not enabled/);
});

test("managed stop keeps the persistent volume and requires full Compose ownership", async () => {
    const commands: string[][] = [];
    const manager = managerWith({ docker: async (args) => {
        commands.push(args);
        if (args[0] === "inspect") {
            return result(JSON.stringify([{ Config: { Image: "ghcr.io/aerya/powerwatch:latest",
                Labels: {
                    "com.dockge-enhanced.managed": "powerwatch",
                    "com.dockge-enhanced.integration": "powerwatch",
                    "com.docker.compose.project": "powerwatch-dockge-enhanced",
                    "com.docker.compose.service": "powerwatch",
                } },
            State: { Running: true } }]));
        }
        return result();
    } });
    manager.settings = { ...DEFAULT_POWERWATCH_SETTINGS,
        enabled: true,
        mode: "managed" };
    await manager.stop();
    const down = commands.find((args) => args[0] === "compose");
    assert.ok(down);
    assert.equal(down.includes("down"), true);
    assert.equal(down.includes("-v"), false);
});

test("candidate tests do not replace saved settings or reuse the normal in-flight cache", async () => {
    const urls: string[] = [];
    const manager = managerWith({ fetchJson: async (url) => {
        urls.push(url);
        return { total: { watts: url.includes("candidate") ? 20 : 10 } };
    } });
    manager.settings = { ...DEFAULT_POWERWATCH_SETTINGS,
        enabled: true,
        apiUrl: "http://saved.test" };
    assert.equal((await manager.getSnapshot()).totalWatts, 10);
    assert.equal((await manager.test({ apiUrl: "http://candidate.test" })).totalWatts, 20);
    assert.equal(manager.settings.apiUrl, "http://saved.test");
    assert.deepEqual(urls, [ "http://saved.test/api/snapshot", "http://candidate.test/api/snapshot" ]);
});
