import test, { afterEach } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { Cron } from "croner";
import { getSchedulingTimezone, onSchedulingTimezoneChange, schedulingClock, setSchedulingTimezone, validateSchedulingTimezone } from "./scheduling-timezone";
import { scheduleInTimezone } from "./scheduling-cron";
import { automaticImageUpdatesMayRun, normalizeSelfUpdateSettings, selfUpdateMayRun } from "./self-update/settings";
import { isUpdatePaused, isWithinMaintenanceWindow } from "./watchers/update-policy";

afterEach(() => setSchedulingTimezone(undefined));

test("unset settings preserve the runtime timezone and existing local hours", () => {
    const now = new Date("2026-07-10T22:30:00Z");
    assert.equal(getSchedulingTimezone(), Intl.DateTimeFormat().resolvedOptions().timeZone);
    assert.equal(schedulingClock(now).hour, now.getHours());
    assert.equal(schedulingClock(now).weekday, now.getDay());
});

test("invalid timezone is rejected without changing active schedules", () => {
    setSchedulingTimezone("Europe/Paris");
    for (const value of [ "invalid/zone", "", 42, null, "../../etc/localtime" ]) {
        assert.throws(() => validateSchedulingTimezone(value));
    }
    assert.throws(() => setSchedulingTimezone("invalid/zone"));
    assert.equal(getSchedulingTimezone(), "Europe/Paris");
});

test("Paris scheduling follows DST, including missing and repeated local hours", () => {
    setSchedulingTimezone("Europe/Paris");
    for (const [ instant, hour, minute ] of [
        [ "2026-01-10T01:30:00Z", 2, 30 ],
        [ "2026-07-10T00:30:00Z", 2, 30 ],
        [ "2026-03-29T00:59:00Z", 1, 59 ],
        [ "2026-03-29T01:00:00Z", 3, 0 ],
        [ "2026-10-25T00:30:00Z", 2, 30 ],
        [ "2026-10-25T01:30:00Z", 2, 30 ],
    ] as const) {
        const clock = schedulingClock(new Date(instant));
        assert.equal(clock.hour, hour);
        assert.equal(clock.minute, minute);
    }
});

test("weekday and maintenance windows use the configured zone, not UTC", () => {
    setSchedulingTimezone("Asia/Shanghai");
    const settings = normalizeSelfUpdateSettings({ mode: "sidecar",
        schedule: { type: "window",
            start: "00:00",
            end: "01:00",
            days: [ 1 ] } });
    const monday = new Date("2026-10-18T16:30:00Z");
    assert.equal(selfUpdateMayRun(settings, monday), true);
    assert.equal(automaticImageUpdatesMayRun(settings, monday), true);
    assert.equal(selfUpdateMayRun(settings, new Date("2026-10-19T16:30:00Z")), false);
    assert.equal(isWithinMaintenanceWindow("23:00", "01:00", monday), true);
    assert.equal(isWithinMaintenanceWindow("01:00", "02:00", monday), false);
});

test("timezone changes leave absolute pause deadlines unchanged", () => {
    const pause = { enabled: true,
        until: "2026-10-23T10:00:00Z" };
    for (const zone of [ "UTC", "Europe/Paris", "Asia/Shanghai", "America/New_York" ]) {
        setSchedulingTimezone(zone);
        assert.equal(isUpdatePaused(pause, new Date("2026-10-23T09:59:00Z")), true);
        assert.equal(isUpdatePaused(pause, new Date("2026-10-23T10:00:00Z")), false);
    }
});

test("calendar cron retains the configured hour on both sides of DST", () => {
    setSchedulingTimezone("Europe/Paris");
    const job = new Cron("0 4 * * *", { paused: true,
        timezone: getSchedulingTimezone() });
    try {
        assert.equal(job.nextRun(new Date("2026-03-28T00:00:00Z"))?.toISOString(), "2026-03-28T03:00:00.000Z");
        assert.equal(job.nextRun(new Date("2026-03-29T00:00:00Z"))?.toISOString(), "2026-03-29T02:00:00.000Z");
        assert.equal(job.nextRun(new Date("2026-10-25T00:00:00Z"))?.toISOString(), "2026-10-25T03:00:00.000Z");
    } finally {
        job.stop();
    }
});

test("changing zones rearms future cron ticks without running tasks; stopping unsubscribes", () => {
    setSchedulingTimezone("UTC");
    const zones: string[] = [];
    let stops = 0;
    let calls = 0;
    const task = scheduleInTimezone("0 */6 * * *", () => {
        calls++;
    }, (_expression, _callback, options) => {
        zones.push(options?.timezone ?? "");
        return Object.assign(new EventEmitter(), {
            stop() {
                stops++;
            },
            start() {},
            now() {},
        });
    });
    setSchedulingTimezone("Europe/Paris");
    setSchedulingTimezone("Europe/Paris");
    assert.deepEqual(zones, [ "UTC", "Europe/Paris" ]);
    assert.equal(stops, 1);
    assert.equal(calls, 0);
    task.stop();
    setSchedulingTimezone("Asia/Shanghai");
    assert.equal(stops, 2);
    assert.equal(zones.length, 2);
});

test("listeners only receive effective changes", () => {
    setSchedulingTimezone("UTC");
    let changes = 0;
    const remove = onSchedulingTimezoneChange(() => {
        changes++;
    });
    setSchedulingTimezone("UTC");
    setSchedulingTimezone("Europe/Paris");
    remove();
    setSchedulingTimezone("Asia/Shanghai");
    assert.equal(changes, 1);
});
