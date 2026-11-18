import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import cron from "node-cron";
import { setSchedulingTimezone } from "../scheduling-timezone";

test("Trivy preserves settings and schedules long intervals from persisted scan history", async t => {
    const root = await mkdtemp(path.join(os.tmpdir(), "dockge-trivy-"));
    const previousData = process.env.DOCKGE_DATA_DIR;
    process.env.DOCKGE_DATA_DIR = root;
    const { TrivyScanner } = await import("./trivy-scanner");
    t.after(async () => {
        setSchedulingTimezone(undefined);
        if (previousData === undefined) {
            delete process.env.DOCKGE_DATA_DIR;
        } else {
            process.env.DOCKGE_DATA_DIR = previousData;
        }
        await rm(root, { recursive: true,
            force: true });
    });

    for (const intervalHours of [ 12, 24, 72, 168 ]) {
        await t.test(`save, restart and reload ${intervalHours} hours`, async t => {
            const schedules: Array<{ expression: string;
                tick: () => void;
                stopped: boolean }> = [];
            t.mock.method(cron, "schedule", (expression: string, tick: () => void) => {
                assert.ok(cron.validate(expression));
                const job = { expression,
                    tick,
                    stopped: false };
                schedules.push(job);
                return { stop: () => {
                    job.stopped = true;
                } };
            });
            const scanner = new TrivyScanner();
            const reloaded = new TrivyScanner();
            t.after(() => {
                scanner.stop();
                reloaded.stop();
            });
            await scanner.saveSettings({ enabled: true,
                intervalHours });
            assert.equal(scanner.getSettings().intervalHours, intervalHours);
            const saved = JSON.parse(await readFile(path.join(root, "trivy-settings.json"), "utf8"));
            assert.equal(saved.intervalHours, intervalHours);
            scanner.restart();
            assert.equal(schedules[0].stopped, true);
            scanner.stop();
            await reloaded.startIfEnabled();
            assert.equal(reloaded.getSettings().intervalHours, intervalHours);
            assert.equal(schedules.at(-1)?.expression, intervalHours > 24 ? "* * * * *" : `0 */${intervalHours} * * *`);
            reloaded.stop();
            assert.ok(schedules.every(job => job.stopped));
        });
    }

    for (const intervalHours of [ 72, 168 ]) {
        for (const lastScanAt of [ "2026-01-31T23:00:00Z", "2026-03-28T23:00:00Z", "2026-10-24T23:00:00Z" ]) {
            await t.test(`${intervalHours} hours across month/DST from ${lastScanAt}`, async t => {
                let tick = () => {};
                t.mock.method(cron, "schedule", (_expression: string, callback: () => void) => {
                    tick = callback;
                    return { stop() {} };
                });
                await writeFile(path.join(root, "trivy-settings.json"), JSON.stringify({ enabled: true,
                    intervalHours }));
                await writeFile(path.join(root, "trivy-status.json"), JSON.stringify({ lastScanAt }));
                const scanner = new TrivyScanner();
                t.after(() => scanner.stop());
                const scan = t.mock.method(scanner, "runScan", async () => []);
                await scanner.startIfEnabled();
                const due = Date.parse(lastScanAt) + intervalHours * 3_600_000;
                t.mock.timers.enable({ apis: [ "Date" ],
                    now: due - 1 });
                tick();
                assert.equal(scan.mock.callCount(), 0);
                setSchedulingTimezone("Europe/Paris");
                tick();
                assert.equal(scan.mock.callCount(), 0, "timezone changes do not shorten the interval");
                t.mock.timers.setTime(due);
                tick();
                assert.equal(scan.mock.callCount(), 1);
                // The timestamp written by a completed scan starts the next interval.
                await writeFile(path.join(root, "trivy-status.json"), JSON.stringify({ lastScanAt: new Date(due).toISOString() }));
                await scanner.loadSettings();
                tick();
                assert.equal(scan.mock.callCount(), 1);
                t.mock.timers.setTime(due + intervalHours * 3_600_000);
                tick();
                assert.equal(scan.mock.callCount(), 2);
            });
        }
    }

    await t.test("normalizes invalid settings before saving, including while disabled", async t => {
        const scanner = new TrivyScanner();
        t.after(() => scanner.stop());
        for (const [ value, expected ] of [[ 999, 168 ], [ -1, 1 ], [ NaN, 24 ], [ 72.9, 72 ]]) {
            await scanner.saveSettings({ enabled: false,
                intervalHours: value });
            assert.equal(scanner.getSettings().intervalHours, expected);
            assert.equal(JSON.parse(await readFile(path.join(root, "trivy-settings.json"), "utf8")).intervalHours, expected);
            await scanner.loadSettings();
            assert.equal(scanner.getSettings().intervalHours, expected);
        }
    });

    await t.test("first scan or overdue scan runs on the next tick; disabling cancels the job", async t => {
        let tick = () => {};
        let stopped = false;
        t.mock.method(cron, "schedule", (_expression: string, callback: () => void) => {
            tick = callback;
            return { stop() {
                stopped = true;
            } };
        });
        const scanner = new TrivyScanner();
        t.after(() => scanner.stop());
        const scan = t.mock.method(scanner, "runScan", async () => []);
        await scanner.saveSettings({ enabled: true,
            intervalHours: 168 });
        tick();
        assert.equal(scan.mock.callCount(), 1);
        await writeFile(path.join(root, "trivy-status.json"), JSON.stringify({ lastScanAt: "2020-01-01T00:00:00Z" }));
        await scanner.loadSettings();
        tick();
        assert.equal(scan.mock.callCount(), 2);
        await scanner.saveSettings({ enabled: false });
        assert.equal(stopped, true);
    });
});
