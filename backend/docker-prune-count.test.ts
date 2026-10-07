import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

test("une purge de quinze images ne refait pas quinze inventaires Docker", async () => {
    const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "dockge-prune-count-"));
    const docker = path.join(temporary, "docker");
    const callsPath = path.join(temporary, "calls.jsonl");
    const previousPath = process.env.PATH;
    const previousDataDir = process.env.DOCKGE_DATA_DIR;
    const previousLog = process.env.DOCKGE_PRUNE_FIXTURE_LOG;
    try {
        fs.copyFileSync(path.join(process.cwd(), "backend/test-fixtures/docker-prune-fixture.cjs"), docker);
        fs.chmodSync(docker, 0o755);
        process.env.PATH = `${temporary}${path.delimiter}${previousPath}`;
        process.env.DOCKGE_DATA_DIR = temporary;
        process.env.DOCKGE_PRUNE_FIXTURE_LOG = callsPath;
        const rollbackId = `sha256:${"2".padStart(64, "0")}`;
        fs.writeFileSync(path.join(temporary, "rollback-registry.json"), JSON.stringify([{ oldImageId: rollbackId,
            expiresAt: "2099-01-01T00:00:00Z" }]));

        const { AutoPruneManager } = await import("./watchers/auto-prune-manager");
        const result = await AutoPruneManager.getInstance().runUnusedPrune(false);
        const calls = fs.readFileSync(callsPath, "utf8").trim().split("\n").map(line => JSON.parse(line) as string[]);
        const isCall = (...prefix: string[]) => (args: string[]) => prefix.every((part, index) => args[index] === part);

        assert.deepEqual(result.errors, []);
        assert.equal(result.removed.length, 15);
        assert.equal(calls.filter(isCall("images", "-a")).length, 1);
        assert.equal(calls.filter(isCall("inspect", "fixture-active-container")).length, 1);
        assert.equal(calls.filter(isCall("image", "inspect")).filter(args => args.length > 3).length, 1);
        assert.equal(calls.filter(isCall("image", "inspect")).filter(args => args.length === 3).length, 15);
        assert.equal(calls.filter(isCall("ps", "-aq", "--filter")).length, 15);
        assert.equal(calls.filter(isCall("rmi")).length, 15);
        assert.ok(!calls.some(args => args.includes("fixture/active:latest") || args.includes("fixture/rollback:latest")));
    } finally {
        if (previousPath === undefined) {
            delete process.env.PATH;
        } else {
            process.env.PATH = previousPath;
        }
        if (previousDataDir === undefined) {
            delete process.env.DOCKGE_DATA_DIR;
        } else {
            process.env.DOCKGE_DATA_DIR = previousDataDir;
        }
        if (previousLog === undefined) {
            delete process.env.DOCKGE_PRUNE_FIXTURE_LOG;
        } else {
            process.env.DOCKGE_PRUNE_FIXTURE_LOG = previousLog;
        }
        fs.rmSync(temporary, { recursive: true,
            force: true });
    }
});
