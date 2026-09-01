import test from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { ExternalStackManager } from "../external-stacks";
import {
    BackupManager,
    BackupRunLock,
    assertExistingPathWithinRoots,
    assertPathWithinRoots,
    assertSafeSftpConfig,
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
    assert.deepEqual(buildComposeCommandArgs("/external/demo/compose.yaml", [ "ps" ], "existing-project"), [
        "compose", "-p", "existing-project", "-f", "compose.yaml", "ps",
    ]);
});

test("inclut le Compose et le fichier env d'une stack externe revalidée", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "dockge-backup-external-"));
    const allowed = path.join(root, "allowed");
    const workingDir = path.join(allowed, "radarr");
    const dataDir = path.join(root, "data");
    const stacksDir = path.join(root, "stacks");
    const composeFile = path.join(workingDir, "compose.yaml");
    try {
        await fs.mkdir(workingDir, { recursive: true });
        await fs.mkdir(stacksDir, { recursive: true });
        await fs.writeFile(composeFile, "services:\n  radarr:\n    image: lscr.io/linuxserver/radarr:latest\n");
        await fs.writeFile(path.join(workingDir, ".env"), "PUID=1000\n");
        const external = new ExternalStackManager(dataDir, stacksDir, [ allowed ]);
        await external.import("external-radarr", "external-real-radarr", composeFile);
        const backup = new BackupManager(external);
        backup.settings.includeEnvFiles = true;
        const result = await (backup as unknown as {
            buildBackupPaths(stackName?: string): Promise<{ paths: string[]; warnings: string[] }>;
        }).buildBackupPaths("external-radarr");

        assert.deepEqual(result.warnings, []);
        assert.deepEqual(result.paths.sort(), [ composeFile, path.join(workingDir, ".env") ].sort());
        assert.deepEqual(await backup.listStacks(), [ "external-radarr" ]);
    } finally {
        await fs.rm(root, { recursive: true, force: true });
    }
});

test("refuse une inscription externe devenue inaccessible ou sortie des racines", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "dockge-backup-external-invalid-"));
    const allowed = path.join(root, "allowed");
    const workingDir = path.join(allowed, "sonarr");
    const dataDir = path.join(root, "data");
    const stacksDir = path.join(root, "stacks");
    const composeFile = path.join(workingDir, "compose.yaml");
    try {
        await fs.mkdir(workingDir, { recursive: true });
        await fs.mkdir(stacksDir, { recursive: true });
        await fs.writeFile(composeFile, "services: {}\n");
        const external = new ExternalStackManager(dataDir, stacksDir, [ allowed ]);
        await external.import("external-sonarr", "external-real-sonarr", composeFile);
        await fs.rm(composeFile);
        const backup = new BackupManager(external);
        const result = await (backup as unknown as {
            buildBackupPaths(stackName?: string): Promise<{ paths: string[]; warnings: string[] }>;
        }).buildBackupPaths("external-sonarr");

        assert.deepEqual(result.paths, []);
        assert.match(result.warnings.join(" "), /Impossible de préparer les fichiers/);
        assert.deepEqual(await backup.listStacks(), []);
    } finally {
        await fs.rm(root, { recursive: true, force: true });
    }
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
