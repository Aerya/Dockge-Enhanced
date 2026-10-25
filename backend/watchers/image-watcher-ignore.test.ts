import test, { after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import type { ImageStatus, WatcherSettings, WatchedComposeStack } from "./image-watcher";
import { ROLLOUT_HEALTH_PREFIX } from "../../common/service-rollout";

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
if (fs.existsSync(path.join(root, "rollout-valid"))) {
    const file = path.join(root, "rollout-runtime");
    const state = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : {created:false,drained:false,removed:false};
    const old = "a".repeat(64), next = "b".repeat(64), proxy = "c".repeat(64);
    const previous = "sha256:" + "d".repeat(64), target = "sha256:" + "e".repeat(64);
    const health = ${JSON.stringify(ROLLOUT_HEALTH_PREFIX)};
    const labels = {"dockge.rollout.enabled":"true","traefik.enable":"true","traefik.http.routers.app.rule":"Host(\u0027fixture.test\u0027)","traefik.http.services.app.loadbalancer.server.port":"80"};
    const container = id => ({Id:id, Image:id===next?target:previous, State:{Running:true,Health:{Status:id===old&&state.drained?"unhealthy":"healthy"}},
      Config:{Image:id===proxy?"traefik:v3":"fixture/shared:latest",Healthcheck:{Test:["CMD-SHELL",health+"true"]},Labels:{...labels,"com.docker.compose.project":"fixture","com.docker.compose.service":"app"}},
      Mounts:[],NetworkSettings:{Networks:{fixture:{}}}});
    let output = "";
    if (args.includes("config")) output=JSON.stringify({name:"fixture",services:{app:{image:"fixture/shared:latest",labels,healthcheck:{test:["CMD-SHELL",health+"true"]}},sibling:{image:"fixture/shared:latest"}}});
    else if (args.includes("ps")) output=args.includes("paused")?"":args.includes("--services")?"app\\nsibling":args[0]!=="compose"?proxy+"\\n"+old:args.includes("-aq")?[...(state.removed?[]:[old]),...(state.created?[next]:[])].join("\\n"):old;
    else if (args[0]==="container") output=previous;
    else if (args[0]==="inspect") output=JSON.stringify(args.slice(1).map(container));
    else if (args[0]==="image") output=target;
    else if (args.includes("--scale")) state.created=true;
    else if (args[0]==="exec") state.drained=String(args.at(-1)).startsWith("touch");
    else if (args[0]==="rm") state.removed=true;
    else if (!args.some(a=>["pull","up","tag","rmi","stop"].includes(a))) process.exit(3);
    fs.writeFileSync(file,JSON.stringify(state));
    console.log(output);process.exit(0);
}
const block = fs.existsSync(path.join(root, "block")) ? fs.readFileSync(path.join(root, "block"), "utf8") : "";
if (block && args.includes(block)) {
    fs.writeFileSync(path.join(root, "entered"), "");
    const deadline = Date.now() + 5000;
    while (!fs.existsSync(path.join(root, "release"))) {
        if (Date.now() > deadline) process.exit(2);
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10);
    }
}
if (args.includes("config")) {
    const invalidRollout = fs.existsSync(path.join(root, "rollout-invalid")) && process.cwd().endsWith("/a");
    console.log(JSON.stringify({name:"fixture",services:{app:{image:"fixture/shared:latest",
        ...(invalidRollout ? {labels:{"dockge.rollout.enabled":"true"},ports:[{published:"8080"}]} : {})}}}));
}
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
    performRollback(key: string): Promise<void>;
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
    for (const file of [ "block", "entered", "release", "rollout-invalid", "rollout-valid", "rollout-runtime" ]) {
        await fs.rm(path.join(root, file), { force: true });
    }
});

test("ImageWatcher executes rolling update, recreates only remaining services, persists metadata/history and preserves rollback", async () => {
    await fs.writeFile(path.join(root, "rollout-valid"), "");
    const w = watcher();
    assert.equal(await w.performAutoUpdate(status("a"), watched("a"), "scheduled"), true);
    const calls = await commands();
    assert.ok(calls.some(args => args.includes("--scale") && args.includes("app=2")));
    const ordinary = calls.filter(args => args.includes("--force-recreate"));
    assert.equal(ordinary.length, 1);
    assert.ok(ordinary[0].includes("sibling") && !ordinary[0].includes("app"));
    assert.ok(calls.findIndex(args => args[0] === "tag") < calls.findIndex(args => args.includes("--scale")), "rollback is protected before replacement");
    assert.equal(updateHistoryStore[0].success, true);
    assert.equal(updateHistoryStore[0].mode, "scheduled");
    assert.ok(JSON.parse(await fs.readFile(path.join(root, "stacks", "a", ".dockge-meta.json"), "utf8")).lastUpdated);
    assert.equal(JSON.parse(await fs.readFile(path.join(root, "data", "update-history.json"), "utf8"))[0].success, true);
    await w.performRollback(key("a"));
    const rollbackCalls = (await commands()).slice(calls.length);
    assert.ok(rollbackCalls.some(args => args[0] === "tag" && args[1] === "sha256:" + "d".repeat(64)));
    assert.ok(rollbackCalls.some(args => args.includes("up") && args.includes("app") && args.includes("sibling")));
    assert.equal(rollbackCalls.some(args => args.includes("--scale")), false, "explicit rollback retains the ordinary recreation contract");
    assert.equal(rollbackStore.has(key("a")), false);
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

test("rolling prerequisites veto every update mode without fallback or contaminating a shared image", async () => {
    await fs.writeFile(path.join(root, "rollout-invalid"), "");
    for (const mode of [ "immediate", "scheduled", "manual" ] as const) {
        const instance = watcher();
        await fs.writeFile(path.join(root, "commands"), "");
        assert.equal(await instance.performAutoUpdate(status("a"), watched("a"), mode), false);
        assert.equal((await commands()).some(args => args.includes("pull") || args.includes("up")), false);
        assert.match(updateHistoryStore[0].error ?? "", /ports/);
        // A failed rollout must release the shared reservation. The same image
        // in another stack without opt-in keeps the ordinary update behavior.
        assert.equal(await instance.performAutoUpdate(status("b"), watched("b"), mode), true);
    }
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
