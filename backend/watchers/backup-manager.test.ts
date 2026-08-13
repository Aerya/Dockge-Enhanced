import test from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
    BackupRunLock,
    assertExistingPathWithinRoots,
    assertPathWithinRoots,
    buildComposeCommandArgs,
    buildResticCommandArgs,
    normalizeStackBackupPolicy,
    readDiskUsage,
} from "./backup-manager";

test("defaults unknown stack policies to hot mode", () => {
    assert.deepEqual(normalizeStackBackupPolicy(undefined), { mode: "hot" });
    assert.deepEqual(normalizeStackBackupPolicy({ mode: "invalid" }), { mode: "hot" });
});

test("borne les chemins aux racines autorisées", () => {
    assert.equal(assertPathWithinRoots("/mnt/data/app/config", [ "/mnt/data" ]), "/mnt/data/app/config");
    assert.equal(assertPathWithinRoots("/mnt/data", [ "/mnt/data" ]), "/mnt/data");
    assert.throws(() => assertPathWithinRoots("/mnt/database", [ "/mnt/data" ]), /hors des emplacements/);
    assert.throws(() => assertPathWithinRoots("/mnt/data/../../etc/passwd", [ "/mnt/data" ]), /hors des emplacements/);
    assert.throws(() => assertPathWithinRoots("relative/path", [ "/mnt/data" ]), /Chemin invalide/);
});

test("rejette un lien symbolique qui sort d’une racine autorisée", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "dockge-path-root-"));
    const outside = await fs.mkdtemp(path.join(os.tmpdir(), "dockge-path-outside-"));
    const link = path.join(root, "outside");
    try {
        await fs.symlink(outside, link);
        await assert.rejects(assertExistingPathWithinRoots(link, [ root ]), /hors des emplacements/);
    } finally {
        await fs.rm(root, { recursive: true, force: true });
        await fs.rm(outside, { recursive: true, force: true });
    }
});

test("keeps stop mode without hook fields", () => {
    assert.deepEqual(normalizeStackBackupPolicy({
        mode: "stop",
        hookService: "database",
        preHook: "dump",
    }), { mode: "stop" });
});

test("trims application hook settings", () => {
    assert.deepEqual(normalizeStackBackupPolicy({
        mode: "hooks",
        hookService: " database ",
        preHook: " pg_dumpall ",
        postHook: "   ",
    }), {
        mode: "hooks",
        hookService: "database",
        preHook: "pg_dumpall",
        postHook: undefined,
    });
});

test("blocks a second backup when overlap protection is enabled", () => {
    const lock = new BackupRunLock();
    assert.equal(lock.acquire(true), true);
    assert.equal(lock.acquire(true), false);
    assert.equal(lock.isActive(), true);
    lock.release();
    assert.equal(lock.isActive(), false);
});

test("allows concurrent backups when overlap protection is disabled", () => {
    const lock = new BackupRunLock();
    assert.equal(lock.acquire(false), true);
    assert.equal(lock.acquire(false), true);
    lock.release();
    assert.equal(lock.isActive(), true);
    lock.release();
    assert.equal(lock.isActive(), false);
});

test("mesure un chemin sans interpréter ses caractères comme une commande", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "dockge-du-"));
    const marker = path.join(root, "commande-executee");
    const volume = path.join(root, `volume;touch ${path.basename(marker)}`);
    try {
        await fs.mkdir(volume);
        await fs.writeFile(path.join(volume, "data.bin"), Buffer.alloc(4096));
        assert.match(await readDiskUsage(volume), /^\S+/);
        await assert.rejects(fs.access(marker));
    } finally {
        await fs.rm(root, { recursive: true, force: true });
    }
});

test("conserve les valeurs Restic et Compose dans des arguments séparés", () => {
    const hostilePath = "/tmp/archive;touch /tmp/commande-executee";
    assert.deepEqual(buildResticCommandArgs(hostilePath, [], [ "dump", "snapshot", hostilePath ], false), [
        "--repo", hostilePath, "dump", "snapshot", hostilePath,
    ]);
    assert.deepEqual(buildComposeCommandArgs("/opt/stacks/demo/compose.yaml", [
        "exec", "-T", "service;false", "sh", "-c", "echo sauvegarde",
    ]), [
        "compose", "-f", "compose.yaml", "exec", "-T", "service;false", "sh", "-c", "echo sauvegarde",
    ]);
});
