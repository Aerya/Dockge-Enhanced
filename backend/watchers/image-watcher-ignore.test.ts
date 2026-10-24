import test, { after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import type { ImageStatus, WatcherSettings, WatchedComposeStack } from "./image-watcher";

// A private Docker executable records commands; it never contacts a Docker daemon.
const root = await fs.mkdtemp(path.join(os.tmpdir(), "dockge-ignore-test-"));
const savedEnv = { PATH: process.env.PATH,
    DOCKGE_STACKS_DIR: process.env.DOCKGE_STACKS_DIR,
    DOCKGE_DATA_DIR: process.env.DOCKGE_DATA_DIR };
await fs.mkdir(path.join(root, "bin"));
await fs.mkdir(path.join(root, "data"));
for (const name of [ "a", "b" ]) {
    await fs.mkdir(path.join(root, "stacks", name), { recursive: true });
    await fs.writeFile(path.join(root, "stacks", name, "compose.yaml"), "services:\n  app:\n    image: fixture/shared:latest\n");
}
await fs.writeFile(path.join(root, "bin", "docker"), `#!${process.execPath}
const fs = require("node:fs"), path = require("node:path");
const root = ${JSON.stringify(root)}, args = process.argv.slice(2);
fs.appendFileSync(path.join(root, "commands"), JSON.stringify(args) + "\\n");
const block = fs.existsSync(path.join(root, "block")) ? fs.readFileSync(path.join(root, "block"), "utf8") : "";
if (block && args.includes(block)) {
    fs.writeFileSync(path.join(root, "entered"), "");
    const deadline = Date.now() + 5000;
    while (!fs.existsSync(path.join(root, "release"))) {
        if (Date.now() > deadline) process.exit(2);
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10);
    }
}
if (args.includes("config")) console.log(JSON.stringify({services:{app:{image:"fixture/shared:latest"}}}));
else if (args.includes("ps")) console.log(args.includes("paused") ? "" : args.includes("-q") ? "container-fixture" : "app");
else if (args.includes("inspect")) console.log("sha256:old");
else if (!args.some(a => ["pull", "up", "tag", "rmi"].includes(a))) process.exit(3);
`, { mode: 0o700 });
process.env.PATH = path.join(root, "bin") + path.delimiter + savedEnv.PATH;
process.env.DOCKGE_STACKS_DIR = path.join(root, "stacks");
process.env.DOCKGE_DATA_DIR = path.join(root, "data");
const { ImageWatcher, imageStatusStore, rollbackStore, updateHistoryStore,
    pendingAutomaticImageUpdateMayRun, resolveAutomaticImageUpdateAction } = await import("./image-watcher");

interface Harness {
    settings: WatcherSettings;
    checkOneImage(image: string, stack: string): Promise<ImageStatus>;
    runImmediateCheck(key: string): Promise<string>;
    runCheck(): Promise<ImageStatus[]>;
    applyPendingUpdates(): Promise<void>;
    performAutoUpdate(status: ImageStatus, watched: WatchedComposeStack, mode?: "immediate" | "scheduled" | "manual"): Promise<boolean>;
}
const key = (stack: string) => `${stack}::fixture/shared:latest`;
const watched = (stack: string) => ({ composePath: path.join(root, "stacks", stack, "compose.yaml") });
const status = (stack: string): ImageStatus => ({ stack,
    image: "fixture/shared:latest",
    localDigest: "sha256:old",
    remoteDigest: "sha256:new",
    hasUpdate: true,
    lastChecked: new Date().toISOString() });
function deferred() {
    let resolve!: () => void;
    const promise = new Promise<void>(done => {
        resolve = done;
    });
    return { promise,
        resolve };
}
function watcher(): Harness {
    const result = new ImageWatcher(path.join(root, "data")) as unknown as Harness;
    result.settings.autoUpdateConfig = { [key("a")]: { mode: "immediate" },
        [key("b")]: { mode: "immediate" } };
    result.checkOneImage = async (_image, stack) => ({ ...status(stack),
        hasUpdate: false });
    return result;
}
async function commands(): Promise<string[][]> {
    return (await fs.readFile(path.join(root, "commands"), "utf8")).trim().split("\n").filter(Boolean).map(line => JSON.parse(line));
}
async function entered() {
    for (let i = 0; i < 200; i++) {
        try {
            await fs.access(path.join(root, "entered"));
            return;
        } catch {
            await new Promise(resolve => setTimeout(resolve, 10));
        }
    }
    assert.fail("Docker barrier was not reached");
}
beforeEach(async () => {
    imageStatusStore.clear();
    rollbackStore.clear();
    updateHistoryStore.length = 0;
    await fs.writeFile(path.join(root, "commands"), "");
    for (const file of [ "block", "entered", "release" ]) {
        await fs.rm(path.join(root, file), { force: true });
    }
});
after(async () => {
    for (const [ name, value ] of Object.entries(savedEnv)) {
        if (value === undefined) {
            delete process.env[name];
        } else {
            process.env[name] = value;
        }
    }
    await fs.rm(root, { recursive: true,
        force: true });
});

test("ignored vetoes mandatory Dozzle and all open or closed maintenance windows", () => {
    for (const mandatory of [ false, true ]) {
        for (const window of [ null, { start: "00:00",
            end: "23:59",
            days: [ 1 ] }]) {
            for (const open of [ false, true ]) {
                assert.equal(resolveAutomaticImageUpdateAction({ mode: "ignored" }, mandatory, window, open), null);
                assert.equal(pendingAutomaticImageUpdateMayRun({ mode: "ignored" }, mandatory, window, open, "02:00"), false);
            }
        }
    }
});

test("ignored pending entries and stale manual candidates never invoke Docker", async () => {
    const w = watcher();
    w.settings.autoUpdateConfig[key("a")] = { mode: "ignored" };
    w.settings.pendingAutoUpdates = [ key("a") ];
    await w.applyPendingUpdates();
    for (const mode of [ "immediate", "scheduled", "manual" ] as const) {
        assert.equal(await w.performAutoUpdate(status("a"), watched("a"), mode), false);
    }
    assert.deepEqual(await commands(), []);
});

test("ignore saved while a registry check waits prevents the immediate mutation", async () => {
    const w = watcher();
    const started = deferred();
    const release = deferred();
    w.checkOneImage = async () => {
        started.resolve();
        await release.promise;
        return status("a");
    };
    const pending = w.runImmediateCheck(key("a"));
    await started.promise;
    w.settings.autoUpdateConfig = { [key("a")]: { mode: "ignored" } };
    release.resolve();
    assert.equal(await pending, "skipped");
    assert.equal(imageStatusStore.get(key("a"))?.hasUpdate, false);
    assert.equal((await commands()).some(args => args.includes("pull") || args.includes("up")), false);
});

test("a selected scheduled batch rechecks the second image after the first operation", async () => {
    const w = watcher();
    w.settings.pendingAutoUpdates = [ key("a"), key("b") ];
    const original = w.performAutoUpdate.bind(w);
    const started = deferred();
    const release = deferred();
    w.performAutoUpdate = async (s, target, mode) => {
        if (s.stack === "a") {
            started.resolve();
            await release.promise;
            return false;
        }
        return original(s, target, mode);
    };
    const pending = w.applyPendingUpdates();
    await started.promise;
    w.settings.autoUpdateConfig[key("b")] = { mode: "ignored" };
    w.settings.pendingAutoUpdates = [];
    release.resolve();
    await pending;
    assert.deepEqual(await commands(), []);
});

test("a full scan rechecks an ignored image already selected before another update", async () => {
    const w = watcher();
    w.checkOneImage = async (_image, stack) => status(stack);
    const original = w.performAutoUpdate.bind(w);
    const started = deferred();
    const release = deferred();
    w.performAutoUpdate = async (s, target, mode) => {
        if (s.stack === "a") {
            started.resolve();
            await release.promise;
            return false;
        }
        return original(s, target, mode);
    };
    const pending = w.runCheck();
    await started.promise;
    w.settings.autoUpdateConfig = { ...w.settings.autoUpdateConfig,
        [key("b")]: { mode: "ignored" } };
    release.resolve();
    await pending;
    assert.equal((await commands()).some(args => args.includes("pull") || args.includes("up")), false);
});

for (const barrier of [ "inspect", "pull" ]) {
    test(`ignore saved during ${barrier} prevents subsequent mutations and releases the reservation`, async () => {
        const w = watcher();
        await fs.writeFile(path.join(root, "block"), barrier);
        const pending = w.performAutoUpdate(status("a"), watched("a"));
        try {
            await entered();
            w.settings.autoUpdateConfig[key("a")] = { mode: "ignored" };
        } finally {
            await fs.writeFile(path.join(root, "release"), "");
        }
        assert.equal(await pending, false);
        const trace = await commands();
        assert.equal(trace.some(args => args.includes("up")), false);
        assert.equal(trace.filter(args => args.includes("pull")).length, barrier === "pull" ? 1 : 0);
        assert.equal(updateHistoryStore.length, 0);
        // Same image in another stack remains eligible; cancellation released the lock.
        assert.equal(await w.performAutoUpdate(status("b"), watched("b")), true);
        assert.equal(updateHistoryStore[0].stack, "b");
    });
}
