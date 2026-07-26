import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
    normalizePlugNPiNSettings,
    PLUGNPIN_IMAGE,
    PLUGNPIN_SECRET_HELPER_IMAGE,
    PLUGNPIN_SECRETS_VOLUME,
    PLUGNPIN_STACK_NAME,
    PlugNPiNCommandRunner,
    PlugNPiNManager,
    renderPlugNPiNCompose,
    validatePlugNPiNSettings,
} from "./plugnpin-manager";

const validSettings = normalizePlugNPiNSettings({
    enabled: true,
    npmHost: "http://npm.internal:81",
    npmUsername: "plugnpin",
    dnsProvider: "adguard",
    adguardHomeHost: "http://adguard.internal:3000",
    adguardHomeUsername: "plugnpin",
    runInterval: "30m",
    timezone: "Europe/Paris",
    metrics: true,
    metricsPort: 9191,
    metricsBindAddress: "127.0.0.1",
});

const configured = {
    npmPasswordConfigured: true,
    piholePasswordConfigured: false,
    adguardHomePasswordConfigured: true,
};

test("disabled integration accepts empty settings and has no runtime side effect", () => {
    const settings = normalizePlugNPiNSettings({ enabled: false });
    assert.doesNotThrow(() => validatePlugNPiNSettings(settings, {
        npmPasswordConfigured: false,
        piholePasswordConfigured: false,
        adguardHomePasswordConfigured: false,
    }));
    assert.equal(settings.enabled, false);
});

test("enabled integration validates NPM, DNS and Go duration settings", () => {
    assert.doesNotThrow(() => validatePlugNPiNSettings(validSettings, configured));
    assert.equal(
        normalizePlugNPiNSettings({ npmHost: "http://npm.internal:81///" }).npmHost,
        "http://npm.internal:81",
    );

    assert.throws(
        () => validatePlugNPiNSettings({ ...validSettings,
            npmHost: "" }, configured),
        /Nginx Proxy Manager/,
    );
    assert.throws(
        () => validatePlugNPiNSettings({ ...validSettings,
            runInterval: "every hour" }, configured),
        /Go duration/,
    );
    assert.throws(
        () => validatePlugNPiNSettings({ ...validSettings,
            metricsPort: 70000 }, configured),
        /Metrics port/,
    );
    assert.throws(
        () => validatePlugNPiNSettings({ ...validSettings,
            metricsBindAddress: "not-an-ip" }, configured),
        /IPv4/,
    );
});

test("generated compose is pinned, least-privilege and contains no credentials", () => {
    const compose = renderPlugNPiNCompose(validSettings);

    assert.match(compose, new RegExp(PLUGNPIN_IMAGE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.match(compose, /CONTAINERS: "1"/);
    assert.match(compose, /EVENTS: "1"/);
    assert.match(compose, /docker\.sock:\/var\/run\/docker\.sock:ro/);
    assert.match(compose, new RegExp(`name: ${PLUGNPIN_SECRETS_VOLUME}`));
    assert.match(compose, /plugnpin-secrets:\/run\/secrets:ro/);
    assert.match(compose, /"127\.0\.0\.1:9191:9191"/);

    assert.doesNotMatch(compose, /npm\.internal/);
    assert.doesNotMatch(compose, /adguard\.internal/);
    assert.doesNotMatch(compose, /plugnpin-password/i);
    assert.match(PLUGNPIN_SECRET_HELPER_IMAGE, /@sha256:/);
});

test("metrics port is not published when metrics are disabled", () => {
    const compose = renderPlugNPiNCompose({ ...validSettings,
        metrics: false });
    assert.doesNotMatch(compose, /\n {4}ports:\n/);
    assert.match(compose, /METRICS: "false"/);
});

test("lifecycle persists no passwords and removes only its marked stack", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "dockge-plugnpin-test-"));
    const commands: Array<{ command: string; args: string[]; stdin?: string }> = [];
    let volumeExists = false;
    const runner: PlugNPiNCommandRunner = async (command, args, stdin) => {
        commands.push({ command,
            args,
            stdin });
        if (args[0] === "volume" && args[1] === "inspect") {
            if (!volumeExists) {
                throw new Error("volume not found");
            }
            return { stdout: "plugnpin\n",
                stderr: "" };
        }
        if (args[0] === "volume" && args[1] === "create") {
            volumeExists = true;
        }
        return { stdout: "",
            stderr: "" };
    };
    const manager = new PlugNPiNManager(runner, {
        dataDir: path.join(root, "data"),
        stacksDir: path.join(root, "stacks"),
    });

    try {
        const safe = await manager.saveSettings({
            ...validSettings,
            npmPassword: "not-persisted",
            adguardHomePassword: "also-not-persisted",
        });
        assert.equal(safe.npmPasswordConfigured, true);
        assert.equal(safe.adguardHomePasswordConfigured, true);
        assert.equal("npmPassword" in safe, false);

        const settingsText = await fs.readFile(path.join(root, "data", "plugnpin", "settings.json"), "utf8");
        const composeText = await fs.readFile(path.join(root, "stacks", PLUGNPIN_STACK_NAME, "compose.yaml"), "utf8");
        const markerText = await fs.readFile(path.join(root, "stacks", PLUGNPIN_STACK_NAME, ".dockge-enhanced-managed"), "utf8");
        assert.doesNotMatch(settingsText, /not-persisted|also-not-persisted/);
        assert.doesNotMatch(composeText, /not-persisted|also-not-persisted/);
        assert.equal(markerText, "plugnpin-integration-v1\n");
        assert.equal(commands.filter(entry => entry.args[0] === "run").length, 6);

        await manager.saveSettings({ enabled: false });
        await assert.rejects(fs.access(path.join(root, "stacks", PLUGNPIN_STACK_NAME)));
        assert.ok(commands.some(entry => entry.args.includes("down")));
    } finally {
        await fs.rm(root, { recursive: true,
            force: true });
    }
});

test("refuses a pre-existing unmarked stack directory before Docker writes", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "dockge-plugnpin-collision-"));
    const stackDir = path.join(root, "stacks", PLUGNPIN_STACK_NAME);
    await fs.mkdir(stackDir, { recursive: true });
    await fs.writeFile(path.join(stackDir, "compose.yaml"), "services:\n  user-owned:\n    image: nginx\n");
    let dockerCalled = false;
    const manager = new PlugNPiNManager(async () => {
        dockerCalled = true;
        return { stdout: "",
            stderr: "" };
    }, {
        dataDir: path.join(root, "data"),
        stacksDir: path.join(root, "stacks"),
    });

    try {
        await assert.rejects(
            manager.saveSettings({
                ...validSettings,
                npmPassword: "test",
                adguardHomePassword: "test",
            }),
            /already exists and is not managed/,
        );
        assert.equal(dockerCalled, false);
        assert.match(await fs.readFile(path.join(stackDir, "compose.yaml"), "utf8"), /user-owned/);
    } finally {
        await fs.rm(root, { recursive: true,
            force: true });
    }
});

test("refuses an existing secrets volume without the ownership label", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "dockge-plugnpin-volume-"));
    const manager = new PlugNPiNManager(async (_command, args) => {
        if (args[0] === "volume" && args[1] === "inspect") {
            return { stdout: "<no value>\n",
                stderr: "" };
        }
        return { stdout: "",
            stderr: "" };
    }, {
        dataDir: path.join(root, "data"),
        stacksDir: path.join(root, "stacks"),
    });

    try {
        await assert.rejects(
            manager.saveSettings({
                ...validSettings,
                npmPassword: "test",
                adguardHomePassword: "test",
            }),
            /volume already exists and is not managed/,
        );
    } finally {
        await fs.rm(root, { recursive: true,
            force: true });
    }
});
