import { Readable, Writable } from "node:stream";
import {
    backupStackTransferArchive,
    ensureStackTransferRepository,
    forgetStackTransferSnapshots,
    getStackTransferRepositories,
    restoreStackTransferArchive,
    StackTransferRepository,
} from "./stack-transfer-restic";

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
    cleanup(repositoryId: string, snapshotIds: string[]): Promise<void>;
}

class ResticTransferTransport implements TransferTransport {
    readonly kind = "restic" as const;

    list(): StackTransferRepository[] {
        return getStackTransferRepositories();
    }

    capabilities(repositoryId: string): TransferTransportCapabilities {
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
        return ensureStackTransferRepository(repositoryId);
    }

    upload(repositoryId: string, archivePath: string, tags: string[], input: Readable, prepared = false): Promise<string> {
        return backupStackTransferArchive(repositoryId, archivePath, tags, input, prepared);
    }

    restore(repositoryId: string, snapshotId: string, archivePath: string, output: Writable): Promise<void> {
        return restoreStackTransferArchive(repositoryId, snapshotId, archivePath, output);
    }

    cleanup(repositoryId: string, snapshotIds: string[]): Promise<void> {
        return forgetStackTransferSnapshots(repositoryId, snapshotIds);
    }
}

export const stackTransferTransport: TransferTransport = new ResticTransferTransport();
