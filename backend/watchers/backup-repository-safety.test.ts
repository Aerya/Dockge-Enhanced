import test from "node:test";
import assert from "node:assert/strict";
import { resticRepositoryExcludes, checkRepositorySourceOverlap, canonicalRepositoryPaths } from "./backup-repository-safety";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";

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

test("warn when a repository is nested several levels below a selected backup source", async () => {
    assert.deepEqual(
        await checkRepositorySourceOverlap([ "/data/apps" ], [ "/data/apps/cache/restic/repository" ]),
        [{ source: "/data/apps",
            repository: "/data/apps/cache/restic/repository" }],
    );
    await assert.rejects(
        checkRepositorySourceOverlap([ "/data/restic/repository/child" ], [ "/data/restic/repository" ]),
        /ne peut pas être sauvegardé/,
    );
    assert.deepEqual(await checkRepositorySourceOverlap([ "/data/apps" ], [ "/data/apps-backups/restic" ]), []);
});

test("warn about repository/source aliases through Docker mounts", async () => {
    const mounts = [
        { source: "/srv/shared",
            destination: "/data" },
        { source: "/srv/shared",
            destination: "/alias" },
    ];
    assert.equal((await checkRepositorySourceOverlap([ "/data/apps" ], [ "/alias/apps/restic" ], mounts)).length, 1);
});

test("a filesystem-root source still excludes a nested repository", async () => {
    assert.deepEqual(await checkRepositorySourceOverlap([ "/" ], [ "/backup/restic" ]), [{ source: "/",
        repository: "/backup/restic" }]);
    assert.ok(resticRepositoryExcludes([ "/" ], [ "/backup/restic" ]).includes("/backup/restic"));
});

test("warn about symlinked sources pointing at a repository parent", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "dockge-restic-path-test-"));
    try {
        await fs.mkdir(path.join(root, "data"));
        await fs.symlink(path.join(root, "data"), path.join(root, "alias"));
        assert.equal((await checkRepositorySourceOverlap([ path.join(root, "alias") ], [ path.join(root, "data", "nested", "restic") ])).length, 1);
    } finally {
        await fs.rm(root, { recursive: true,
            force: true });
    }
});

test("canonicalize a symlinked repository before generating exclusions", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "dockge-restic-repo-alias-"));
    try {
        await fs.mkdir(path.join(root, "source"));
        await fs.symlink(path.join(root, "source"), path.join(root, "alias"));
        assert.equal((await checkRepositorySourceOverlap([ path.join(root, "source") ], [ path.join(root, "alias", "restic") ])).length, 1);
        const canonical = await canonicalRepositoryPaths([ path.join(root, "alias", "restic") ]);
        assert.deepEqual(canonical, [ path.join(root, "source", "restic") ]);
        assert.ok(resticRepositoryExcludes([ path.join(root, "source") ], [ path.join(root, "alias", "restic"), ...canonical ])
            .includes(path.join(root, "source", "restic")));
    } finally {
        await fs.rm(root, { recursive: true,
            force: true });
    }
});

test("reject ambiguous parent traversal before comparing paths", async () => {
    await assert.rejects(
        checkRepositorySourceOverlap([ "/data/source/../other" ], [ "/data/restic" ]),
        /parent traversal/,
    );
    await assert.rejects(
        checkRepositorySourceOverlap([ "/data/source" ], [ "/data/alias/../restic" ]),
        /parent traversal/,
    );
});

test("a real Restic backup excludes its repository nested in the source", { skip: spawnSync("restic", [ "version" ]).status !== 0 }, async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "dockge-restic-self-backup-"));
    const source = path.join(root, "source");
    const repository = path.join(source, "backups", "restic");
    const env = { ...process.env,
        RESTIC_PASSWORD: "isolated-test-password",
        RESTIC_CACHE_DIR: path.join(root, "cache") };
    try {
        await fs.mkdir(repository, { recursive: true });
        await fs.writeFile(path.join(source, "data.txt"), "included");
        execFileSync("restic", [ "-r", repository, "init" ], { env });
        const exclusions = resticRepositoryExcludes([ source ], [ repository ]);
        execFileSync("restic", [ "-r", repository, "backup", source, ...exclusions.flatMap(exclude => [ "--exclude", exclude ]) ], { env });
        const listing = execFileSync("restic", [ "-r", repository, "ls", "latest" ], { env,
            encoding: "utf8" });
        assert.match(listing, /data\.txt/);
        assert.doesNotMatch(listing, /backups\/restic/);
    } finally {
        await fs.rm(root, { recursive: true,
            force: true });
    }
});
