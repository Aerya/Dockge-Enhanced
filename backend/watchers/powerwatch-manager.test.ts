import assert from "node:assert/strict";
import test from "node:test";
import {
    buildPowerWatchCompose,
    buildPowerWatchHubCompose,
    DEFAULT_POWERWATCH_SETTINGS,
    PowerWatchManager,
    POWERWATCH_TOKEN_MASK,
    validatePowerWatchUrl,
} from "./powerwatch-manager";

function result(stdout = "", code = 0, stderr = "") {
    return { stdout,
        stderr,
        code };
}

function managerWith(overrides: {
    docker?: (args: string[]) => Promise<ReturnType<typeof result>>;
    fetchJson?: (url: string, timeout: number, options?: { bearerToken?: string }) => Promise<unknown>;
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

test("an existing PowerWatch needs only its WebUI URL, never a separate API URL", async () => {
    let requested = "";
    const manager = managerWith({ fetchJson: async (url) => {
        requested = url;
        return { total: { watts: 18.5,
            confidence: "Estimated" } };
    } });
    manager.settings = { ...DEFAULT_POWERWATCH_SETTINGS,
        enabled: true,
        apiUrl: "",
        webUrl: "http://192.168.0.64:3064" };
    const snapshot = await manager.getSnapshot();
    assert.equal(requested, "http://192.168.0.64:3064/api/snapshot");
    assert.equal(snapshot.webUrl, "http://192.168.0.64:3064");
    assert.equal(snapshot.totalWatts, 18.5);
});

test("protected PowerWatch snapshots use a read-only Bearer token without exposing it in settings", async () => {
    let requested = "";
    let bearerToken: string | undefined;
    const manager = managerWith({ fetchJson: async (url, _timeout, options) => {
        requested = url;
        bearerToken = options?.bearerToken;
        return { total: { watts: 9.1,
            confidence: "Measured" } };
    } });
    manager.settings = { ...DEFAULT_POWERWATCH_SETTINGS,
        enabled: true,
        apiUrl: "https://power.example.test",
        apiToken: "pw_readonly-token" };

    assert.equal((await manager.getSnapshot()).reachable, true);
    assert.equal(requested, "https://power.example.test/api/snapshot");
    assert.equal(bearerToken, "pw_readonly-token");
    assert.equal(manager.getSettingsSafe().apiToken, POWERWATCH_TOKEN_MASK);
    assert.equal((await manager.test({ apiToken: POWERWATCH_TOKEN_MASK })).reachable, true);
    await assert.rejects(() => manager.test({ apiToken: "pw_token\r\nX-Injected: value" }), /Invalid PowerWatch API token/);
});

test("a saved read-only token never follows an instance URL change", async () => {
    const calls: Array<{ url: string; token?: string }> = [];
    const manager = managerWith({ fetchJson: async (url, _timeout, opts) => {
        calls.push({ url, token: opts?.bearerToken });
        return { total: { watts: 12.3, confidence: "Measured" } };
    } });
    manager.settings = { ...DEFAULT_POWERWATCH_SETTINGS,
        enabled: true,
        apiUrl: "https://first.test",
        apiToken: "pw_first-only" };

    // Reusing the masked value on the same endpoint remains supported.
    assert.equal((await manager.test({ apiToken: POWERWATCH_TOKEN_MASK })).reachable, true);
    assert.equal(calls.at(-1)?.token, "pw_first-only");

    // Updating the endpoint must drop the old secret even if the form still has its mask.
    assert.equal((await manager.test({ apiUrl: "https://second.test", apiToken: POWERWATCH_TOKEN_MASK })).reachable, true);
    assert.deepEqual(calls.at(-1), { url: "https://second.test/api/snapshot", token: undefined });
    assert.equal((await manager.test({ apiUrl: "https://third.test" })).reachable, true);
    assert.equal(calls.at(-1)?.token, undefined);

    // A newly entered token may be explicitly associated with the new endpoint.
    assert.equal((await manager.test({ apiUrl: "https://fourth.test", apiToken: "pw_explicit-new" })).reachable, true);
    assert.equal(calls.at(-1)?.token, "pw_explicit-new");
    assert.equal(manager.settings.apiToken, "pw_first-only");
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

test("PowerWatch API tokens are never sent to the Hub snapshot endpoint", async () => {
    let options: { bearerToken?: string } | undefined;
    const manager = managerWith({ fetchJson: async (_url, _timeout, requestOptions) => {
        options = requestOptions;
        return { nodes: [] };
    } });
    manager.settings = { ...DEFAULT_POWERWATCH_SETTINGS,
        apiToken: "pw_readonly-token",
        hubEnabled: true,
        hubWebUrl: "https://hub.example.test" };

    assert.equal((await manager.getHubStatus()).reachable, true);
    assert.equal(options, undefined);
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

test("protected local containers receive the Bearer token only on their snapshot request", async () => {
    const commands: string[][] = [];
    const manager = managerWith({ docker: async (args) => {
        commands.push(args);
        if (args[0] === "inspect") {
            return result(JSON.stringify([{ Config: { Image: "ghcr.io/aerya/powerwatch:latest" },
                State: { Running: true },
                HostConfig: { PortBindings: {} } }]));
        }
        if (args[0] === "exec") {
            return result(JSON.stringify({ total: { watts: 18.4 } }));
        }
        return result();
    } });
    manager.settings = { ...DEFAULT_POWERWATCH_SETTINGS,
        enabled: true,
        externalContainer: "powerwatch-existing",
        apiToken: "pw_readonly-token" };

    assert.equal((await manager.getSnapshot()).reachable, true);
    assert.deepEqual(commands.at(-1), [ "exec", "powerwatch-existing", "curl", "--fail", "--silent", "--show-error", "--max-time", "4", "--header", "Authorization: Bearer pw_readonly-token", "http://127.0.0.1:3000/api/snapshot" ]);
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
            return result("powercap\nnvidia-device\nPW_TCP_BEGIN\nPW_TCP_END\n");
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
    assert.match(cpu, /\/sys\/firmware:\/host-sys-firmware:ro/);
    assert.match(cpu, /POWERWATCH_DMI_TABLE_PATH: \/host-sys-firmware\/dmi\/tables\/DMI/);
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
    assert.equal(commands.some((args) => args.includes("stop") || args.includes("down")), false);
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
                if (args[0] === "run") {
                    return result("PW_TCP_BEGIN\nPW_TCP_END\n");
                }
                if (args[0] === "info") {
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
    assert.equal(down.includes("stop"), true);
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

test("managed detection considers all published host ports, not only container port 3000", async () => {
    const manager = managerWith({ docker: async (args) => {
        if (args[0] === "ps") {
            return result("another\n");
        }
        if (args[0] === "inspect") {
            return result(JSON.stringify([{
                Name: "/another",
                Config: { Image: "example/other:latest",
                    Labels: {} },
                State: { Running: true },
                HostConfig: { PortBindings: { "8080/tcp": [{ HostIp: "0.0.0.0",
                    HostPort: "3456" }] } },
            }]));
        }
        if (args[0] === "run") {
            return result("powercap\nPW_TCP_BEGIN\nPW_TCP_END\n");
        }
        if (args[0] === "info") {
            return result("{}");
        }
        return result();
    } });
    manager.settings = { ...DEFAULT_POWERWATCH_SETTINGS,
        enabled: true,
        mode: "managed",
        hostPort: 3456 };
    assert.equal((await manager.detect()).portAvailable, false);
});

test("failed host probe is an error, not missing hardware", async () => {
    const manager = managerWith({ docker: async (args) => {
        if (args[0] === "ps") {
            return result("");
        }
        if (args[0] === "run") {
            return result("", 125, "Docker socket denied");
        }
        return result();
    } });
    await assert.rejects(() => manager.detect(), /Docker socket denied/);
});

test("missing optional sensors are not a Docker failure, but host listeners block installation", async () => {
    const commands: string[][] = [];
    const manager = managerWith({ docker: async (args) => {
        commands.push(args);
        if (args[0] === "ps") {
            return result("");
        }
        if (args[0] === "run") {
            return result("PW_TCP_BEGIN\n   sl  local_address rem_address st\n   0: 0100007F:0BB8 00000000:0000 0A\nPW_TCP_END\n");
        }
        if (args[0] === "info") {
            return result("{}");
        }
        return result();
    } });
    manager.settings = { ...DEFAULT_POWERWATCH_SETTINGS,
        enabled: true,
        mode: "managed",
        hostPort: 3000 };
    const detection = await manager.detect();
    assert.deepEqual(detection.capabilities, { linux: true,
        powercap: false,
        msr: false,
        nvidia: false });
    assert.equal(detection.portAvailable, false);
    assert.equal(commands.some((args) => args.includes("--network") && args.includes("host")), true);
    assert.equal(commands.some((args) => args.includes("--pull=missing")), true);
});

test("a non-listening host socket does not block the selected port", async () => {
    const manager = managerWith({ docker: async (args) => {
        if (args[0] === "run") {
            return result("PW_TCP_BEGIN\n   0: 0100007F:0BB8 00000000:0000 01\nPW_TCP_END\n");
        }
        if (args[0] === "info") {
            return result("{}");
        }
        return result();
    } });
    manager.settings = { ...DEFAULT_POWERWATCH_SETTINGS,
        hostPort: 3000 };
    assert.equal((await manager.detect()).portAvailable, true);
});

test("a failed real NVIDIA container probe disables NVIDIA auto mode", async () => {
    const commands: string[][] = [];
    const manager = managerWith({ docker: async (args) => {
        commands.push(args);
        if (args[0] === "run" && args.includes("--gpus")) {
            return result("", 125, "GPU runtime not usable");
        }
        if (args[0] === "run") {
            return result("nvidia-device\nPW_TCP_BEGIN\nPW_TCP_END\n");
        }
        if (args[0] === "info") {
            return result("{\"nvidia\":{}}");
        }
        return result();
    } });
    const detection = await manager.detect();
    assert.equal(detection.capabilities.nvidia, false);
    assert.equal(commands.some((args) => args.includes("--gpus")), true);
});

test("own managed container may reuse its own listening port", async () => {
    const manager = managerWith({ docker: async (args) => {
        if (args[0] === "ps") {
            return result("managed\n");
        }
        if (args[0] === "inspect") {
            return result(JSON.stringify([{ Name: "/powerwatch-dockge-enhanced",
                Config: { Image: "ghcr.io/aerya/powerwatch:latest",
                    Labels: { "com.dockge-enhanced.managed": "powerwatch",
                        "com.dockge-enhanced.integration": "powerwatch",
                        "com.docker.compose.project": "powerwatch-dockge-enhanced",
                        "com.docker.compose.service": "powerwatch" } },
                State: { Running: true },
                HostConfig: { PortBindings: { "3000/tcp": [{ HostPort: "3000" }] } } }]));
        }
        if (args[0] === "run") {
            return result("PW_TCP_BEGIN\n   0: 0100007F:0BB8 00000000:0000 0A\nPW_TCP_END\n");
        }
        if (args[0] === "info") {
            return result("{}");
        }
        return result();
    } });
    manager.settings = { ...DEFAULT_POWERWATCH_SETTINGS,
        hostPort: 3000 };
    assert.equal((await manager.detect()).portAvailable, true);
});

test("Hub Compose is independently managed, persistent and unprivileged", () => {
    const yaml = buildPowerWatchHubCompose({ ...DEFAULT_POWERWATCH_SETTINGS,
        hubEnabled: true,
        hubMode: "managed",
        hubBindAddress: "127.0.0.1",
        hubHostPort: 3065 });
    assert.match(yaml, /image: ghcr.io\/aerya\/powerwatch:latest/);
    assert.match(yaml, /entrypoint: \[\/usr\/local\/bin\/powerwatch-hub\]/);
    assert.match(yaml, /127\.0\.0\.1:3065:3000/);
    assert.match(yaml, /powerwatch_hub_dockge_data:\n {4}name:/);
    assert.match(yaml, /no-new-privileges:true/);
    assert.doesNotMatch(yaml, /SYS_RAWIO|\/dev\/cpu|pid: host|privileged:/);
});

test("Hub managed status reads its own container and never requests external HTTP", async () => {
    const commands: string[][] = [];
    const manager = managerWith({ docker: async (args) => {
        commands.push(args);
        if (args[0] === "inspect") {
            if (args[1] === "powerwatch-hub-dockge-enhanced") {
                return result(JSON.stringify([{ Name: "/powerwatch-hub-dockge-enhanced",
                    Config: { Labels: { "com.dockge-enhanced.managed": "powerwatch-hub",
                        "com.dockge-enhanced.integration": "powerwatch-hub",
                        "com.docker.compose.project": "powerwatch-hub-dockge-enhanced",
                        "com.docker.compose.service": "powerwatch-hub" } },
                    State: { Running: true } }]));
            }
            return result("", 1, "not found");
        }
        if (args[0] === "exec") {
            return result("{\"nodes\":[]}");
        }
        return result();
    },
    fetchJson: async () => {
        throw new Error("Must not fetch managed Hub over HTTP");
    } });
    manager.settings = { ...DEFAULT_POWERWATCH_SETTINGS,
        hubEnabled: true,
        hubMode: "managed" };
    const status = await manager.getHubStatus();
    assert.equal(status.reachable, true);
    assert.equal(status.webUrl, "http://127.0.0.1:3065");
    const states = await manager.getManagedStates();
    assert.equal(states.hub.running, true);
    assert.equal(states.powerwatch.installed, false);
    assert.equal(commands.some(args => args[0] === "exec" && args[1] === "powerwatch-hub-dockge-enhanced"), true);
});

test("Hub cannot take over an unrelated existing container", async () => {
    const manager = managerWith({ docker: async (args) => {
        if (args[0] === "inspect") {
            return result(JSON.stringify([{ Name: "/powerwatch-hub-dockge-enhanced",
                Config: { Labels: { "com.docker.compose.project": "someone-else" } },
                State: { Running: true } }]));
        }
        return result();
    } });
    manager.settings = { ...DEFAULT_POWERWATCH_SETTINGS,
        hubEnabled: true,
        hubMode: "managed" };
    await assert.rejects(() => manager.hubStart(), /not owned/);
});

test("Hub requires an available host port and does not need GPU detection", async () => {
    const commands: string[][] = [];
    const manager = managerWith({ docker: async (args) => {
        commands.push(args);
        if (args[0] === "inspect") {
            return result("", 1, "not found");
        }
        if (args[0] === "run") {
            return result("PW_TCP_BEGIN\n   0: 0100007F:0BF9 00000000:0000 0A\nPW_TCP_END\n");
        }
        return result();
    } });
    manager.settings = { ...DEFAULT_POWERWATCH_SETTINGS,
        hubEnabled: true,
        hubMode: "managed",
        hubHostPort: 3065 };
    await assert.rejects(() => manager.hubStart(), /already in use/);
    assert.equal(commands.some(args => args.includes("--gpus")), false);
    assert.equal(commands.some(args => args[0] === "compose"), false);
});

test("MSR plus NVIDIA compose keeps both environment variables under environment", () => {
    const yaml = buildPowerWatchCompose({ ...DEFAULT_POWERWATCH_SETTINGS,
        msrMode: "enabled",
        nvidiaMode: "enabled" },
    { linux: true,
        msr: true,
        nvidia: true,
        powercap: false });
    const environment = yaml.split("    environment:\n")[1]?.split("    cap_add:\n")[0];
    assert.match(environment ?? "", /NVIDIA_VISIBLE_DEVICES: all/);
    assert.match(environment ?? "", /NVIDIA_DRIVER_CAPABILITIES: utility/);
    assert.match(yaml, / {4}cap_add:\n {6}- SYS_RAWIO/);
});
