import test from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
    BackupManager,
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
import { resolveDataDir } from "../data-dir";

test("#467 conserve le mot de passe Restic dans le répertoire persistant sans DOCKGE_DATA_DIR", async () => {
    const persistent = await fs.mkdtemp(path.join(os.tmpdir(), "dockge-backup-settings-"));
    const dataDir = resolveDataDir({
        standardDataDir: persistent,
        legacyDataDir: path.join(persistent, "missing-legacy"),
        exists: directory => directory === persistent,
        readDirectory: () => [],
    });
    const manager = new BackupManager(undefined, dataDir);
    manager.restart = () => {};
    const secret = "restic-test-secret-467";
    await manager.saveSettings({ destinations: [{
        label: "Local",
        enabled: true,
        type: "local",
        resticPassword: secret,
        local: { path: path.join(persistent, "backups") },
    }] });
    const file = await fs.readFile(path.join(persistent, "backup-settings.json"), "utf8");
    assert.match(file, new RegExp(secret));
    const recreated = new BackupManager(undefined, dataDir);
    await recreated.loadSettings();
    assert.equal(recreated.settings.destinations[0].resticPassword, secret);
    assert.equal(recreated.getSettingsSafe().destinations[0].resticPassword, "***");
    assert.ok(recreated.settings.destinations[0].resticPassword, "Restic password is configured internally");
    await fs.rm(persistent, { recursive: true,
        force: true });
});

test("avertit si le dépôt est sous une source et refuse de sauvegarder le dépôt lui-même", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "dockge-backup-overlap-"));
    try {
        const manager = new BackupManager(undefined, root);
        manager.restart = () => {};
        Object.defineProperty(manager, "getAllHostBackupMounts", { value: async () => [] });
        const repository = path.join(root, "backups", "restic");
        await manager.saveSettings({ destinations: [{
            label: "Local",
            enabled: true,
            type: "local",
            resticPassword: "test-password",
            local: { path: repository },
        }] });
        assert.deepEqual(await manager.saveSettings({ extraPaths: [ root ] }), [{ source: root,
            repository }]);
        assert.deepEqual(await manager.getRepositoryOverlapWarnings(), [{ source: root,
            repository }]);
        await assert.rejects(manager.saveSettings({ volumeBackup: { selectedVolumes: [ path.join(repository, "data") ] } }), /ne peut pas être sauvegardé/);
        assert.deepEqual(manager.settings.extraPaths, [ root ]);
        assert.deepEqual(manager.settings.volumeBackup.selectedVolumes, []);
        const saved = JSON.parse(await fs.readFile(path.join(root, "backup-settings.json"), "utf8"));
        assert.deepEqual(saved.extraPaths, [ root ]);
        assert.deepEqual(saved.volumeBackup.selectedVolumes, []);
    } finally {
        await fs.rm(root, { recursive: true,
            force: true });
    }
});

test("conserve les réglages existants et leurs secrets lors d'une sauvegarde partielle ou masquée", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "dockge-backup-compatibility-"));
    try {
        const manager = new BackupManager(undefined, root);
        manager.restart = () => {};
        Object.defineProperty(manager, "getAllHostBackupMounts", { value: async () => [] });
        manager.settings.destinations = [
            { label: "Local",
                type: "local",
                enabled: true,
                resticPassword: "local-secret",
                local: { path: path.join(root, "backups") } },
            { label: "SSH",
                type: "sftp",
                enabled: true,
                resticPassword: "sftp-secret",
                sftp: { host: "backup.example.test",
                    port: 22,
                    user: "backup",
                    path: "/archives",
                    authMode: "password",
                    password: "ssh-secret" } },
            { label: "S3",
                type: "s3",
                enabled: false,
                resticPassword: "s3-secret",
                s3: { bucket: "backups",
                    path: "archives",
                    accessKeyId: "test-key",
                    secretAccessKey: "s3-access-secret" } },
            { label: "REST",
                type: "rest",
                enabled: true,
                resticPassword: "rest-secret",
                rest: { url: "https://backup.example.test",
                    user: "backup",
                    password: "http-secret" } },
        ];
        manager.settings.extraPaths = [ root ];
        manager.settings.excludePatterns = [ "*.tmp" ];
        manager.settings.excludedStacks = [ "ignored-stack" ];
        manager.settings.stackPolicies = { database: { mode: "stop" } };
        const expected = structuredClone(manager.settings);
        expected.intervalHours = 12;
        await manager.saveSettings({ intervalHours: 12 });
        assert.deepEqual(manager.settings, expected);
        await manager.saveSettings({ destinations: manager.getSettingsSafe().destinations });
        assert.deepEqual(JSON.parse(await fs.readFile(path.join(root, "backup-settings.json"), "utf8")), expected);
        const recreated = new BackupManager(undefined, root);
        await recreated.loadSettings();
        assert.deepEqual(recreated.settings, expected);
    } finally {
        await fs.rm(root, { recursive: true,
            force: true });
    }
});

test("protège aussi un dépôt local désactivé sous une source sauvegardée", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "dockge-disabled-repository-"));
    try {
        const manager = new BackupManager(undefined, root);
        manager.restart = () => {};
        Object.defineProperty(manager, "getAllHostBackupMounts", { value: async () => [] });
        const repository = path.join(root, "old-repository");
        const warnings = await manager.saveSettings({
            extraPaths: [ root ],
            destinations: [{ label: "Disabled",
                type: "local",
                enabled: false,
                resticPassword: "test-password",
                local: { path: repository } }],
        });
        assert.deepEqual(warnings, [{ source: root,
            repository }]);
        await assert.rejects(manager.saveSettings({ extraPaths: [ repository ] }), /ne peut pas être sauvegardé/);
        assert.deepEqual(manager.settings.extraPaths, [ root ]);
    } finally {
        await fs.rm(root, { recursive: true,
            force: true });
    }
});

test("une destination distante seule ne dépend pas de l'inspection Docker", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "dockge-remote-repository-"));
    try {
        const manager = new BackupManager(undefined, root);
        manager.restart = () => {};
        Object.defineProperty(manager, "getAllHostBackupMounts", { value: async () => {
            throw new Error("Docker unavailable");
        } });
        assert.deepEqual(await manager.saveSettings({
            extraPaths: [ root ],
            destinations: [{ label: "REST",
                type: "rest",
                enabled: true,
                resticPassword: "test-password",
                rest: { url: "https://backup.example.test" } }],
        }), []);
        assert.deepEqual(manager.settings.extraPaths, [ root ]);
    } finally {
        await fs.rm(root, { recursive: true,
            force: true });
    }
});

test("conserve la migration des anciens réglages destination sans réinitialiser le dépôt", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "dockge-legacy-repository-"));
    try {
        const repository = path.join(root, "backups");
        await fs.writeFile(path.join(root, "backup-settings.json"), JSON.stringify({
            enabled: true,
            destination: { type: "local",
                local: { path: repository },
                resticPassword: "legacy-secret" },
            extraPaths: [ root ],
            retention: { keepLast: 3,
                keepDaily: 2,
                keepWeekly: 1,
                keepMonthly: 1 },
        }));
        const manager = new BackupManager(undefined, root);
        manager.restart = () => {};
        Object.defineProperty(manager, "getAllHostBackupMounts", { value: async () => [] });
        await manager.loadSettings();
        assert.deepEqual(await manager.getRepositoryOverlapWarnings(), [{ source: root,
            repository }]);
        const expected = structuredClone(manager.settings);
        await manager.saveSettings({ destinations: manager.getSettingsSafe().destinations });
        const recreated = new BackupManager(undefined, root);
        await recreated.loadSettings();
        assert.deepEqual(recreated.settings, expected);
        assert.equal(recreated.settings.destinations[0].resticPassword, "legacy-secret");
        assert.equal(recreated.settings.destinations[0].local?.path, repository);
        assert.deepEqual(recreated.settings.retention, { keepLast: 3,
            keepDaily: 2,
            keepWeekly: 1,
            keepMonthly: 1 });
    } finally {
        await fs.rm(root, { recursive: true,
            force: true });
    }
});

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
        await fs.rm(root, { recursive: true,
            force: true });
        await fs.rm(outside, { recursive: true,
            force: true });
    }
});

test("résout les chemins existants avec l’API Node", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "dockge-path-existing-"));
    const child = path.join(root, "child");
    try {
        await fs.mkdir(child);
        assert.equal(await assertExistingPathWithinRoots(child, [ root ]), await fs.realpath(child));
    } finally {
        await fs.rm(root, { recursive: true,
            force: true });
    }
});

test("autorise toujours /app/data dans le navigateur de volumes", () => {
    const roots = buildVolumeBrowseRoots([
        { source: "/volume1/docker",
            destination: "/dockers-data" },
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
        await fs.rm(root, { recursive: true,
            force: true });
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
        () => assertSafeSftpConfig({ ...base,
            host: "-oProxyCommand=touch /tmp/pwned" }),
        /Hôte SFTP invalide/,
    );
    assert.throws(
        () => assertSafeSftpConfig({ ...base,
            host: "backup.example.com -oProxyCommand=id" }),
        /Hôte SFTP invalide/,
    );
    assert.throws(
        () => assertSafeSftpConfig({ ...base,
            user: "dockge -oProxyCommand=id" }),
        /Utilisateur SFTP invalide/,
    );
    assert.throws(
        () => assertSafeSftpConfig({ ...base,
            keyPath: "/run/secrets/key -oProxyCommand=id" }),
        /Chemin de clé SSH invalide/,
    );
    assert.throws(
        () => assertSafeSftpConfig({ ...base,
            keyPath: "relative/id_ed25519" }),
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
