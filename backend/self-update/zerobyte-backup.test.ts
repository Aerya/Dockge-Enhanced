import assert from "node:assert/strict";
import test from "node:test";
import * as fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createServer } from "node:http";
import { ZerobyteManager } from "../integrations/zerobyte-manager";
import { runZerobyteSelfUpdateBackup, validateSelfUpdateJob } from "./zerobyte-backup";

const settings = { zerobyteJobId: "enhanced",
    zerobyteDataPath: "/sources/data" };
const job = () => ({ shortId: "enhanced",
    enabled: false,
    maxRetries: 0,
    repositoryId: "repository-uuid",
    repository: { id: "repository-uuid",
        shortId: "repo" },
    volume: { config: { backend: "directory",
        path: "/sources/data" } } });
const completed = () => ({ id: "task",
    kind: "backup",
    resourceId: "enhanced",
    status: "succeeded",
    result: { kind: "backup",
        exitCode: 0,
        warningDetails: null,
        result: { snapshot_id: "a".repeat(64) } } });

test("dedicated backup refuses partial coverage, scheduling, retries and stop hooks", () => {
    assert.equal(validateSelfUpdateJob(job(), "enhanced", "/sources/data"), "repo");
    for (const change of [
        { enabled: true }, { maxRetries: 2 }, { includePaths: [ "/one-file" ] },
        { excludePatterns: [ "*.db" ] }, { excludeIfPresent: [ ".ignore" ] },
        { includePatterns: [ "*.json" ] }, { customResticParams: [ "--exclude=*.db" ] },
        { backupWebhooks: { pre: { url: "https://stop.invalid" } } }, { shortId: "other" },
        { repository: { id: "another-repository",
            shortId: "repo" } },
        { repository: { id: "repository-uuid" } },
    ]) {
        assert.throws(() => validateSelfUpdateJob({ ...job(),
            ...change }, "enhanced", "/sources/data"));
    }
    assert.throws(() => validateSelfUpdateJob(job(), "enhanced", "/wrong-data"));
});

test("fresh task and recovery-file verification fail closed", async t => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "self-zb-"));
    const file = path.join(dir, "operation.json");
    const recovery = { id: "fresh-operation",
        container: "fixture" };
    await fs.writeFile(file, JSON.stringify(recovery));
    try {
        const base = {
            job: async () => job(),
            runBackup: async () => ({ taskId: "task" }),
            task: async () => completed(),
            recoverySnapshotFile: async () => recovery,
        };
        for (const [ name, override ] of Object.entries({
            "old recovery": { recoverySnapshotFile: async () => ({ id: "old-operation" }) },
            "wrong task": { task: async () => ({ ...completed(),
                resourceId: "another-job" }) },
            "failed backup": { task: async () => ({ ...completed(),
                status: "failed" }) },
            "partial backup": { task: async () => ({ ...completed(),
                outcome: "warning" }) },
            "missing snapshot": { task: async () => ({ ...completed(),
                result: {} }) },
            "partial Restic exit without outcome": { task: async () => ({ ...completed(),
                result: { ...completed().result,
                    exitCode: 3 } }) },
            "warning without outcome": { task: async () => ({ ...completed(),
                result: { ...completed().result,
                    warningDetails: "Unreadable files" } }) },
            "missing exit code": { task: async () => ({ ...completed(),
                result: { kind: "backup",
                    result: completed().result.result } }) },
            "network failure": { task: async () => {
                throw new Error("offline");
            } },
            "missing task": { runBackup: async () => ({}) },
        })) {
            await t.test(name, async () => {
                await assert.rejects(runZerobyteSelfUpdateBackup(settings, file, async () => {}, { client: { ...base,
                    ...override } }));
            });
        }
        let time = 0;
        await assert.rejects(runZerobyteSelfUpdateBackup(settings, file, async () => {}, {
            client: { ...base,
                task: async () => ({ ...completed(),
                    status: "running" }) },
            now: () => time,
            wait: async () => {
                time += 100;
            },
            timeoutMs: 200,
        }), /timed out/);
        let checks = 0;
        await assert.rejects(runZerobyteSelfUpdateBackup(settings, file, async () => {}, {
            client: { ...base,
                job: async () => ({ ...job(),
                    repository: { id: "repository-uuid",
                        shortId: ++checks === 1 ? "repo" : "changed" } }) },
        }), /changed/);
    } finally {
        await fs.rm(dir, { recursive: true,
            force: true });
    }
});

test("local HTTP API: await exact task, download exact snapshot file, pin credentials", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "self-zb-http-"));
    const file = path.join(dir, "operation.json");
    const recovery = { id: "fresh",
        state: "fixture" };
    await fs.writeFile(file, JSON.stringify(recovery));
    const calls: string[] = [];
    let polls = 0;
    const server = createServer((req, res) => {
        calls.push(`${req.method} ${req.url}`);
        assert.equal(req.headers["x-api-key"], "fixture-key");
        let body: unknown;
        if (req.url === "/api/v1/backups/enhanced") {
            body = job();
        } else if (req.url === "/api/v1/backups/enhanced/run") {
            body = { taskId: "task" };
        } else if (req.url === "/api/v1/tasks/task") {
            body = ++polls === 1 ? { ...completed(),
                status: "running" } : completed();
        } else if (req.url?.includes("/dump?")) {
            const url = new URL(req.url, "http://localhost");
            assert.ok(url.pathname.startsWith("/api/v1/repositories/repo/snapshots/"));
            assert.equal(url.searchParams.get("path"), "/sources/data/self-update/recovery/operation.json");
            assert.equal(url.searchParams.get("kind"), "file");
            body = recovery;
        } else {
            res.statusCode = 404;
            body = {};
        }
        res.end(JSON.stringify(body));
    });
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    try {
        const address = server.address();
        assert.ok(address && typeof address !== "string");
        const manager = new ZerobyteManager(dir);
        await manager.saveConfig({ enabled: true,
            url: `http://127.0.0.1:${address.port}`,
            apiKey: "fixture-key" });
        const client = await manager.session();
        await manager.saveConfig({ enabled: false });
        let verified = false;
        await runZerobyteSelfUpdateBackup(settings, file, async () => {
            verified = true;
        }, { client,
            wait: async () => {} });
        assert.equal(verified, true);
        assert.equal(polls, 2);
        assert.equal(calls.filter(c => c.startsWith("POST")).length, 1);
        assert.ok(calls.at(-1)?.includes("a".repeat(64)));
    } finally {
        await new Promise<void>(resolve => server.close(() => resolve()));
        await fs.rm(dir, { recursive: true,
            force: true });
    }
});
