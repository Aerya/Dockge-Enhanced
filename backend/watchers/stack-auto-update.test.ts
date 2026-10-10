import test from "node:test";
import assert from "node:assert/strict";
import { buildStackBulkPlan, validateStackBulkRequest } from "./stack-auto-update";
import { buildImageUpdateComposePlan } from "./image-watcher";
import type { AutoUpdateEntry } from "./image-watcher";
import type { ResolvedComposeModel } from "../compose-network-namespace";

const model: ResolvedComposeModel = { services: {
    web: { image: "nginx:latest" },
    worker: { image: "nginx:latest" },
    db: { image: "postgres:16" },
    excluded: { image: "redis:latest",
        labels: { "dockge.imageupdates.check": "false" } },
    excludedList: { image: "alpine:latest",
        labels: [ "dockge.imageupdates.check=false" ] },
    built: { labels: {} },
} };
const entries: Record<string, AutoUpdateEntry> = {
    "demo::nginx:latest": { mode: "scheduled" as const,
        time: "04:15",
        pause: { enabled: true,
            until: null } },
    "other::postgres:16": { mode: "ignored" as const },
};

test("validates policy mode, time, confirmation and stack identity", () => {
    assert.throws(() => validateStackBulkRequest({ stack: "../etc",
        mode: "off",
        preserveExisting: true }), /stack/);
    assert.throws(() => validateStackBulkRequest({ stack: "demo",
        mode: "scheduled",
        preserveExisting: true,
        time: "25:19" }), /Heure/);
    assert.throws(() => validateStackBulkRequest({ stack: "demo",
        mode: "immediate" }), /conservation/);
    assert.deepEqual(validateStackBulkRequest({ stack: "demo",
        mode: "scheduled",
        time: "03:30",
        preserveExisting: true }), {
        stack: "demo",
        mode: "scheduled",
        time: "03:30",
        preserveExisting: true,
    });
});

test("preserve skips individual exceptions, respects exclusion labels, deduplicates images", () => {
    const r = buildStackBulkPlan({ stack: "demo",
        mode: "scheduled",
        time: "02:00",
        preserveExisting: true }, model, entries);
    assert.equal(r.eligible, 2);
    assert.equal(r.excludedServices, 2);
    assert.equal(r.noImageServices, 1);
    assert.equal(r.sharedImageServices, 1);
    assert.equal(r.preserved, 1);
    assert.deepEqual(r.changes.map(c => c.key), [ "demo::postgres:16" ]);
});

test("replace updates existing policy, including its pause; other stacks never touched", () => {
    const r = buildStackBulkPlan({ stack: "demo",
        mode: "immediate",
        preserveExisting: false }, model, entries);
    assert.equal(r.changed, 2);
    assert.deepEqual(r.changes.find(c => c.image === "nginx:latest"), {
        key: "demo::nginx:latest",
        image: "nginx:latest",
        before: "scheduled@04:15",
        after: "immediate",
    });
    assert.equal(r.changes.some(c => c.key.startsWith("other::")), false);
});

test("off preserves existing exceptions by default; replace removes configured entries", () => {
    const preserve = buildStackBulkPlan({ stack: "demo",
        mode: "off",
        preserveExisting: true }, model, entries);
    assert.equal(preserve.changed, 0);
    const replace = buildStackBulkPlan({ stack: "demo",
        mode: "off",
        preserveExisting: false }, model, entries);
    assert.deepEqual(replace.changes.map(c => c.key), [ "demo::nginx:latest" ]);
});

test("preview fingerprint detects settings/compose/policy changes", () => {
    const request = { stack: "demo",
        mode: "scheduled" as const,
        time: "02:00",
        preserveExisting: true };
    const a = buildStackBulkPlan(request, model, entries);
    const b = buildStackBulkPlan(request, model, { ...entries,
        "demo::postgres:16": { mode: "ignored" } });
    const c = buildStackBulkPlan({ ...request,
        time: "06:00" }, model, entries);
    const d = buildStackBulkPlan(request, { services: { ...model.services,
        added: { image: "ubuntu:latest" } } }, entries);
    assert.notEqual(a.previewToken, b.previewToken);
    assert.notEqual(a.previewToken, c.previewToken);
    assert.notEqual(a.previewToken, d.previewToken);
    assert.match(a.previewToken, /^[0-9a-f]{64}$/);
});

test("excluded-only stacks are not modified", () => {
    const r = buildStackBulkPlan({ stack: "demo",
        mode: "immediate",
        preserveExisting: false }, {
        services: { excluded: { image: "redis:latest",
            labels: [ "dockge.imageupdates.check=false" ] } },
    }, {});
    assert.equal(r.changed, 0);
    assert.equal(r.eligible, 0);
    assert.equal(r.excludedServices, 1);
});

test("shared image with excluded service updates only eligible services", () => {
    const mixed: ResolvedComposeModel = { services: {
        allowed: { image: "nginx:latest" },
        blocked: { image: "nginx:latest",
            labels: { "dockge.imageupdates.check": "false" } },
    } };
    const plan = buildStackBulkPlan({ stack: "demo",
        mode: "immediate",
        preserveExisting: false }, mixed, {});
    assert.equal(plan.eligible, 1);
    assert.equal(plan.excludedServices, 1);
    assert.deepEqual(plan.changes.map(change => change.key), [ "demo::nginx:latest" ]);

    const update = buildImageUpdateComposePlan(JSON.stringify(mixed), "nginx:latest");
    assert.deepEqual(update.services, [ "allowed" ]);
});
