import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import childProcessAsync from "promisify-child-process";

test("automatic cleanup sends compact Discord/Apprise reports and retains full history", async (t) => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "dockge-cleanup-notification-"));
    const previous = process.env.DOCKGE_DATA_DIR;
    process.env.DOCKGE_DATA_DIR = directory;
    t.after(async () => {
        if (previous === undefined) {
            delete process.env.DOCKGE_DATA_DIR;
        } else {
            process.env.DOCKGE_DATA_DIR = previous;
        }
        await fs.rm(directory, { recursive: true,
            force: true });
    });
    await fs.writeFile(path.join(directory, "docker-cleanup-settings.json"), JSON.stringify({ enabled: true,
        categories: { images: false,
            networks: false,
            volumes: false,
            buildCache: true },
        graceHours: 48 }));
    await fs.writeFile(path.join(directory, "watcher-settings.json"), JSON.stringify({ discordWebhooks: [ "https://discord.com/api/webhooks/fixture/fixture" ],
        appriseServerUrl: "http://fixture.invalid" }));
    const { DockerCleanupManager } = await import("./docker-prune-service");
    const { Settings } = await import("./settings");
    const { DiscordNotifier } = await import("./notification/discord");
    const { AppriseNotifier } = await import("./notification/apprise");
    const discord: { title: string;
        description?: string;
        color?: number }[] = [];
    const apprise: { title: string;
        body: string }[] = [];
    t.mock.method(Settings, "get", async (key: string) => key === "primaryHostname" ? "fixture-host" : "fr");
    t.mock.method(DiscordNotifier.prototype, "sendEmbed", async (value: typeof discord[number]) => {
        discord.push(value);
        return true;
    });
    t.mock.method(AppriseNotifier.prototype, "send", async (value: typeof apprise[number]) => {
        apprise.push(value);
        return true;
    });
    const manager = new DockerCleanupManager();
    t.mock.method(manager as unknown as { currentBlockerReason(): Promise<string | undefined> }, "currentBlockerReason", async () => undefined);
    const raw = `Deleted build cache objects:\n${"cache-object-id\n".repeat(500)}Total reclaimed space: 647.7MB\nDEPRECATED: The legacy builder is deprecated\n`;
    let fail = false;
    const commands: string[][] = [];
    t.mock.method(childProcessAsync, "spawn", async (command: string, args: string[]) => {
        assert.equal(command, "docker");
        commands.push(args);
        if (fail) {
            throw new Error("fixture Docker failure");
        }
        return { code: 0,
            stdout: raw,
            stderr: "" };
    });
    const entry = await manager.runAutomatic();
    assert.equal(entry?.success, true);
    assert.equal(entry?.results.buildCache, raw.trim());
    assert.equal(entry?.summaries?.buildCache?.reclaimed, "647.7MB");
    assert.deepEqual(commands, [[ "builder", "prune", "-a", "-f", "--filter", "until=48h" ]]);
    assert.equal(discord.length, 2);
    assert.match(discord[0].title, /\[fixture-host\]/);
    assert.match(discord[1].title, /terminé/);
    assert.equal(discord[1].color, 0x22c55e);
    assert.match(discord[1].description!, /647\.7MB/);
    assert.doesNotMatch(discord[1].description!, /cache-object-id|DEPRECATED/);
    assert.equal(apprise[1].body, discord[1].description);
    fail = true;
    const failed = await manager.runAutomatic();
    assert.equal(failed?.success, false);
    assert.equal(discord.at(-1)?.color, 0xef4444);
    assert.match(discord.at(-1)!.description!, /échoué/);
    const history = JSON.parse(await fs.readFile(path.join(directory, "docker-prune-history.json"), "utf8"));
    assert.match(history[0].results.buildCache, /fixture Docker failure/);
    assert.equal(history[1].results.buildCache, raw.trim());
});
