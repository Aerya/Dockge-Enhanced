import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import knex, { type Knex } from "knex";
import sqlite from "@louislam/sqlite3";
import { up, down } from "../migrations/2026-11-27-0001-host-management";

const Dialect = createRequire(import.meta.url)("knex/lib/dialects/sqlite3/index.js") as typeof Knex.Client;
class TestDialect extends Dialect {
    _driver() {
        return sqlite;
    }
}
test("SQLite migration stores shared inventory fingerprints, retains sample history and rolls back", async () => {
    const db = knex({ client: TestDialect,
        connection: { filename: ":memory:" },
        useNullAsDefault: true });
    try {
        await up(db);
        await db("host_inventory").insert({ fingerprint: "a".repeat(64),
            report: "{}",
            last_seen: 2 });
        for (const collected_at of [ 1, 2 ]) {
            await db("host_history").insert({ collected_at,
                fingerprint: "a".repeat(64),
                summary: "{}" });
        }
        assert.equal((await db("host_inventory")).length, 1);
        assert.equal((await db("host_history")).length, 2);
        await assert.rejects(db("host_history").insert({ collected_at: 2,
            fingerprint: "b",
            summary: "{}" }));
        await db.raw("DELETE FROM host_history WHERE collected_at < ?", [ 2 ]);
        await db.raw("DELETE FROM host_inventory WHERE last_seen < ? AND fingerprint NOT IN (SELECT fingerprint FROM host_history)", [ 3 ]);
        assert.equal((await db("host_inventory")).length, 1);
        await down(db);
        assert.equal(await db.schema.hasTable("host_inventory"), false);
    } finally {
        await db.destroy();
    }
});
