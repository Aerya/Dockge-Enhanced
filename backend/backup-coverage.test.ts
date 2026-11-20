import { test } from "node:test";
import assert from "node:assert/strict";
import { containsPath, coverageDestination, coverageHostPath, coverageState } from "./backup-coverage-policy";
import type { BackupDestination } from "./watchers/backup-manager";
test("coverage uses path boundaries and translates only proven mounts", () => {
    assert.equal(containsPath("/data", "/database"), false);
    assert.equal(coverageHostPath("/data/db", [{ source: "/srv",
        destination: "/data" }]), "/srv/db");
    assert.equal(coverageHostPath("/data/db", []), null);
    assert.equal(coverageHostPath("/data/db/file", [{ source: "/srv",
        destination: "/data" }, { source: "/volume",
        destination: "/data/db" }]), "/volume/file");
});
test("configured is not backed up; child selection and exclusions stay partial", () => {
    assert.equal(coverageState("/srv/app", [ "/srv" ], [], false), "unknown");
    assert.equal(coverageState("/srv/app", [ "/srv" ], [], true), "protected");
    assert.equal(coverageState("/srv/app", [ "/srv/app/db" ], [], true), "partial");
    assert.equal(coverageState("/srv/app", [ "/srv" ], [ "*.log" ], true), "partial");
    assert.equal(coverageState("/srv/app", [ "/srv/other" ], [], true), "unprotected");
});
test("changing destination invalidates evidence while rotating passwords does not", () => {
    const dest = { type: "local",
        local: { path: "/backup/a" },
        resticPassword: "one" } as BackupDestination;
    assert.notEqual(coverageDestination(dest), coverageDestination({ ...dest,
        local: { path: "/backup/b" } }));
    assert.equal(coverageDestination(dest), coverageDestination({ ...dest,
        resticPassword: "two" }));
});
