import test, { mock } from "node:test";
import assert from "node:assert/strict";
import { BackupManager } from "../watchers/backup-manager";
import { stackTransferTransport } from "./stack-transfer-transport";

test("describes secure HTTP REST and SSH SFTP repositories through one transport", () => {
    const manager = BackupManager.getInstance();
    const previous = manager.settings.destinations;
    manager.settings.destinations = [
        { label: "HTTP",
            enabled: true,
            type: "rest",
            rest: { url: "https://backup.example.test" },
            resticPassword: "secret" },
        { label: "SSH",
            enabled: true,
            type: "sftp",
            sftp: { host: "backup.example.test",
                port: 22,
                user: "dockge",
                path: "/repo",
                authMode: "key" },
            resticPassword: "secret" },
    ];
    try {
        const repositories = stackTransferTransport.list();
        assert.deepEqual(repositories.map(item => item.type), [ "rest", "sftp" ]);
        for (const repository of repositories) {
            assert.deepEqual(stackTransferTransport.capabilities(repository.id), { encrypted: true,
                checksumVerified: true,
                retryable: true,
                resumableRepository: true });
        }
    } finally {
        manager.settings.destinations = previous;
        mock.restoreAll();
    }
});

test("exposes explicit rsync profiles without exposing their key path", () => {
    const previous = process.env.DOCKGE_TRANSFER_RSYNC_PROFILES;
    process.env.DOCKGE_TRANSFER_RSYNC_PROFILES = JSON.stringify([{ label: "Standby SSH",
        host: "backup.example.test",
        user: "dockge",
        path: "/srv/dockge-transfer",
        keyPath: "/run/secrets/dockge_rsync_key",
        bandwidthKbps: 4096 }]);
    try {
        const repository = stackTransferTransport.list().find(item => item.type === "rsync");
        assert.ok(repository);
        assert.equal(JSON.stringify(repository).includes("key"), false);
        assert.deepEqual(stackTransferTransport.capabilities(repository.id), { encrypted: true,
            checksumVerified: true,
            retryable: true,
            resumableRepository: true });
    } finally {
        if (previous === undefined) {
            delete process.env.DOCKGE_TRANSFER_RSYNC_PROFILES;
        } else {
            process.env.DOCKGE_TRANSFER_RSYNC_PROFILES = previous;
        }
    }
});
