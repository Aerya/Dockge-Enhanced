import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { StackResourceHistoryCollector, stackHistoryPreset } from "./stack-resource-history";

function database() {
    const sqlite = new DatabaseSync(":memory:");
    sqlite.exec(`CREATE TABLE stack_resource_history (
        stack_name TEXT NOT NULL, sampled_at TEXT NOT NULL,
        cpu_percent REAL NOT NULL, mem_used INTEGER NOT NULL,
        UNIQUE(stack_name, sampled_at))`);
    sqlite.exec(`CREATE TABLE container_resource_history (
        stack_name TEXT NOT NULL, container_id TEXT NOT NULL, container_name TEXT NOT NULL,
        service_name TEXT NOT NULL, sampled_at TEXT NOT NULL, cpu_percent REAL NOT NULL,
        mem_used INTEGER NOT NULL, UNIQUE(container_id, sampled_at))`);
    return {
        sqlite,
        exec: async (sql: string, bindings: Array<string | number>) => {
            sqlite.prepare(sql).run(...bindings);
        },
        getAll: async (sql: string, bindings: Array<string | number>) => sqlite.prepare(sql).all(...bindings),
        getRow: async (sql: string, bindings: Array<string | number>) => sqlite.prepare(sql).get(...bindings) ?? null,
    };
}

test("history is opt-in, survives a collector restart, and preserves readings when disabled", async () => {
    const db = database();
    const now = () => new Date("2026-10-16T12:00:00.000Z");
    let calls = 0;
    const collector = new StackResourceHistoryCollector(async () => {
        calls++;
        return { available: true,
            data: { app: { cpu: 200,
                memUsed: 1024 ** 3 } } };
    }, db, now);
    try {
        await collector.sample();
        assert.equal(calls, 0);
        await collector.setEnabled(true);
        assert.equal(calls, 1);
        await collector.setEnabled(true);
        assert.equal(calls, 1, "saving unrelated settings does not restart collection");
        await collector.setEnabled(false);
        await collector.sample();
        assert.equal(calls, 1);
        const restarted = new StackResourceHistoryCollector(async () => ({ data: {} }), db, now);
        const history = await restarted.read("app");
        assert.equal(history.points.length, 1);
        assert.equal(history.stats.cpuMax, 200);
        assert.equal(history.stats.memAverage, 1024 ** 3);
        assert.equal((await restarted.read("other")).points.length, 0);
    } finally {
        await collector.setEnabled(false);
        db.sqlite.close();
    }
});

test("unavailable Docker results are not recorded, errors release the sampling lock", async () => {
    const db = database();
    let calls = 0;
    const collector = new StackResourceHistoryCollector(async () => {
        calls++;
        if (calls === 1) {
            throw new Error("Docker unavailable");
        }
        return { available: calls > 2,
            data: { app: { cpu: 1,
                memUsed: 2 } } };
    }, db);
    try {
        await collector.setEnabled(true);
        await collector.sample();
        assert.equal((await collector.read("app")).stats.samples, 0);
        await collector.sample();
        assert.equal((await collector.read("app")).stats.samples, 1);
    } finally {
        await collector.setEnabled(false);
        db.sqlite.close();
    }
});

test("concurrent samples share one operation and disabling during collection prevents a late write", async () => {
    const db = database();
    let finish!: () => void;
    const barrier = new Promise<void>(resolve => {
        finish = resolve;
    });
    let calls = 0;
    const collector = new StackResourceHistoryCollector(async () => {
        calls++;
        await barrier;
        return { data: { app: { cpu: 1,
            memUsed: 2 } } };
    }, db);
    try {
        const first = collector.setEnabled(true);
        await collector.sample();
        assert.equal(calls, 1);
        await collector.setEnabled(false);
        finish();
        await first;
        assert.equal((await collector.read("app")).stats.samples, 0);
    } finally {
        finish();
        await collector.setEnabled(false);
        db.sqlite.close();
    }
});

test("annual and all-time queries are bounded and compute maxima from original samples", async () => {
    const db = database();
    const now = new Date("2026-10-16T12:00:00.000Z");
    const collector = new StackResourceHistoryCollector(async () => ({ data: {} }), db, () => now);
    try {
        const insert = db.sqlite.prepare("INSERT INTO stack_resource_history VALUES (?, ?, ?, ?)");
        for (let day = 0; day < 1600; day++) {
            insert.run("app", new Date(now.getTime() - day * 86_400_000).toISOString(), day === 1000 ? 200 : 1, 1024 ** 2);
        }
        const all = await collector.read("app", "all");
        assert.ok(all.points.length <= 750);
        assert.equal(all.stats.samples, 1600);
        assert.equal(all.stats.cpuMax, 200);
        const year = await collector.read("app", "1y");
        assert.equal(year.from, "2025-10-16T12:00:00.000Z");
        assert.equal(year.stats.samples, 366);
        assert.equal(year.stats.cpuMax, 1);
        for (const preset of [ "24h", "7d", "1m" ] as const) {
            assert.ok((await collector.read("app", preset)).points.length > 0);
        }
        await assert.rejects(collector.read("../outside"), /Invalid/);
        assert.throws(() => stackHistoryPreset("invalid"), /Invalid/);
    } finally {
        db.sqlite.close();
    }
});

test("real replicas and recreated containers keep distinct histories under the same stack", async () => {
    const db = database();
    let now = new Date("2026-10-16T12:00:00.000Z");
    let replaced = false;
    const collector = new StackResourceHistoryCollector(async () => ({
        data: { app: { cpu: 30,
            memUsed: 3000 } },
        instances: {
            ["a".repeat(64)]: { project: "app",
                service: "web",
                name: "app-web-1",
                cpu: 10,
                memUsed: 1000 },
            [(replaced ? "c" : "b").repeat(64)]: { project: "app",
                service: "web",
                name: "app-web-2",
                cpu: 20,
                memUsed: 2000 },
        },
    }), db, () => now);
    try {
        await collector.setEnabled(true);
        const first = await collector.read("app");
        assert.equal(first.containers.length, 2);
        assert.equal(first.containers.reduce((sum, item) => sum + item.cpuAverage, 0), first.stats.cpuAverage);
        assert.equal(first.containers.reduce((sum, item) => sum + item.memAverage, 0), first.stats.memAverage);
        replaced = true;
        now = new Date("2026-10-16T12:05:00.000Z");
        await collector.sample();
        const next = await collector.read("app");
        assert.equal(next.containerCount, 3);
        assert.equal(next.containers.find(item => item.id === "a".repeat(64))?.points.length, 2);
        assert.equal(next.containers.find(item => item.id === "b".repeat(64))?.points.length, 1);
        assert.equal(next.containers.find(item => item.id === "c".repeat(64))?.points.length, 1);
        now = new Date("2026-10-16T12:08:00.000Z");
        assert.equal((await collector.read("app", "1y")).points.length, 2, "recent samples keep their resolution even in a year view");
        assert.equal((await collector.read("other")).containers.length, 0);
    } finally {
        await collector.setEnabled(false);
        db.sqlite.close();
    }
});
