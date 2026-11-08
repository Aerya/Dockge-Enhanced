import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtemp, mkdir, readFile, rm, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import express from "express";
import knex, { type Knex } from "knex";
import sqlite from "@louislam/sqlite3";
import { R } from "redbean-node";
import { up } from "./migrations/2026-07-26-0001-automation-api";
import { AutomationManager } from "./automation/automation-manager";
import { AutomationRouter } from "./routers/automation-router";
import { AuditLogger } from "./audit-log";
import type { DockgeServer } from "./dockge-server";

const Dialect = createRequire(import.meta.url)("knex/lib/dialects/sqlite3/index.js") as typeof Knex.Client;
class TestDialect extends Dialect {
    _driver() {
        return sqlite;
    }
}

test("HTTP creation uses real tokens and SQLite, isolates files and never deploys", async t => {
    const dir = await mkdtemp(path.join(tmpdir(), "automation-create-"));
    const stacksDir = path.join(dir, "stacks");
    await mkdir(stacksDir);
    const db = knex({ client: TestDialect,
        connection: { filename: path.join(dir, "test.db") },
        useNullAsDefault: true });
    Object.defineProperty(R, "knex", { configurable: true,
        value: db });
    await up(db);
    const audit: unknown[] = [];
    t.mock.method(AuditLogger.getInstance(), "logFromRequest", async (_req: unknown, entry: unknown) => {
        audit.push(entry);
    });
    const server = { stacksDir,
        config: { dataDir: dir },
        jwtSecret: "test-only" } as unknown as DockgeServer;
    const app = express();
    app.use(new AutomationRouter().create(app, server));
    const http = app.listen(0, "127.0.0.1");
    t.after(async () => {
        await new Promise<void>(resolve => http.close(() => resolve()));
        Reflect.deleteProperty(R, "knex");
        await db.destroy();
        await rm(dir, { recursive: true,
            force: true });
    });
    await once(http, "listening");
    const url = `http://127.0.0.1:${(http.address() as AddressInfo).port}/api/v1/stacks`;
    const manager = AutomationManager.getInstance();
    const payload = { name: "demo",
        composeYAML: "services:\n  app:\n    image: busybox:stable\n",
        composeENV: "SECRET=private-value" };
    const post = (token: string, body: unknown = payload) => fetch(url, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`,
            "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });
    assert.equal((await post("invalid")).status, 401);
    const read = await manager.createToken({ name: "reader",
        permissions: [ "stack:read" ],
        stacks: [ "*" ] });
    assert.equal((await post(read.token)).status, 403);
    await assert.rejects(manager.createToken({ name: "unsafe",
        permissions: [ "stack:create" ],
        stacks: [ "*" ] }), /acknowledgement/);
    await assert.rejects(manager.createToken({ name: "scoped",
        permissions: [ "stack:create" ],
        stacks: [ "demo" ],
        acknowledgeCreateRisk: true }), /all stacks/);
    const creator = await manager.createToken({ name: "creator",
        permissions: [ "stack:create" ],
        stacks: [ "*" ],
        acknowledgeCreateRisk: true });
    for (const body of [{ ...payload,
        name: "../escape" }, { ...payload,
        endpoint: "another-host" },
    { ...payload,
        deploy: true }, { ...payload,
        composeYAML: "services: [broken" },
    { ...payload,
        composeYAML: "services: {}" }, { ...payload,
        composeENV: 123 }]) {
        assert.equal((await post(creator.token, body)).status, 400);
    }
    assert.deepEqual(await readdir(stacksDir), []);
    const results = await Promise.all([ post(creator.token), post(creator.token) ]);
    assert.deepEqual(results.map(r => r.status).sort(), [ 201, 400 ]);
    const response = await results.find(r => r.status === 201)!.json();
    assert.deepEqual(response, { ok: true,
        data: { name: "demo",
            deployed: false } });
    assert.equal(await readFile(path.join(stacksDir, "demo", "compose.yaml"), "utf8"), payload.composeYAML);
    assert.equal(await readFile(path.join(stacksDir, "demo", ".env"), "utf8"), payload.composeENV);
    assert.equal((await post(creator.token, { ...payload,
        composeYAML: "services: {app: {image: malicious}}" })).status, 400);
    assert.equal(await readFile(path.join(stacksDir, "demo", "compose.yaml"), "utf8"), payload.composeYAML);
    assert.equal(JSON.stringify(audit).includes("private-value"), false);
    assert.equal(audit.length, 1);
    await manager.revokeToken(creator.item.id);
    assert.equal((await post(creator.token, { ...payload,
        name: "revoked" })).status, 401);
    const expired = await manager.createToken({ name: "expired",
        permissions: [ "stack:create" ],
        stacks: [ "*" ],
        acknowledgeCreateRisk: true });
    await db("automation_token").where({ id: expired.item.id }).update({ expires_at: "2000-01-01T00:00:00Z" });
    assert.equal((await post(expired.token, { ...payload,
        name: "expired" })).status, 401);
});
