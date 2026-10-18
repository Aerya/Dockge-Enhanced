import assert from "node:assert/strict";
import test from "node:test";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import knex from "knex";
// @ts-ignore Same SQLite driver as Database.
import Dialect from "knex/lib/dialects/sqlite3/index.js";
import sqlite from "@louislam/sqlite3";

test("recovery CLI accepts its own arguments and resets only the named account, preserving passwords", { timeout: 30_000 }, async t => {
    const directory = await mkdtemp(path.join(tmpdir(), "dockge-reset-2fa-"));
    Dialect.prototype._driver = () => sqlite;
    const db = knex({ client: Dialect,
        connection: { filename: path.join(directory, "dockge.db") },
        useNullAsDefault: true });
    t.after(async () => {
        await db.destroy();
        await rm(directory, { recursive: true,
            force: true });
    });
    await db.migrate.latest({ directory: "./backend/migrations" });
    await writeFile(path.join(directory, "db-config.json"), JSON.stringify({ type: "sqlite" }));
    for (const username of [ "fixture", "untouched" ]) {
        await db("user").insert({ username,
            password: "fixture-hash",
            active: 1,
            twofa_status: 1,
            twofa_version: 7,
            twofa_secret_encrypted: "fixture-encrypted",
            twofa_recovery_hashes: "[]" });
    }
    const run = (...args: string[]) => promisify(execFile)(process.execPath, [ "--import", "tsx", "extra/reset-two-factor.ts", ...args ], {
        env: { ...process.env,
            NODE_ENV: "development",
            DOCKGE_DATA_DIR: directory },
        timeout: 15_000,
    });
    await assert.rejects(run("--username", "fixture"), { code: 1 });
    assert.equal((await db("user").where({ username: "fixture" }).first()).twofa_status, 1);
    const result = await run("--username", "fixture", "--confirm");
    assert.match(result.stdout, /2FA disabled/);
    assert.equal(result.stderr, "");
    const changed = await db("user").where({ username: "fixture" }).first();
    assert.equal(changed.password, "fixture-hash");
    assert.equal(changed.twofa_status, 0);
    assert.equal(changed.twofa_version, 8);
    assert.equal(changed.twofa_secret_encrypted, null);
    assert.equal(changed.twofa_recovery_hashes, null);
    const untouched = await db("user").where({ username: "untouched" }).first();
    assert.equal(untouched.twofa_version, 7);
    assert.equal(untouched.twofa_status, 1);
    await assert.rejects(run("--username", "missing", "--confirm"), { code: 1 });
});
