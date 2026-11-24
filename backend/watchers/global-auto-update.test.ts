import test from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { ImageWatcher, resolveAutomaticImageUpdateAction, pendingAutomaticImageUpdateMayRun } from "./image-watcher";

test("global policy applies dynamically to existing and future images, with explicit exceptions", () => {
    const watcher = new ImageWatcher();
    watcher.settings.autoUpdateConfig = {
        "demo::manual": { mode: "off" },
        "demo::ignored": { mode: "ignored" },
        "demo::timed": { mode: "scheduled",
            time: "04:30" },
        "demo::paused": { mode: "immediate",
            pause: { enabled: true,
                until: null } },
    };
    assert.equal(watcher.getAutoUpdateEntry("demo::new"), undefined);
    watcher.settings.defaultAutoUpdateMode = "immediate";
    assert.deepEqual(watcher.getAutoUpdateEntry("demo::new"), { mode: "immediate" });
    watcher.settings.defaultAutoUpdateMode = "scheduled";
    watcher.settings.defaultScheduledTime = "05:15";
    assert.deepEqual(watcher.getAutoUpdateEntry("future::stopped"), { mode: "scheduled",
        time: "05:15" });
    assert.deepEqual(watcher.getAutoUpdateEntry("demo::timed"), { mode: "scheduled",
        time: "04:30" });
    assert.equal(watcher.getAutoUpdateEntry("demo::manual")?.mode, "off");
    assert.equal(watcher.getAutoUpdateEntry("demo::ignored")?.mode, "ignored");
    assert.equal(watcher.getAutoUpdateEntry("demo::paused")?.pause?.enabled, true);
    assert.equal(Object.keys(watcher.settings.autoUpdateConfig).length, 4);
    delete watcher.settings.autoUpdateConfig["demo::manual"];
    assert.equal(watcher.getAutoUpdateEntry("demo::manual")?.mode, "scheduled");
    watcher.settings.defaultScheduledTime = "06:00";
    assert.equal(watcher.getAutoUpdateEntry("future::stopped")?.time, "06:00");
});

test("explicit manual policies never enter automatic updates, even with a maintenance window", () => {
    for (const mandatory of [ false, true ]) {
        for (const window of [ null, { start: "00:00",
            end: "23:59",
            days: [ 0, 1, 2, 3, 4, 5, 6 ] }]) {
            assert.equal(resolveAutomaticImageUpdateAction({ mode: "off" }, mandatory, window, true), null);
            assert.equal(pendingAutomaticImageUpdateMayRun({ mode: "off" }, mandatory, window, true, "02:00", true), false);
        }
    }
});

test("environment defaults override saved defaults on startup without overwriting exceptions", async (t) => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "dockge-global-policy-"));
    t.after(() => fs.rm(dir, { recursive: true,
        force: true }));
    const previous = [ process.env.DOCKGE_IMAGE_AUTO_UPDATE_MODE, process.env.DOCKGE_IMAGE_AUTO_UPDATE_TIME ];
    t.after(() => {
        [ "DOCKGE_IMAGE_AUTO_UPDATE_MODE", "DOCKGE_IMAGE_AUTO_UPDATE_TIME" ].forEach((key, i) => {
            if (previous[i] === undefined) {
                delete process.env[key];
            } else {
                process.env[key] = previous[i];
            }
        });
    });
    await fs.writeFile(path.join(dir, "watcher-settings.json"), JSON.stringify({
        enabled: false,
        defaultAutoUpdateMode: "off",
        defaultScheduledTime: "01:00",
        autoUpdateConfig: { "demo::web": { mode: "off" } },
    }));
    process.env.DOCKGE_IMAGE_AUTO_UPDATE_MODE = "scheduled";
    process.env.DOCKGE_IMAGE_AUTO_UPDATE_TIME = "03:45";
    const watcher = new ImageWatcher(dir);
    await watcher.loadSettings();
    assert.equal(watcher.settings.enabled, true);
    assert.equal(watcher.getAutoUpdateEntry("demo::web")?.mode, "off");
    assert.deepEqual(watcher.getAutoUpdateEntry("demo::new"), { mode: "scheduled",
        time: "03:45" });
    process.env.DOCKGE_IMAGE_AUTO_UPDATE_MODE = "typo";
    await assert.rejects(new ImageWatcher(dir).loadSettings(), /DOCKGE_IMAGE_AUTO_UPDATE_MODE/);
    process.env.DOCKGE_IMAGE_AUTO_UPDATE_MODE = "off";
    process.env.DOCKGE_IMAGE_AUTO_UPDATE_TIME = "25:00";
    await assert.rejects(new ImageWatcher(dir).loadSettings());
});

test("saved defaults and explicit opt-outs survive restart; invalid defaults cannot change settings", async (t) => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "dockge-global-save-"));
    t.after(() => fs.rm(dir, { recursive: true,
        force: true }));
    const watcher = new ImageWatcher(dir);
    watcher.restart = () => {};
    await watcher.saveSettings({ defaultAutoUpdateMode: "scheduled",
        defaultScheduledTime: "07:15",
        autoUpdateConfig: { "demo::manual": { mode: "off" } } }, false);
    const reloaded = new ImageWatcher(dir);
    await reloaded.loadSettings();
    assert.deepEqual(reloaded.getAutoUpdateEntry("future::web"), { mode: "scheduled",
        time: "07:15" });
    assert.equal(reloaded.getAutoUpdateEntry("demo::manual")?.mode, "off");
    const before = await fs.readFile(path.join(dir, "watcher-settings.json"), "utf8");
    await assert.rejects(watcher.saveSettings({ defaultAutoUpdateMode: "invalid" as "off" }), /Invalid/);
    assert.equal(await fs.readFile(path.join(dir, "watcher-settings.json"), "utf8"), before);
    assert.equal(watcher.settings.defaultAutoUpdateMode, "scheduled");
});
