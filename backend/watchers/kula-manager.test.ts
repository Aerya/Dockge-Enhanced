import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, rm, access, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { parse } from "yaml";

const root = await mkdtemp(path.join(os.tmpdir(), "kula-test-"));
process.env.DOCKGE_DATA_DIR = path.join(root, "data");
process.env.DOCKGE_STACKS_DIR = path.join(root, "stacks");
const { KulaManager, normalizeKulaAllowedHosts } = await import("./kula-manager");
test.after(() => rm(root, { recursive: true,
    force: true }));

const imageConfig = "storage:\n  directory: /app/data\nweb:\n  listen: 0.0.0.0\n  port: 27960\n  security:\n    origin_validation: true\n    headers: true\n";

test("normalizes exact hosts and rejects unsafe or malformed entries", () => {
    assert.deepEqual(normalizeKulaAllowedHosts([ " Server.Kitom. ", "server.kitom", "192.0.2.1", "::1" ]), [ "server.kitom", "192.0.2.1", "::1" ]);
    for (const value of [ null, "server.kitom", [ 1 ], [ "*" ], [ "*.kitom" ], [ "https://server.kitom" ], [ "server.kitom:27960" ], [ "a/b" ], [ "a..b" ], [ "a\nb" ], [ "" ], Array(101).fill("a") ]) {
        assert.throws(() => normalizeKulaAllowedHosts(value));
    }
});

for (const networkMode of [ "bridge", "host" ] as const) {
    test(`persists and applies hosts before starting Kula in ${networkMode} mode`, async () => {
        const calls: string[][] = [];
        let temporaryConfig = "";
        let copied = "";
        let expectedHosts = [ "server.kitom" ];
        const manager = new KulaManager(async args => {
            calls.push(args);
            if (args[0] === "cp" && args[1].includes(":/app/config.yaml")) {
                temporaryConfig = args[2];
                await writeFile(temporaryConfig, imageConfig);
            } else if (args[0] === "cp") {
                copied = await readFile(args[1], "utf8");
                assert.equal((await stat(args[1])).mode & 0o777, 0o644);
            } else if (args[0] === "start") {
                assert.deepEqual(parse(copied).web.security.allowed_hosts, expectedHosts);
            }
            return "";
        });
        await manager.saveSettings({ enabled: true,
            networkMode,
            allowedHosts: [ "Server.Kitom" ] });
        assert.deepEqual(calls.map(args => args[0]), [ "stop", "rm", "create", "cp", "cp", "start" ]);
        const create = calls[2];
        assert.ok(create.includes("kula_dockge_data:/app/data"));
        assert.ok(create.includes(networkMode === "host" ? "--network" : "-p"));
        const config = parse(copied);
        assert.equal(config.storage.directory, "/app/data");
        assert.equal(config.web.listen, "0.0.0.0");
        assert.equal(config.web.security.origin_validation, true);
        assert.equal(config.web.security.headers, true);
        await assert.rejects(access(temporaryConfig));
        const restored = new KulaManager();
        await restored.loadSettings();
        assert.deepEqual(restored.getSettingsSafe().allowedHosts, [ "server.kitom" ]);
        calls.length = 0;
        await assert.rejects(manager.saveSettings({ allowedHosts: [ "*" ] }));
        assert.equal(calls.length, 0);
        assert.deepEqual(manager.settings.allowedHosts, [ "server.kitom" ]);
        expectedHosts = [];
        await manager.saveSettings({ allowedHosts: [] });
        assert.deepEqual(parse(copied).web.security.allowed_hosts, []);
    });
}

test("old settings default to an empty host list", async () => {
    await writeFile(path.join(root, "data/kula-settings.json"), JSON.stringify({ enabled: false,
        port: 27960 }));
    const manager = new KulaManager();
    await manager.loadSettings();
    assert.deepEqual(manager.getSettingsSafe().allowedHosts, []);
});

test("failed config transfer never starts an unconfigured container", async () => {
    const calls: string[][] = [];
    let temporaryConfig = "";
    const manager = new KulaManager(async args => {
        calls.push(args);
        if (args[0] === "cp") {
            temporaryConfig = args[2];
            throw new Error("copy failed");
        }
        return "";
    });
    await assert.rejects(manager.start(), /copy failed/);
    assert.ok(!calls.some(args => args[0] === "start"));
    assert.deepEqual(calls.at(-1), [ "rm", "-f", "kula-dockge-enhanced" ]);
    await assert.rejects(access(path.dirname(temporaryConfig)));
});

test("a create failure does not remove a container it did not create", async () => {
    const calls: string[][] = [];
    const manager = new KulaManager(async args => {
        calls.push(args);
        if (args[0] === "create") {
            throw new Error("name conflict");
        }
        return "";
    });
    await assert.rejects(manager.start(), /name conflict/);
    assert.ok(!calls.some(args => args[0] === "rm" && args.includes("-f")));
});
