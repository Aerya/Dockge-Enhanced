import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test, { type TestContext } from "node:test";
import { ImageUpdateNotifications } from "./image-update-notifications";
import { ImageWatcher, type ImageStatus } from "./image-watcher";
import { DiscordNotifier } from "../notification/discord";
import { AppriseNotifier } from "../notification/apprise";
import { Settings } from "../settings";

const update: ImageStatus = {
    stack: "vpn-stack",
    image: "qmcgaw/gluetun:latest",
    localDigest: "sha256:old",
    remoteDigest: "sha256:new",
    hasUpdate: true,
    lastChecked: "2026-10-23T11:00:00Z",
};

async function fixture(t: TestContext) {
    const root = await mkdtemp(path.join(os.tmpdir(), "dockge-notifications-"));
    t.after(() => rm(root, { recursive: true,
        force: true }));
    return path.join(root, "image-update-notifications.json");
}

test("same pending digest is announced once across hourly scans and process restarts", async t => {
    const file = await fixture(t);
    let ledger = new ImageUpdateNotifications(file);
    const messages: ImageStatus[][] = [];
    const send = async (selected: ImageStatus[]) => {
        messages.push(selected);
        return true;
    };
    for (let hour = 0; hour < 3; hour++) {
        await ledger.dispatch([ "discord", "secret-webhook" ], [{ ...update,
            lastChecked: new Date(Date.parse(update.lastChecked) + hour * 3600000).toISOString() }], [], send);
    }
    ledger = new ImageUpdateNotifications(file);
    await ledger.dispatch([ "discord", "secret-webhook" ], [ update ], [], send);
    assert.equal(messages.length, 1);
    await ledger.dispatch([ "discord", "secret-webhook" ], [{ ...update,
        remoteDigest: "sha256:newer" }], [], send);
    assert.equal(messages.length, 2);
    assert.equal((await readFile(file, "utf8")).includes("secret-webhook"), false);
});

test("failed delivery is retried independently for each destination and stack", async t => {
    const ledger = new ImageUpdateNotifications(await fixture(t));
    const discord = [ "discord", "webhook-one" ];
    const apprise = [ "apprise", "server", "service" ];
    let discordCalls = 0;
    let appriseCalls = 0;
    const sendDiscord = async () => {
        discordCalls++;
        return true;
    };
    const sendApprise = async () => {
        appriseCalls++;
        return appriseCalls > 1;
    };
    for (let scan = 0; scan < 3; scan++) {
        await ledger.dispatch(discord, [ update ], [], sendDiscord);
        await ledger.dispatch(apprise, [ update ], [], sendApprise);
    }
    assert.equal(discordCalls, 1);
    assert.equal(appriseCalls, 2);
    await ledger.dispatch(discord, [{ ...update,
        stack: "other-stack" }], [], sendDiscord);
    await ledger.dispatch([ "discord", "webhook-two" ], [ update ], [], sendDiscord);
    assert.equal(discordCalls, 3);
});

test("simultaneous announcements reserve the same receipt before asynchronous delivery", async t => {
    const ledger = new ImageUpdateNotifications(await fixture(t));
    let unblock!: () => void;
    let entered!: () => void;
    const barrier = new Promise<void>(resolve => {
        unblock = resolve;
    });
    const started = new Promise<void>(resolve => {
        entered = resolve;
    });
    let calls = 0;
    const send = async () => {
        calls++;
        entered();
        await barrier;
        return true;
    };
    const first = ledger.dispatch([ "discord" ], [ update ], [], send);
    await started;
    const second = ledger.dispatch([ "discord" ], [ update ], [], send);
    unblock();
    await Promise.all([ first, second ]);
    assert.equal(calls, 1);
});

test("delivery exception releases the queue and does not acknowledge a pending update", async t => {
    const ledger = new ImageUpdateNotifications(await fixture(t));
    await assert.rejects(ledger.dispatch([ "apprise" ], [ update ], [], async () => {
        throw new Error("offline");
    }), /offline/);
    let calls = 0;
    await ledger.dispatch([ "apprise" ], [ update ], [], async () => {
        calls++;
        return true;
    });
    assert.equal(calls, 1);
});

test("failed receipt persistence does not silently acknowledge the announcement", async t => {
    const file = await fixture(t);
    const ledger = new ImageUpdateNotifications(file);
    let calls = 0;
    await assert.rejects(ledger.dispatch([ "discord" ], [ update ], [], async () => {
        calls++;
        await mkdir(file);
        return true;
    }));
    await rm(file, { recursive: true });
    await ledger.dispatch([ "discord" ], [ update ], [], async () => {
        calls++;
        return true;
    });
    assert.equal(calls, 2);
});

test("Discord returns delivery failure instead of acknowledging an unsuccessful send", async t => {
    const transport = DiscordNotifier.prototype as unknown as {
        sendEmbedToUrl(url: string, options: Parameters<DiscordNotifier["sendEmbed"]>[0]): Promise<boolean>;
    };
    t.mock.method(transport, "sendEmbedToUrl", async (url: string) => url === "delivered");
    const options = { title: "fixture" };
    assert.equal(await new DiscordNotifier([]).sendEmbed(options), false);
    assert.equal(await new DiscordNotifier([ "failed" ]).sendEmbed(options), false);
    assert.equal(await new DiscordNotifier([ "delivered", "failed" ]).sendEmbed(options), false);
    assert.equal(await new DiscordNotifier([ "delivered" ]).sendEmbed(options), true);
});

test("applied updates are still announced and missing remote digests are not invented", async t => {
    const ledger = new ImageUpdateNotifications(await fixture(t));
    const messages: ImageStatus[][] = [];
    const send = async (selected: ImageStatus[]) => {
        messages.push(selected);
        return true;
    };
    await ledger.dispatch([ "discord" ], [ update ], [], send);
    await ledger.dispatch([ "discord" ], [ update ], [ update ], send);
    const unverified = { ...update,
        remoteDigest: "" };
    await ledger.dispatch([ "discord" ], [ unverified ], [], send);
    assert.equal(messages.length, 2);
    await ledger.dispatch([ "discord" ], [ unverified ], [ unverified ], send);
    assert.equal(messages.length, 3);
});

test("ImageWatcher keeps scheduled announcements quiet, retries Apprise and reports application", async t => {
    const file = await fixture(t);
    const discordMessages: Parameters<DiscordNotifier["sendEmbed"]>[0][] = [];
    const appriseMessages: Parameters<AppriseNotifier["send"]>[0][] = [];
    t.mock.method(Settings, "get", async () => "");
    t.mock.method(DiscordNotifier.prototype, "sendEmbed", async (message: Parameters<DiscordNotifier["sendEmbed"]>[0]) => {
        discordMessages.push(message);
        return true;
    });
    t.mock.method(AppriseNotifier.prototype, "send", async (message: Parameters<AppriseNotifier["send"]>[0]) => {
        appriseMessages.push(message);
        return appriseMessages.length > 1;
    });
    const makeWatcher = () => {
        const watcher = new ImageWatcher(path.dirname(file));
        watcher.settings.discordWebhooks = [ "https://discord.com/api/webhooks/123/fake" ];
        watcher.settings.appriseServerUrl = "http://apprise.invalid";
        watcher.settings.pendingAutoUpdates = [ `${update.stack}::${update.image}` ];
        watcher.settings.autoUpdateConfig = { [`${update.stack}::${update.image}`]: { mode: "scheduled",
            time: "02:32" } };
        return watcher;
    };
    const notify = (watcher: ImageWatcher, updates: ImageStatus[], applied: ImageStatus[] = []) =>
        (watcher as unknown as { notify: (updates: ImageStatus[], total: number, applied: ImageStatus[], cfg: ImageWatcher["settings"]["autoUpdateConfig"]) => Promise<void> })
            .notify(updates, 50, applied, watcher.settings.autoUpdateConfig);
    let watcher = makeWatcher();
    await notify(watcher, [ update ]);
    watcher = makeWatcher();
    await notify(watcher, [ update ]);
    await notify(watcher, [ update ]);
    assert.equal(discordMessages.length, 1);
    assert.equal(appriseMessages.length, 2);
    assert.match(discordMessages[0].fields![0].value, /02:32/);
    const newer = { ...update,
        remoteDigest: "sha256:newer" };
    await notify(watcher, [ newer ]);
    assert.equal(discordMessages.length, 2);
    const other = { ...update,
        image: "fixture/other:latest" };
    await notify(watcher, [ newer, other ]);
    assert.equal(discordMessages.length, 3);
    assert.equal(discordMessages[2].fields!.length, 1);
    assert.match(discordMessages[2].fields![0].name, /fixture\/other/);
    assert.match(discordMessages[2].title, /1 update/);
    await notify(watcher, [ newer ], [ newer ]);
    assert.equal(discordMessages.length, 4);
    assert.match(discordMessages[3].title, /auto-updated/);
});
