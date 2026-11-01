import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import axios from "axios";
import type { ImageStatus, WatchedComposeStack } from "./image-watcher";

test("a running untagged image remains updateable and an absent running image stays unknown", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "watcher-missing-tag-"));
    const saved = { PATH: process.env.PATH,
        DOCKGE_DATA_DIR: process.env.DOCKGE_DATA_DIR };
    const adapter = axios.defaults.adapter;
    const old = `sha256:${"a".repeat(64)}`;
    const next = `sha256:${"b".repeat(64)}`;
    let restoreSettings: (() => void) | undefined;
    try {
        await fs.writeFile(path.join(root, "docker"), `#!${process.execPath}
const fs = require("node:fs");
const args = process.argv.slice(2);
if (args.includes("config")) console.log(JSON.stringify({services:{app:{image:"ghcr.io/fixture/app:latest"}}}));
else if (args.includes("ps")) console.log(fs.existsSync(${JSON.stringify(path.join(root, "absent"))}) ? "" : "container-app");
else if (args[0] === "container") console.log(${JSON.stringify(old)});
else if (args.at(-1) === ${JSON.stringify(old)}) console.log(JSON.stringify({Id:${JSON.stringify(old)},RepoDigests:fs.existsSync(${JSON.stringify(path.join(root, "no-digest"))})?[]:["ghcr.io/fixture/app@"+${JSON.stringify(old)}],Os:"linux",Architecture:"amd64"}));
else { console.error("No such image"); process.exit(1); }
`, { mode: 0o700 });
        process.env.PATH = `${root}${path.delimiter}${saved.PATH}`;
        process.env.DOCKGE_DATA_DIR = root;
        const { ImageWatcher } = await import("./image-watcher");
        const { Settings } = await import("../settings");
        const get = Settings.get;
        Settings.get = async () => null;
        restoreSettings = () => {
            Settings.get = get;
        };
        axios.defaults.adapter = async config => ({ data: { schemaVersion: 2 },
            status: 200,
            statusText: "OK",
            headers: { "docker-content-digest": next },
            config });
        const watcher = new ImageWatcher(root) as unknown as {
            checkOneImage(image: string, stack: string, watched: WatchedComposeStack): Promise<ImageStatus>;
        };
        const watched = { composePath: path.join(root, "compose.yaml") };
        const status = await watcher.checkOneImage("ghcr.io/fixture/app:latest", "fixture", watched);
        assert.equal(status.hasUpdate, true);
        assert.equal(status.localDigest, old);
        assert.equal(status.error, undefined);
        await fs.writeFile(path.join(root, "no-digest"), "");
        const noDigest = await watcher.checkOneImage("ghcr.io/fixture/app:latest", "fixture", watched);
        assert.equal(noDigest.hasUpdate, true);
        assert.equal(noDigest.error, undefined);
        assert.equal(noDigest.localDigest, "");
        await fs.writeFile(path.join(root, "absent"), "");
        const absent = await watcher.checkOneImage("ghcr.io/fixture/app:latest", "fixture", watched);
        assert.match(absent.error ?? "", /Aucun digest local comparable/);
    } finally {
        restoreSettings?.();
        axios.defaults.adapter = adapter;
        for (const [ key, value ] of Object.entries(saved)) {
            if (value === undefined) {
                delete process.env[key];
            } else {
                process.env[key] = value;
            }
        }
        await fs.rm(root, { recursive: true,
            force: true });
    }
});
