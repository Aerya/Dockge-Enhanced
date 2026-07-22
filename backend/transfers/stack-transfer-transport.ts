import { Readable, Writable } from "node:stream";
import {
    backupStackTransferArchive,
    ensureStackTransferRepository,
    forgetStackTransferSnapshots,
    getStackTransferRepositories,
    restoreStackTransferArchive,
    verifyStackTransferArchive,
    StackTransferRepository,
} from "./stack-transfer-restic";
import {
    cleanupDirectHttpArchives,
    directHttpUsesTls,
    isDirectHttpRepository,
    restoreDirectHttpArchive,
    resumeDirectHttpArchive,
    uploadDirectHttpArchive,
    verifyDirectHttpArchive,
} from "./http-direct-transport";
import {
    cleanupRsyncArchives,
    isRsyncRepository,
    listRsyncRepositories,
    prepareRsyncRepository,
    restoreRsyncArchive,
    resumeRsyncArchive,
    uploadRsyncArchive,
    verifyRsyncArchive,
} from "./rsync-transfer-transport";
import {
    cleanupManagedReplicationSnapshots,
    isManagedReplicationRepository,
    managedReplicationSnapshotSize,
    restoreManagedReplicationSnapshot,
    verifyManagedReplicationSnapshot,
} from "./managed-replication-transport";

export interface TransferTransportCapabilities {
    encrypted: boolean;
    checksumVerified: boolean;
    retryable: boolean;
    resumableRepository: boolean;
}

export interface TransferTransport {
    readonly kind: "restic";
    list(): StackTransferRepository[];
    capabilities(repositoryId: string): TransferTransportCapabilities;
    prepare(repositoryId: string): Promise<void>;
    upload(repositoryId: string, archivePath: string, tags: string[], input: Readable, prepared?: boolean): Promise<string>;
    restore(repositoryId: string, snapshotId: string, archivePath: string, output: Writable): Promise<void>;
    resume(repositoryId: string, snapshotId: string): Promise<{ offset: number; size: number }>;
    verify(repositoryId: string, snapshotId: string, archivePath: string): Promise<void>;
    cleanup(repositoryId: string, snapshotIds: string[]): Promise<void>;
}

class ResticTransferTransport implements TransferTransport {
    readonly kind = "restic" as const;

    list(): StackTransferRepository[] {
        return [ ...getStackTransferRepositories(), ...listRsyncRepositories() ];
    }

    capabilities(repositoryId: string): TransferTransportCapabilities {
        if (isDirectHttpRepository(repositoryId)) {
            return { encrypted: directHttpUsesTls(repositoryId),
                checksumVerified: true,
                retryable: true,
                resumableRepository: true };
        }
        if (isRsyncRepository(repositoryId)) {
            return { encrypted: true,
                checksumVerified: true,
                retryable: true,
                resumableRepository: true };
        }
        if (isManagedReplicationRepository(repositoryId)) {
            return { encrypted: true,
                checksumVerified: true,
                retryable: true,
                resumableRepository: true };
        }
        const repository = this.list().find(item => item.id === repositoryId);
        if (!repository) {
            throw new Error("Shared transfer repository is not configured on this instance");
        }
        return { encrypted: true,
            checksumVerified: true,
            retryable: true,
            resumableRepository: repository.type !== "local" };
    }

    prepare(repositoryId: string): Promise<void> {
        if (isDirectHttpRepository(repositoryId)) {
            return Promise.resolve();
        }
        if (isRsyncRepository(repositoryId)) {
            return prepareRsyncRepository(repositoryId);
        }
        if (isManagedReplicationRepository(repositoryId)) {
            return Promise.resolve();
        }
        return ensureStackTransferRepository(repositoryId);
    }

    upload(repositoryId: string, archivePath: string, tags: string[], input: Readable, prepared = false): Promise<string> {
        if (isDirectHttpRepository(repositoryId)) {
            return uploadDirectHttpArchive(repositoryId, input);
        }
        if (isRsyncRepository(repositoryId)) {
            return uploadRsyncArchive(repositoryId, input);
        }
        if (isManagedReplicationRepository(repositoryId)) {
            return Promise.reject(new Error("Managed replication repositories are target-only"));
        }
        return backupStackTransferArchive(repositoryId, archivePath, tags, input, prepared);
    }

    restore(repositoryId: string, snapshotId: string, archivePath: string, output: Writable): Promise<void> {
        if (isDirectHttpRepository(repositoryId)) {
            return restoreDirectHttpArchive(repositoryId, snapshotId, output);
        }
        if (isRsyncRepository(repositoryId)) {
            return restoreRsyncArchive(repositoryId, snapshotId, output);
        }
        if (isManagedReplicationRepository(repositoryId)) {
            return restoreManagedReplicationSnapshot(repositoryId, snapshotId, output);
        }
        return restoreStackTransferArchive(repositoryId, snapshotId, archivePath, output);
    }

    resume(repositoryId: string, snapshotId: string): Promise<{ offset: number; size: number }> {
        if (isDirectHttpRepository(repositoryId)) {
            return resumeDirectHttpArchive(repositoryId, snapshotId);
        }
        if (isRsyncRepository(repositoryId)) {
            return resumeRsyncArchive(repositoryId, snapshotId);
        }
        if (isManagedReplicationRepository(repositoryId)) {
            return managedReplicationSnapshotSize(repositoryId, snapshotId).then(size => ({ offset: 0,
                size }));
        }
        return Promise.resolve({ offset: 0,
            size: 0 });
    }

    verify(repositoryId: string, snapshotId: string, archivePath: string): Promise<void> {
        if (isDirectHttpRepository(repositoryId)) {
            return verifyDirectHttpArchive(repositoryId, snapshotId);
        }
        if (isRsyncRepository(repositoryId)) {
            return verifyRsyncArchive(repositoryId, snapshotId);
        }
        if (isManagedReplicationRepository(repositoryId)) {
            return verifyManagedReplicationSnapshot(repositoryId, snapshotId);
        }
        return verifyStackTransferArchive(repositoryId, snapshotId, archivePath);
    }

    cleanup(repositoryId: string, snapshotIds: string[]): Promise<void> {
        if (isDirectHttpRepository(repositoryId)) {
            return cleanupDirectHttpArchives(snapshotIds);
        }
        if (isRsyncRepository(repositoryId)) {
            return cleanupRsyncArchives(repositoryId, snapshotIds);
        }
        if (isManagedReplicationRepository(repositoryId)) {
            return cleanupManagedReplicationSnapshots(repositoryId, snapshotIds);
        }
        return forgetStackTransferSnapshots(repositoryId, snapshotIds);
    }
}

export const stackTransferTransport: TransferTransport = new ResticTransferTransport();
