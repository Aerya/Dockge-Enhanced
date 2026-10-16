import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { ZerobyteWorkflows } from "./zerobyte-workflows";
import { ZerobyteManager } from "./zerobyte-manager";
import { DockgeServer } from "../dockge-server";
import { isZerobyteApplicationBackupActive, setZerobyteApplicationBackupActive } from "./zerobyte-coordination";

async function fixture() {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "zerobyte-workflow-"));
    const events: string[] = [];
    let taskState = "running";
    let unavailable = false;
    let nativeBusy = false;
    let restartFailure = false;
    const server = { config: { dataDir: dir } } as DockgeServer;
    const volumes: Record<string, unknown>[] = [];
    const repositories: Record<string, unknown>[] = [];
    const jobs: Record<string, unknown>[] = [];
    const manager = {
        resources: async () => ({ volumes,
            repositories,
            jobs }),
        createVolume: async (name: string, source: string) => {
            const v = { id: 1,
                name,
                config: { backend: "directory",
                    path: source } };
            volumes.push(v);
            return v;
        },
        createRepository: async (name: string, target: string) => {
            const r = { id: "repo",
                shortId: "repo",
                name,
                config: { backend: "local",
                    path: target + "/repo" } };
            repositories.push(r);
            return r;
        },
        createWorkflowJob: async (body: Record<string, unknown>) => {
            const job = { ...body,
                id: 4,
                shortId: "job4",
                enabled: false };
            jobs.push(job);
            return job;
        },
        task: async () => ({ status: taskState,
            kind: "backup",
            resourceId: "job4" }),
        cancelTask: async () => {
            events.push("cancel");
        },
    } as unknown as ZerobyteManager;
    const deps = {
        context: async () => ({ owner: "owner",
            localMounts: [{ target: "/sources/test" }],
            destinationMounts: [{ target: "/destinations/test" }],
            callbackOrigin: "http://enhanced:5001" }) as never,
        probe: async () => {
            events.push("probe");
            if (unavailable) {
                throw new Error("network unavailable");
            }
        },
        nativeBusy: () => nativeBusy,
        plan: async (names: string[]) => names.map(stack => ({ stack,
            compose: "/test/compose.yaml",
            project: "fixture",
            services: [ "app" ] })),
        stop: async () => {
            events.push("stop");
        },
        restore: async (plans: unknown[]) => {
            events.push("restore:" + plans.length);
            return restartFailure ? [ "failed" ] : [];
        },
        notify: async () => {
            events.push("alert");
        },
    };
    const workflows = new ZerobyteWorkflows(server, manager, deps);
    const input = { name: "safe",
        source: "/sources/test",
        destination: "/destinations/test",
        stacks: [ "fixture" ],
        confirmation: "PROVISION ZEROBYTE" };
    const provision = await workflows.provision(input);
    const state = JSON.parse(await fs.readFile(path.join(dir, "zerobyte-workflows.json"), "utf8"));
    const workflow = state.workflows[0];
    const body = { scheduleId: "job4",
        jobId: "task-1",
        sourcePath: "/sources/test" };
    return { dir,
        workflows,
        deps,
        manager,
        input,
        provision,
        workflow,
        body,
        events,
        jobs,
        volumes,
        repositories,
        runningTask: () => {
            taskState = "running";
        },
        failedTask: () => {
            taskState = "failed";
        },
        failNetwork: () => {
            unavailable = true;
        },
        busyNative: () => {
            nativeBusy = true;
        },
        failRestart: () => {
            restartFailure = true;
        },
        cleanup: async () => {
            workflows.stop();
            setZerobyteApplicationBackupActive(false);
            await fs.rm(dir, { recursive: true,
                force: true });
        } };
}
test("confirmed provisioning is idempotent, disabled, without retention and hides callback secrets", async () => {
    const f = await fixture();
    try {
        assert.equal((await f.workflows.provision(f.input)).reused, true);
        assert.equal(f.jobs.length, 1);
        assert.equal(f.volumes.length, 1);
        assert.equal(f.repositories.length, 1);
        assert.equal(f.jobs[0].enabled, false);
        assert.equal(f.jobs[0].retentionPolicy, undefined);
        assert.ok(!JSON.stringify(await f.workflows.status()).includes(f.workflow.token));
        assert.equal((await fs.stat(path.join(f.dir, "zerobyte-workflows.json"))).mode & 0o777, 0o600);
        await assert.rejects(f.workflows.provision({ ...f.input,
            maxMinutes: 12 }), /different settings/);
    } finally {
        await f.cleanup();
    }
});
test("outage blocks backup before stopping applications and leaves a persistent failure alert", async () => {
    const f = await fixture();
    try {
        f.failNetwork();
        await assert.rejects(f.workflows.hook(f.workflow.id, "pre", "Bearer " + f.workflow.token, f.body), /network unavailable/);
        assert.ok(!f.events.includes("stop"));
        assert.ok(f.events.includes("alert"));
        assert.equal((await f.workflows.status()).active, null);
        assert.equal(isZerobyteApplicationBackupActive(), false);
        assert.equal((await f.workflows.status()).events[0].state, "failure");
    } finally {
        await f.cleanup();
    }
});
test("official pre/post hooks serialize native backup and restore only selected originally running services after failure", async () => {
    const f = await fixture();
    try {
        await assert.rejects(f.workflows.hook(f.workflow.id, "pre", "wrong", f.body), /credential/);
        await f.workflows.hook(f.workflow.id, "pre", "Bearer " + f.workflow.token, f.body);
        assert.ok(isZerobyteApplicationBackupActive());
        assert.ok(f.events.includes("stop"));
        await assert.rejects(f.workflows.assertIdle(), /active/);
        await assert.rejects(f.workflows.hook(f.workflow.id, "post", "Bearer " + f.workflow.token, { ...f.body,
            status: "error" }), /failure alert/);
        assert.ok(f.events.includes("restore:1"));
        assert.equal(isZerobyteApplicationBackupActive(), false);
    } finally {
        await f.cleanup();
    }
});
test("missing post hook is recovered from persisted journal by another manager instance", async () => {
    const f = await fixture();
    try {
        await f.workflows.hook(f.workflow.id, "pre", "Bearer " + f.workflow.token, f.body);
        f.failedTask();
        const recovered = new ZerobyteWorkflows({ config: { dataDir: f.dir } } as DockgeServer, f.manager, f.deps);
        await recovered.tick();
        assert.equal((await recovered.status()).active, null);
        assert.ok(f.events.includes("restore:1"));
        assert.equal((await recovered.status()).events[0].state, "failure");
    } finally {
        await f.cleanup();
    }
});
test("native activity prevents stopping stacks; failed service restart retains recovery journal", async () => {
    const f = await fixture();
    try {
        f.busyNative();
        await assert.rejects(f.workflows.hook(f.workflow.id, "pre", "Bearer " + f.workflow.token, f.body), /native restore/);
        assert.ok(!f.events.includes("stop"));
    } finally {
        await f.cleanup();
    }
    const second = await fixture();
    try {
        await second.workflows.hook(second.workflow.id, "pre", "Bearer " + second.workflow.token, second.body);
        second.failRestart();
        await assert.rejects(second.workflows.hook(second.workflow.id, "post", "Bearer " + second.workflow.token, { ...second.body,
            status: "success" }), /journal retained/);
        assert.ok((await second.workflows.status()).active);
        assert.ok(isZerobyteApplicationBackupActive());
    } finally {
        await second.cleanup();
    }
});

test("outage during a running job cancels it, recovers services and pauses schedules until terminal-task acknowledgement", async () => {
    const f = await fixture();
    try {
        await f.workflows.hook(f.workflow.id, "pre", "Bearer " + f.workflow.token, f.body);
        f.runningTask();
        f.failNetwork();
        await f.workflows.tick();
        assert.ok(f.events.includes("cancel"));
        assert.ok(f.events.includes("restore:1"));
        assert.equal((await f.workflows.status()).active, null);
        await assert.rejects(f.workflows.hook(f.workflow.id, "pre", "Bearer " + f.workflow.token, { ...f.body,
            jobId: "task-2" }), /paused/);
        await assert.rejects(f.workflows.acknowledge(f.workflow.id, "ACKNOWLEDGE WORKFLOW"), /not confirmed/);
        f.failedTask();
        await f.workflows.acknowledge(f.workflow.id, "ACKNOWLEDGE WORKFLOW");
        assert.equal((await f.workflows.status()).events[0].state, "recovered");
    } finally {
        await f.cleanup();
    }
});

test("post hook queues behind watchdog probing instead of being rejected as busy", async () => {
    const f = await fixture();
    try {
        await f.workflows.hook(f.workflow.id, "pre", "Bearer " + f.workflow.token, f.body);
        f.runningTask();
        let release!: () => void;
        let entered!: () => void;
        let block = true;
        const ready = new Promise<void>(resolve => {
            entered = resolve;
        });
        const probeWait = new Promise<void>(resolve => {
            release = resolve;
        });
        const coordinator = new ZerobyteWorkflows({ config: { dataDir: f.dir } } as DockgeServer, f.manager, {
            ...f.deps,
            probe: async () => {
                if (block) {
                    entered();
                    await probeWait;
                }
            },
        });
        const tick = coordinator.tick();
        await ready;
        const post = coordinator.hook(f.workflow.id, "post", "Bearer " + f.workflow.token, { ...f.body,
            status: "success" });
        block = false;
        release();
        await Promise.all([ tick, post ]);
        assert.equal((await coordinator.status()).events[0].state, "success");
        assert.equal((await coordinator.status()).active, null);
    } finally {
        await f.cleanup();
    }
});

test("a delayed pre-hook for a cancelled task never stops an application", async () => {
    const f = await fixture();
    try {
        f.failedTask();
        await assert.rejects(f.workflows.hook(f.workflow.id, "pre", "Bearer " + f.workflow.token, f.body), /no longer active/);
        assert.ok(!f.events.includes("stop"));
        assert.equal((await f.workflows.status()).active, null);
    } finally {
        await f.cleanup();
    }
});

test("migration preserves repositories and history, refuses enabled/shared/custom-hook jobs, and retries an uncertain API response", async () => {
    const f = await fixture();
    try {
        const original = { id: 8,
            shortId: "legacy",
            name: "Legacy",
            enabled: false,
            volumeId: 1,
            repositoryId: "repo",
            cronExpression: "0 3 * * *",
            retentionPolicy: { keepLast: 7 },
            backupWebhooks: null };
        f.jobs.push(original);
        // Give this legacy job its own existing repository, including historical snapshot metadata.
        f.repositories.push({ id: "legacyRepo",
            shortId: "legacyRepo",
            config: { backend: "local",
                path: "/destinations/test/history/legacyRepo" },
            snapshotCount: 12 });
        original.repositoryId = "legacyRepo";
        f.manager.overview = async () => ({ tasks: [] }) as never;
        f.manager.job = async () => original;
        let failOnce = true;
        f.manager.updateWorkflowJob = async (_id, hooks) => {
            Object.assign(original, { backupWebhooks: hooks,
                maxRetries: 0 });
            if (failOnce) {
                failOnce = false;
                throw new Error("response lost");
            }
            return original;
        };
        const input = { jobId: "legacy",
            stacks: [ "fixture" ],
            maxMinutes: 2 };
        original.enabled = true;
        await assert.rejects(f.workflows.migrationPlan(input), /disabled/);
        original.enabled = false;
        const plan = await f.workflows.migrationPlan(input);
        assert.equal(plan.repositoryPath, "/destinations/test/history/legacyRepo");
        assert.deepEqual(plan.changes, [ "backupWebhooks", "maxRetries: 0" ]);
        await assert.rejects(f.workflows.migrate({ ...input,
            confirmation: "MIGRATE ZEROBYTE" }), /response lost/);
        await assert.rejects(f.workflows.assertCanRun("legacy"), /active|acknowledgement/);
        assert.equal((await f.workflows.status()).workflows.find(w => w.jobId === "legacy")?.protected, false);
        await f.workflows.migrate({ ...input,
            confirmation: "MIGRATE ZEROBYTE" });
        assert.equal((await f.workflows.status()).workflows.find(w => w.jobId === "legacy")?.protected, true);
        assert.equal(original.repositoryId, "legacyRepo");
        assert.deepEqual(original.retentionPolicy, { keepLast: 7 });
        assert.equal(original.enabled, false);
        assert.equal(f.repositories.at(-1)?.snapshotCount, 12);
        await assert.rejects(f.workflows.migrationPlan(input), /already has hooks/);
        f.jobs.push({ ...original,
            shortId: "shared",
            backupWebhooks: null });
        await assert.rejects(f.workflows.migrationPlan({ ...input,
            jobId: "shared" }), /dedicated/);
    } finally {
        await f.cleanup();
    }
});

test("repeated recovery failures retain the journal without flooding failure notifications", async () => {
    const f = await fixture();
    try {
        await f.workflows.hook(f.workflow.id, "pre", "Bearer " + f.workflow.token, f.body);
        f.failRestart();
        await assert.rejects(f.workflows.hook(f.workflow.id, "post", "Bearer " + f.workflow.token, { ...f.body,
            status: "failed" }), /restart failed/);
        await assert.rejects(f.workflows.hook(f.workflow.id, "post", "Bearer " + f.workflow.token, { ...f.body,
            status: "failed" }), /restart failed/);
        assert.ok((await f.workflows.status()).active);
        assert.equal((await f.workflows.status()).workflows[0].recovery, "required");
        assert.equal(f.events.filter(e => e === "alert").length, 1);
    } finally {
        await f.cleanup();
    }
});
