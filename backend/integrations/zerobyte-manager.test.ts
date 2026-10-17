import test from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { ZerobyteManager, normalizeZerobyteUrl } from "./zerobyte-manager";

test("URL parser rejects credentials, paths and unexpected protocols", () => {
    assert.equal(normalizeZerobyteUrl("http://zerobyte:4096/"), "http://zerobyte:4096");
    for (const url of [ "file:///etc/passwd", "http://user:password@127.0.0.1", "https://server/api/v1", "https://server?secret=1" ]) {
        assert.throws(() => normalizeZerobyteUrl(url));
    }
});

test("secret persists safely and never appears in the safe settings", async () => {
    const dir = await fs.mkdtemp(path.join(tmpdir(), "zerobyte-test-"));
    try {
        const manager = new ZerobyteManager(dir);
        assert.deepEqual(await manager.getSafeConfig(), { enabled: false,
            url: "",
            hasApiKey: false,
            restoreEnabled: false,
            externalRisksAcknowledged: false,
            externalRestoreRoot: "" });
        await manager.saveConfig({ enabled: true,
            url: "http://zerobyte:4096",
            apiKey: "secret-1" });
        const safe = await manager.getSafeConfig();
        assert.equal(safe.hasApiKey, true);
        assert.equal(JSON.stringify(safe).includes("secret-1"), false);
        const stat = await fs.stat(path.join(dir, "zerobyte-settings.json"));
        assert.equal(stat.mode & 0o777, 0o600);
        const unchanged = await manager.saveConfig({ enabled: true,
            url: "http://zerobyte:4096" });
        assert.equal(unchanged.hasApiKey, true);
        await assert.rejects(manager.saveConfig({ enabled: true,
            url: "http://other-host:4096" }), /API key/);
        await manager.saveConfig({ enabled: false,
            url: "" });
        assert.equal((await manager.getSafeConfig()).enabled, false);
        assert.equal((await manager.getSafeConfig()).url, "http://zerobyte:4096");
        assert.equal((await manager.getSafeConfig()).hasApiKey, true);
    } finally {
        await fs.rm(dir, { recursive: true,
            force: true });
    }
});

test("list/run/create and retention use guarded routes without exposing upstream secrets", async () => {
    const dir = await fs.mkdtemp(path.join(tmpdir(), "zerobyte-test-"));
    const oldFetch = globalThis.fetch;
    const calls: Array<{ url: string;
        method: string;
        key: string | null;
        payload?: unknown }> = [];
    try {
        const manager = new ZerobyteManager(dir);
        await manager.saveConfig({ enabled: true,
            url: "http://zerobyte:4096",
            apiKey: "api-key-test" });
        globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
            const url = String(input);
            const headers = new Headers(init?.headers);
            calls.push({ url,
                method: init?.method || "GET",
                key: headers.get("x-api-key"),
                ...(init?.body ? { payload: JSON.parse(String(init.body)) } : {}) });
            let data: unknown = [];
            if (url.endsWith("/backups")) {
                data = [{ shortId: "ab12",
                    name: "Test",
                    enabled: true,
                    lastBackupStatus: "success",
                    repositoryId: "r1" }];
            }
            if (url.endsWith("/repositories")) {
                data = [{ shortId: "r1",
                    name: "Repo",
                    config: { password: "DO_NOT_LEAK" } }];
            }
            if (url.endsWith("/volumes")) {
                data = [{ id: 1,
                    name: "Documents" }];
            }
            if (url.endsWith("/repositories/r1/stats")) {
                data = { totalSize: 1000,
                    snapshotCount: 2 };
            }
            if (url.endsWith("/backups/ab12/run")) {
                data = { taskId: "task-1",
                    status: "started" };
            }
            if (url.endsWith("/backups/ab12/forget")) {
                data = { taskId: "task-2",
                    status: "started" };
            }
            return new Response(JSON.stringify(data), { status: 200,
                headers: { "Content-Type": "application/json" } });
        };
        const overview = await manager.overview();
        assert.equal(overview.jobs.length, 1);
        assert.equal(overview.repositories[0].storedBytes, 1000);
        assert.equal(JSON.stringify(overview).includes("DO_NOT_LEAK"), false);
        await manager.runBackup("ab12");
        await assert.rejects(manager.runBackup("../../etc/passwd"), /identifier/);
        await assert.rejects(manager.applyRetention("ab12", ""), /confirmation/);
        await manager.applyRetention("ab12", "CLEANUP");
        await manager.createJob({ name: "Safe",
            repositoryId: "r1",
            volumeId: 1,
            cronExpression: "0 3 * * *" });
        assert.equal((calls.at(-1)?.payload as { enabled: boolean }).enabled, false);
        assert.ok(calls.every(call => call.key === "api-key-test"));
    } finally {
        globalThis.fetch = oldFetch;
        await fs.rm(dir, { recursive: true,
            force: true });
    }
});

test("staged restoration refuses unconfigured target and any missing confirmation", async () => {
    const dir = await fs.mkdtemp(path.join(tmpdir(), "zerobyte-test-"));
    const old = process.env.DOCKGE_ZEROBYTE_RESTORE_ROOT;
    try {
        delete process.env.DOCKGE_ZEROBYTE_RESTORE_ROOT;
        const manager = new ZerobyteManager(dir);
        await assert.rejects(manager.stagedRestore("r1", "s1", "RESTORE"), /dedicated restore root/);
        process.env.DOCKGE_ZEROBYTE_RESTORE_ROOT = "/restore-test";
        await assert.rejects(manager.stagedRestore("r1", "s1", ""), /confirmation/);
    } finally {
        if (old === undefined) {
            delete process.env.DOCKGE_ZEROBYTE_RESTORE_ROOT;
        } else {
            process.env.DOCKGE_ZEROBYTE_RESTORE_ROOT = old;
        }
        await fs.rm(dir, { recursive: true,
            force: true });
    }
});

test("activation can be persisted before setup and OFF retains configured credentials", async () => {
    const dir = await fs.mkdtemp(path.join(tmpdir(), "zerobyte-activation-"));
    try {
        const manager = new ZerobyteManager(dir);
        assert.equal((await manager.saveConfig({ enabled: true })).enabled, true);
        await manager.saveConfig({ enabled: true,
            url: "http://zerobyte:4096",
            apiKey: "retained-secret" });
        const off = await manager.saveConfig({ enabled: false,
            url: "http://zerobyte:4096" });
        assert.equal(off.hasApiKey, true);
        await assert.rejects(manager.overview(), /not configured/);
        const on = await manager.saveConfig({ enabled: true,
            url: off.url });
        assert.equal(on.hasApiKey, true);
    } finally {
        await fs.rm(dir, { recursive: true,
            force: true });
    }
});

test("upstream response size is bounded even without content-length", async () => {
    const dir = await fs.mkdtemp(path.join(tmpdir(), "zerobyte-bound-"));
    const oldFetch = globalThis.fetch;
    try {
        const manager = new ZerobyteManager(dir);
        await manager.saveConfig({ enabled: true,
            url: "http://zerobyte:4096",
            apiKey: "secret" });
        globalThis.fetch = async () => new Response("x".repeat(2 * 1024 * 1024 + 1));
        await assert.rejects(manager.testConnection(), /size or time limits/);
    } finally {
        globalThis.fetch = oldFetch;
        await fs.rm(dir, { recursive: true,
            force: true });
    }
});

test("inventory rejects incompatible schemas and incomplete job visibility", async () => {
    const dir = await fs.mkdtemp(path.join(tmpdir(), "zerobyte-schema-"));
    const oldFetch = globalThis.fetch;
    try {
        const manager = new ZerobyteManager(dir);
        await manager.saveConfig({ enabled: true,
            url: "http://zerobyte:4096",
            apiKey: "secret" });
        for (const jobs of [{}, [{ shortId: "j1" }], Array.from({ length: 501 }, (_, i) => ({ shortId: `j${i}`,
            enabled: false })) ]) {
            globalThis.fetch = async input => new Response(JSON.stringify(String(input).endsWith("/backups") ? jobs : []));
            await assert.rejects(manager.overview(), /Unsupported Zerobyte/);
        }
    } finally {
        globalThis.fetch = oldFetch;
        await fs.rm(dir, { recursive: true,
            force: true });
    }
});

test("external restore approval is scoped to both URL and API key, never inherited from environment", async () => {
    const dir = await fs.mkdtemp(path.join(tmpdir(), "zerobyte-external-"));
    const oldFetch = globalThis.fetch;
    try {
        const manager = new ZerobyteManager(dir);
        await assert.rejects(manager.saveConfig({ enabled: true,
            url: "http://external:4096",
            apiKey: "key1",
            externalRestoreRoot: "/restore-test" }), /acknowledgement/);
        await manager.saveConfig({ enabled: true,
            url: "http://external:4096",
            apiKey: "key1",
            acknowledgeExternalRisks: true,
            externalRestoreRoot: "/restore-test" });
        assert.equal((await manager.getSafeConfig()).restoreEnabled, true);
        globalThis.fetch = async (_input, init) => {
            if (init?.method === "GET") {
                return new Response("[]");
            }
            const payload = JSON.parse(String(init?.body));
            assert.equal(payload.delete, false);
            assert.equal(payload.overwrite, "never");
            assert.ok(payload.targetPath.startsWith("/restore-test/dockge-"));
            return new Response("{}");
        };
        await manager.stagedRestore("r1", "s1", "RESTORE");
        for (const root of [ "/", "/sources/a", "/destinations/a", "/var/lib/zerobyte/data", "/tmp", "/restore/../app" ]) {
            await assert.rejects(manager.saveConfig({ enabled: true,
                externalRestoreRoot: root }), /restore root|Restore root/);
        }
        await manager.saveConfig({ enabled: true,
            url: "http://external:4096",
            apiKey: "key2" });
        assert.equal((await manager.getSafeConfig()).restoreEnabled, false);
        assert.equal((await manager.getSafeConfig()).externalRisksAcknowledged, false);
        await assert.rejects(manager.stagedRestore("r1", "s1", "RESTORE"), /dedicated restore root/);
        await manager.saveConfig({ enabled: true,
            url: "http://different:4096",
            apiKey: "key3" });
        assert.equal((await manager.getSafeConfig()).externalRestoreRoot, "");
    } finally {
        globalThis.fetch = oldFetch;
        await fs.rm(dir, { recursive: true,
            force: true });
    }
});

test("external restore refuses a root containing a known source even after explicit approval", async () => {
    const dir = await fs.mkdtemp(path.join(tmpdir(), "zerobyte-overlap-"));
    const oldFetch = globalThis.fetch;
    try {
        const manager = new ZerobyteManager(dir);
        await manager.saveConfig({ enabled: true,
            url: "http://external:4096",
            apiKey: "key",
            acknowledgeExternalRisks: true,
            externalRestoreRoot: "/restore-test" });
        globalThis.fetch = async input => new Response(JSON.stringify(String(input).endsWith("/volumes") ? [{ config: { backend: "directory",
            path: "/restore-test/application" } }] : []));
        await assert.rejects(manager.stagedRestore("repo", "snap", "RESTORE"), /overlaps a known source/);
    } finally {
        globalThis.fetch = oldFetch;
        await fs.rm(dir, { recursive: true,
            force: true });
    }
});

test("external diagnostics are read-only, filter secrets, and never certify physical mounts", async () => {
    const dir = await fs.mkdtemp(path.join(tmpdir(), "zerobyte-diagnostic-"));
    const oldFetch = globalThis.fetch;
    try {
        const manager = new ZerobyteManager(dir);
        await manager.saveConfig({ enabled: true,
            url: "http://external:4096",
            apiKey: "private-key",
            acknowledgeExternalRisks: true,
            externalRestoreRoot: "/restore-test" });
        globalThis.fetch = async (_input, init) => {
            assert.equal(init?.method, "GET");
            return new Response(JSON.stringify([]));
        };
        const result = await manager.diagnostics();
        assert.equal(result.readOnly, true);
        assert.equal(result.checks.find(c => c.key === "physicalMounts")?.state, "operator");
        assert.equal(result.checks.find(c => c.key === "restoreSeparation")?.state, "pass");
        assert.ok(!JSON.stringify(result).includes("private-key"));
        globalThis.fetch = async () => {
            throw new Error("private-key");
        };
        assert.equal((await manager.diagnostics()).checks.find(c => c.key === "apiInventory")?.state, "fail");
    } finally {
        globalThis.fetch = oldFetch;
        await fs.rm(dir, { recursive: true,
            force: true });
    }
});

test("migration PATCH supplies required repository and cron and preserves API retry delay in minutes", async () => {
    const dir = await fs.mkdtemp(path.join(tmpdir(), "zerobyte-migration-api-"));
    const oldFetch = globalThis.fetch;
    try {
        const manager = new ZerobyteManager(dir);
        await manager.saveConfig({ enabled: true,
            url: "http://fixture:4096",
            apiKey: "key" });
        globalThis.fetch = async (_input, init) => {
            if (init?.method === "PATCH") {
                assert.deepEqual(JSON.parse(String(init.body)), { repositoryId: "repo",
                    cronExpression: "0 3 * * *",
                    retryDelay: 15,
                    backupWebhooks: { pre: null,
                        post: null },
                    maxRetries: 0 });
                return new Response("{}");
            }
            return new Response(JSON.stringify({ enabled: false,
                repositoryId: "repo",
                cronExpression: "0 3 * * *",
                retryDelay: 15 }));
        };
        await manager.updateWorkflowJob("job", { pre: null,
            post: null });
    } finally {
        globalThis.fetch = oldFetch;
        await fs.rm(dir, { recursive: true,
            force: true });
    }
});
