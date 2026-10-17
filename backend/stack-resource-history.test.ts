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

test("replicas are summed per service and recreated IDs retain their existing readings", async () => {
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
        assert.equal(first.services.length, 1);
        assert.equal(first.services[0].name, "web");
        assert.equal(first.services[0].cpuAverage, first.stats.cpuAverage);
        assert.equal(first.services[0].memAverage, first.stats.memAverage);
        replaced = true;
        now = new Date("2026-10-16T12:05:00.000Z");
        await collector.sample();
        const next = await collector.read("app");
        assert.equal(next.serviceCount, 1);
        assert.equal(next.services[0].points.length, 2);
        assert.deepEqual(next.services[0].points.map(point => point.cpuPercent), [ 30, 30 ]);
        assert.deepEqual(next.services[0].points.map(point => point.memUsed), [ 3000, 3000 ]);
        assert.equal(next.services[0].samples, 2);
        assert.equal(db.sqlite.prepare("SELECT COUNT(DISTINCT container_id) AS total FROM container_resource_history").get()?.total, 3);
        assert.equal(db.sqlite.prepare("SELECT COUNT(*) AS total FROM container_resource_history").get()?.total, 4);
        assert.equal(next.containers.length, 1, "older WebUIs retain a compatible response shape");
        assert.equal(next.containerCount, next.serviceCount);
        now = new Date("2026-10-16T12:08:00.000Z");
        assert.equal((await collector.read("app", "1y")).points.length, 2, "recent samples keep their resolution even in a year view");
        assert.equal((await collector.read("other")).containers.length, 0);
    } finally {
        await collector.setEnabled(false);
        db.sqlite.close();
    }
});

test("thirteen historical container IDs become two Compose services without deleting data", async () => {
    const db = database();
    const now = new Date("2026-10-17T12:00:00.000Z");
    const collector = new StackResourceHistoryCollector(async () => ({ data: {} }), db, () => now);
    const insert = db.sqlite.prepare("INSERT INTO container_resource_history VALUES (?, ?, ?, ?, ?, ?, ?)");
    try {
        for (let generation = 0; generation < 10; generation++) {
            const at = new Date(now.getTime() - (10 - generation) * 300_000).toISOString();
            db.sqlite.prepare("INSERT INTO stack_resource_history VALUES (?, ?, ?, ?)").run("app", at, generation + 1, 100);
            insert.run("app", generation.toString(16).padStart(64, "a"), "temporary-prefix_app", "web", at, generation + 1, 100);
            if (generation < 3) {
                insert.run("app", generation.toString(16).padStart(64, "b"), "app-bootstrap", "gpu-bootstrap", at, 0, 0);
            }
        }
        const before = db.sqlite.prepare("SELECT * FROM container_resource_history ORDER BY container_id, sampled_at").all();
        for (const preset of [ "24h", "7d", "1m", "1y", "all" ] as const) {
            const result = await collector.read("app", preset);
            assert.equal(result.serviceCount, 2);
            assert.deepEqual(result.services.map(service => service.name), [ "gpu-bootstrap", "web" ]);
            const web = result.services[1];
            assert.equal(web.samples, 10);
            assert.equal(web.cpuAverage, 5.5);
            assert.equal(web.cpuMax, 10);
            assert.equal(web.memAverage, 100);
            assert.equal(web.points.length, 10);
            assert.equal(result.services[0].cpuMax, 0);
        }
        assert.deepEqual(db.sqlite.prepare("SELECT * FROM container_resource_history ORDER BY container_id, sampled_at").all(), before);
    } finally {
        db.sqlite.close();
    }
});

test("service averages and maxima use simultaneous replica totals, not individual rows", async () => {
    const db = database();
    const now = new Date("2026-10-17T12:00:00.000Z");
    const collector = new StackResourceHistoryCollector(async () => ({ data: {} }), db, () => now);
    try {
        const insert = db.sqlite.prepare("INSERT INTO container_resource_history VALUES (?, ?, ?, ?, ?, ?, ?)");
        for (const [at, a, b] of [ [ "2026-10-17T11:50:00.000Z", 10, 0 ], [ "2026-10-17T11:55:00.000Z", 0, 20 ] ] as const) {
            insert.run("app", "a".repeat(64), "app-web-1", "web", at, a, a * 100);
            insert.run("app", "b".repeat(64), "app-web-2", "web", at, b, b * 100);
            insert.run("other", "c".repeat(64), "other-web-1", "web", at, 999, 999_000);
            db.sqlite.prepare("INSERT INTO stack_resource_history VALUES (?, ?, ?, ?)").run("app", at, a + b, (a + b) * 100);
        }
        const service = (await collector.read("app")).services[0];
        assert.equal(service.cpuAverage, 15);
        assert.equal(service.cpuMax, 20, "replica peaks at different times must not be added");
        assert.equal(service.memAverage, 1500);
        assert.equal(service.memMax, 2000);
        assert.deepEqual(service.points.map(point => point.cpuPercent), [ 10, 20 ]);
        assert.equal((await collector.read("other")).services[0].cpuAverage, 999);
    } finally {
        db.sqlite.close();
    }
});

test("hundreds of recreated IDs are grouped before limiting and downsampling", async () => {
    const db = database();
    const now = new Date("2026-10-17T12:00:00.000Z");
    const collector = new StackResourceHistoryCollector(async () => ({ data: {} }), db, () => now);
    try {
        const insert = db.sqlite.prepare("INSERT INTO container_resource_history VALUES (?, ?, ?, ?, ?, ?, ?)");
        for (let i = 0; i < 600; i++) {
            const at = new Date(now.getTime() - i * 300_000).toISOString();
            insert.run("app", i.toString(16).padStart(64, "0"), "app-web", "web", at, i === 599 ? 100 : 1, 100);
            db.sqlite.prepare("INSERT INTO stack_resource_history VALUES (?, ?, ?, ?)").run("app", at, i === 599 ? 100 : 1, 100);
        }
        const result = await collector.read("app", "7d");
        assert.equal(result.serviceCount, 1);
        assert.equal(result.services[0].samples, 600);
        assert.equal(result.services[0].cpuMax, 100, "the oldest IDs must not be lost to the display limit");
        assert.equal(result.services[0].cpuAverage, 699 / 600);
        assert.ok(result.services[0].points.length <= 121);
        assert.equal(result.services[0].points[0].sampledAt, new Date(now.getTime() - 599 * 300_000).toISOString());
    } finally {
        db.sqlite.close();
    }
});

test("recreated services keep gaps, stopped zeroes and time-range boundaries", async () => {
    const db = database();
    const now = new Date("2026-10-17T12:00:00.000Z");
    const collector = new StackResourceHistoryCollector(async () => ({ data: {} }), db, () => now);
    try {
        const insert = db.sqlite.prepare("INSERT INTO container_resource_history VALUES (?, ?, ?, ?, ?, ?, ?)");
        for (const [id, at, value] of [
            [ "a", "2026-10-15T12:00:00.000Z", 999 ],
            [ "b", "2026-10-17T11:00:00.000Z", 5 ],
            [ "c", "2026-10-17T11:30:00.000Z", 0 ],
            [ "d", "2026-10-18T12:00:00.000Z", 999 ],
        ] as const) {
            insert.run("app", id.repeat(64), "app-web", "web", at, value, value * 100);
            db.sqlite.prepare("INSERT INTO stack_resource_history VALUES (?, ?, ?, ?)").run("app", at, value, value * 100);
        }
        const service = (await collector.read("app")).services[0];
        assert.equal(service.samples, 2);
        assert.equal(service.cpuAverage, 2.5);
        assert.equal(service.cpuMax, 5);
        assert.deepEqual(service.points.map(point => [ point.sampledAt, point.cpuPercent ]), [
            [ "2026-10-17T11:00:00.000Z", 5 ],
            [ "2026-10-17T11:30:00.000Z", 0 ],
        ]);
        assert.equal((await collector.read("missing")).serviceCount, 0);
    } finally {
        db.sqlite.close();
    }
});
