import test from "node:test";
import assert from "node:assert/strict";
import { resticRepositoryExcludes } from "./backup-repository-safety";

test("exclude repository and retained old archives when app data is selected", () => {
    const result = resticRepositoryExcludes([ "/app/data" ], [ "/app/data/backups" ]);
    assert.ok(result.includes("/app/data/backups"));
    assert.ok(result.includes("/app/data/.backups.dockge-restic-archive-*"));
    assert.ok(result.includes("/app/data/backups.failed-init-*"));
});

test("dedicated separate backup mount still has explicit exclusions", () => {
    const result = resticRepositoryExcludes([ "/app/data" ], [ "/backup/restic" ]);
    assert.deepEqual(result, [ "/backup/restic", "/backup/.restic.dockge-restic-archive-*", "/backup/restic.failed-init-*" ]);
});

test("detect aliases through Docker host mounts", () => {
    const mounts = [
        { source: "/srv/app",
            destination: "/app/data" },
        { source: "/srv/app/backups",
            destination: "/backup" },
    ];
    const result = resticRepositoryExcludes([ "/app/data" ], [ "/backup/restic" ], mounts);
    assert.ok(result.includes("/app/data/backups/restic"));
    assert.ok(result.includes("/app/data/backups/.restic.dockge-restic-archive-*"));
});

test("block backing up the repository itself, or a directory inside it", () => {
    assert.throws(() => resticRepositoryExcludes([ "/app/data/backups" ], [ "/app/data/backups" ]), /within Restic/);
    assert.throws(() => resticRepositoryExcludes([ "/app/data/backups/data" ], [ "/app/data/backups" ]), /within Restic/);
});

test("reject filesystem root and relative repository paths", () => {
    assert.throws(() => resticRepositoryExcludes([ "/app/data" ], [ "/" ]), /root/);
    assert.throws(() => resticRepositoryExcludes([ "/app/data" ], [ "backups" ]), /absolute/);
});

import { assertLocalRepositoryLocation } from "./backup-repository-safety";
const safetyMounts = [
    { source: "/var/lib/dockge",
        destination: "/app/data" },
    { source: "/srv/restic",
        destination: "/backup" },
];

test("reject mount roots, traversal and locations outside persistent mounts", () => {
    assert.throws(() => assertLocalRepositoryLocation("/app/data", safetyMounts), /mount root/);
    assert.throws(() => assertLocalRepositoryLocation("/backup", safetyMounts), /mount root/);
    assert.throws(() => assertLocalRepositoryLocation("/", safetyMounts), /filesystem root/);
    assert.throws(() => assertLocalRepositoryLocation("/backup/../etc", safetyMounts), /persistent/);
    assert.throws(() => assertLocalRepositoryLocation("/tmp/restic", safetyMounts), /persistent/);
});

test("allow a dedicated directory below a volume root", () => {
    assert.equal(assertLocalRepositoryLocation("/app/data/backups", safetyMounts), "/app/data/backups");
    assert.equal(assertLocalRepositoryLocation("/backup/archives", safetyMounts), "/backup/archives");
});
