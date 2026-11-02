import test from "node:test";
import assert from "node:assert/strict";
import { getUsageCountAssetUrl, getUsageCountMonth, shouldAttemptUsageCount } from "./anonymous-install-count";
import { AnonymousInstallCount } from "./anonymous-install-count";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { periods } from "../extra/usage-periods.cjs";
import { execFileSync } from "node:child_process";

test("opt-out, CI and development do not schedule any count request", () => {
    for (const env of [
        { NODE_ENV: "production",
            CI: "false",
            DOCKGE_USAGE_COUNT: "false" },
        { NODE_ENV: "production",
            CI: "true",
            DOCKGE_USAGE_COUNT: "true" },
        { NODE_ENV: "development",
            CI: "false",
            DOCKGE_USAGE_COUNT: "true" },
    ]) {
        execFileSync(process.execPath, [ "--import", "tsx", "--input-type=module", "-e", `
            import { startAnonymousInstallCount } from './backend/anonymous-install-count.ts';
            globalThis.setTimeout = () => { throw new Error('unexpected timer'); };
            globalThis.fetch = () => { throw new Error('unexpected network request'); };
            startAnonymousInstallCount('/unused-test-path');
        ` ], { env: { ...process.env,
            ...env } });
    }
});

test("UTC periods cross calendar year and Sunday/Monday correctly", () => {
    assert.deepEqual(periods(new Date("2027-01-01T00:00:00Z")), { week: "week-2026-12-28",
        month: "2027-01",
        year: "year-2027" });
    assert.equal(periods(new Date("2026-11-01T23:59:59Z")).week, "week-2026-10-26");
    assert.equal(periods(new Date("2026-11-02T00:00:00Z")).week, "week-2026-11-02");
});

test("counts independent periods, persists across restart and preserves legacy month", async (t) => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "usage-count-"));
    t.after(() => fs.rm(dir, { recursive: true,
        force: true }));
    const file = path.join(dir, "anonymous-install-count.json");
    await fs.writeFile(file, JSON.stringify({ lastCountedMonth: "2026-11",
        lastAttemptAt: null }));
    const urls: string[] = [];
    t.mock.method(globalThis, "fetch", async (url: string) => {
        urls.push(url);
        return new Response("fixture");
    });
    const now = new Date("2026-11-02T12:00:00Z");
    const counter = new AnonymousInstallCount(dir);
    await Promise.all([ counter.run(now), counter.run(now) ]);
    assert.equal(urls.length, 2);
    assert.ok(urls[0].endsWith("week-2026-11-02.txt"));
    assert.ok(urls[1].endsWith("year-2026.txt"));
    await new AnonymousInstallCount(dir).run(now);
    assert.equal(urls.length, 2);
    await counter.run(new Date("2026-11-09T12:00:00Z"));
    assert.equal(urls.length, 3);
    await counter.run(new Date("2026-12-01T12:00:00Z"));
    assert.equal(urls.length, 5); // month + week, not year again
    await counter.run(new Date("2027-01-01T00:00:00Z"));
    assert.equal(urls.length, 8); // independent new year, month and week
    const saved = JSON.parse(await fs.readFile(file, "utf8"));
    assert.equal(saved.lastCountedYear, "year-2027");
    assert.equal(Object.keys(saved.attempts).length, 3);
});

test("failed month does not prevent week/year; retries are bounded", async (t) => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "usage-count-"));
    t.after(() => fs.rm(dir, { recursive: true,
        force: true }));
    const urls: string[] = [];
    t.mock.method(globalThis, "fetch", async (url: string) => {
        urls.push(url);
        return new Response("fixture", { status: url.endsWith("2026-11.txt") ? 404 : 200 });
    });
    const counter = new AnonymousInstallCount(dir);
    await counter.run(new Date("2026-11-02T12:00:00Z"));
    assert.equal(urls.length, 3);
    await counter.run(new Date("2026-11-02T18:00:00Z"));
    assert.equal(urls.length, 3);
    await counter.run(new Date("2026-11-03T00:00:00Z"));
    assert.equal(urls.length, 4);
});

test("corrupt state is not silently reset and causes no download", async (t) => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "usage-count-"));
    t.after(() => fs.rm(dir, { recursive: true,
        force: true }));
    const file = path.join(dir, "anonymous-install-count.json");
    await fs.writeFile(file, "broken");
    const fetch = t.mock.method(globalThis, "fetch", async () => {
        throw new Error("must not fetch");
    });
    const counter = new AnonymousInstallCount(dir);
    await assert.rejects(counter.run());
    for (const invalid of [ "null", "[]", "{\"lastCountedMonth\":42}", "{\"attempts\":[]}" ]) {
        await fs.writeFile(file, invalid);
        await assert.rejects(counter.run());
    }
    assert.equal(fetch.mock.callCount(), 0);
    await fs.writeFile(file, "{}");
    await counter.run();
    assert.equal(fetch.mock.callCount(), 3); // reservation released after error
});

test("génère un asset mensuel GitHub sans identifiant d'installation", () => {
    const now = new Date("2026-09-05T10:00:00.000Z");
    assert.equal(getUsageCountMonth(now), "2026-09");
    assert.equal(
        getUsageCountAssetUrl("2026-09"),
        "https://github.com/Aerya/Dockge-Enhanced/releases/download/usage-count/2026-09.txt",
    );
});

test("ne compte une installation qu'une fois par mois", () => {
    const now = new Date("2026-09-05T10:00:00.000Z");
    assert.equal(shouldAttemptUsageCount({ lastCountedMonth: "2026-09",
        lastAttemptAt: null }, now), false);
    assert.equal(shouldAttemptUsageCount({ lastCountedMonth: "2026-08",
        lastAttemptAt: null }, now), true);
});

test("borne les retries lorsque l'asset mensuel n'est pas encore disponible", () => {
    const now = new Date("2026-09-05T10:00:00.000Z");
    assert.equal(shouldAttemptUsageCount({ lastCountedMonth: null,
        lastAttemptAt: "2026-09-05T03:00:00.000Z" }, now), false);
    assert.equal(shouldAttemptUsageCount({ lastCountedMonth: null,
        lastAttemptAt: "2026-09-04T20:00:00.000Z" }, now), true);
});

test("refuse un endpoint de comptage non HTTPS", () => {
    assert.throws(() => getUsageCountAssetUrl("2026-09", "http://example.test/count"), /HTTPS/);
});
