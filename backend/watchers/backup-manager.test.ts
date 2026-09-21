import test from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
    BackupRunLock,
    assertExistingPathWithinRoots,
    assertPathWithinRoots,
    buildVolumeBrowseRoots,
    assertSafeSftpConfig,
    buildBackupArgs,
    buildComposeCommandArgs,
    buildResticHostId,
    buildRetentionArgs,
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


test("résout les chemins existants avec l’API Node", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "dockge-path-existing-"));
    const child = path.join(root, "child");
    try {
        await fs.mkdir(child);
        assert.equal(await assertExistingPathWithinRoots(child, [ root ]), await fs.realpath(child));
    } finally {
        await fs.rm(root, { recursive: true, force: true });
    }
});

test("autorise toujours /app/data dans le navigateur de volumes", () => {
    const roots = buildVolumeBrowseRoots([
        { source: "/volume1/docker", destination: "/dockers-data" },
    ], "/opt/dockge/data");
    assert.deepEqual(roots, [ "/opt/dockge/data", "/app/data", "/dockers-data" ]);
    assert.deepEqual(buildVolumeBrowseRoots([], "/app/data"), [ "/app/data" ]);
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
    assert.deepEqual(buildComposeCommandArgs("/srv/demo/compose.yaml", [ "stop", "db" ], "original-project", [
        "/srv/demo/compose.yaml", "/srv/demo/compose.prod.yaml",
    ], "/srv/demo", [ "/srv/secrets/demo.env" ]), [
        "compose", "--project-directory", "/srv/demo", "-p", "original-project",
        "--env-file", "/srv/secrets/demo.env",
        "-f", "compose.yaml", "-f", "compose.prod.yaml", "stop", "db",
    ]);
});

test("rejette les champs SFTP capables d'injecter des options SSH", () => {
    const base = {
        host: "backup.example.com",
        port: 22,
        user: "dockge",
        path: "/backups/dockge",
        authMode: "key" as const,
        keyPath: "/run/secrets/id_ed25519",
    };

    assert.deepEqual(assertSafeSftpConfig(base), base);

    assert.throws(
        () => assertSafeSftpConfig({ ...base, host: "-oProxyCommand=touch /tmp/pwned" }),
        /Hôte SFTP invalide/,
    );
    assert.throws(
        () => assertSafeSftpConfig({ ...base, host: "backup.example.com -oProxyCommand=id" }),
        /Hôte SFTP invalide/,
    );
    assert.throws(
        () => assertSafeSftpConfig({ ...base, user: "dockge -oProxyCommand=id" }),
        /Utilisateur SFTP invalide/,
    );
    assert.throws(
        () => assertSafeSftpConfig({ ...base, keyPath: "/run/secrets/key -oProxyCommand=id" }),
        /Chemin de clé SSH invalide/,
    );
    assert.throws(
        () => assertSafeSftpConfig({ ...base, keyPath: "relative/id_ed25519" }),
        /Chemin de clé SSH invalide/,
    );
});

test("construit une identité Restic stable à partir de 8 octets aléatoires", () => {
    const randomId = Buffer.from("0123456789abcdef", "hex");
    const host = buildResticHostId(randomId);

    assert.equal(host, "dockge-0123456789abcdef");
    assert.throws(() => buildResticHostId(Buffer.alloc(7)), /exactly 8 random bytes/);
});

test("groupe le backup avec l’identité stable de l’installation", () => {
    const args = buildBackupArgs({
        paths: [ "/opt/docker/data", "/opt/docker/projects" ],
        tags: [ "dockge-enhanced", "manual" ],
        excludes: [ "*.log" ],
        host: "dockge-0123456789abcdef",
    });

    assert.deepEqual(args, [
        "backup", "-q", "/opt/docker/data", "/opt/docker/projects",
        "--tag", "dockge-enhanced", "--tag", "manual",
        "--exclude", "*.log",
        "--host", "dockge-0123456789abcdef",
        "--group-by", "host",
    ]);
});

test("limite la rétention à l’identité stable de l’installation", () => {
    const args = buildRetentionArgs({
        keepLast: 10,
        keepDaily: 7,
        keepWeekly: 4,
        keepMonthly: 3,
    }, "dockge-0123456789abcdef");

    assert.equal(args[0], "forget");
    // `--group-by ""` supprimerait le garde-fou de restic : sur un dépôt partagé, la
    // politique s'appliquerait aux snapshots de tous les hôtes confondus.
    assert.deepEqual(args.slice(1, 3), [ "--group-by", "host" ]);
    assert.deepEqual(args.slice(3), [
        "--host", "dockge-0123456789abcdef",
        "--keep-last", "10", "--keep-daily", "7", "--keep-weekly", "4", "--keep-monthly", "3",
        "--tag", "dockge-enhanced", "--prune",
    ]);
});
