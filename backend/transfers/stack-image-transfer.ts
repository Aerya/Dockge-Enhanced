import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { stackTransferTransport } from "./stack-transfer-transport";
import { runDocker } from "./stack-transfer";
import { ValidationError } from "../util-server";

export interface StackImageTransferArchive {
    image: string;
    snapshotId: string;
    archivePath: string;
    size: number;
}

function validImage(image: unknown): string {
    if (typeof image !== "string" || !image.trim() || image.length > 512 || /[\r\n\0]/.test(image)) {
        throw new ValidationError("Invalid Docker image reference");
    }
    return image.trim();
}

function waitProcess(child: ReturnType<typeof spawn>, label: string): Promise<void> {
    return new Promise((resolve, reject) => {
        let stderr = "";
        child.stderr?.on("data", chunk => {
            if (stderr.length < 1024 * 1024) {
                stderr += String(chunk);
            }
        });
        child.once("error", reject);
        child.once("close", code => code === 0 ? resolve() : reject(new Error(`${label} failed${stderr.trim() ? `: ${stderr.trim()}` : ` (exit ${code})`}`)));
    });
}

export async function exportStackImage(imageValue: unknown, repositoryId: string): Promise<StackImageTransferArchive> {
    const image = validImage(imageValue);
    await runDocker([ "image", "inspect", image ], undefined, 30_000).catch(() => {
        throw new ValidationError(`Docker image is not available on the source: ${image}`);
    });
    await stackTransferTransport.prepare(repositoryId);
    const archivePath = `images/${createHash("sha256").update(image).digest("hex")}.tar`;
    const save = spawn("docker", [ "image", "save", image ], { stdio: [ "ignore", "pipe", "pipe" ] });
    try {
        const [ snapshotId ] = await Promise.all([
            stackTransferTransport.upload(repositoryId, archivePath, [ "dockge-stack-image", image ], save.stdout!),
            waitProcess(save, "docker image save"),
        ]);
        const progress = await stackTransferTransport.resume(repositoryId, snapshotId);
        return { image,
            snapshotId,
            archivePath,
            size: progress.size };
    } catch (error) {
        save.kill("SIGTERM");
        throw error;
    }
}

export async function importStackImage(repositoryId: string, archive: StackImageTransferArchive): Promise<{ image: string }> {
    const image = validImage(archive.image);
    if (typeof archive.snapshotId !== "string" || typeof archive.archivePath !== "string") {
        throw new ValidationError("Invalid Docker image transfer archive");
    }
    const load = spawn("docker", [ "image", "load" ], { stdio: [ "pipe", "ignore", "pipe" ] });
    const loaded = waitProcess(load, "docker image load");
    try {
        await stackTransferTransport.restore(repositoryId, archive.snapshotId, archive.archivePath, load.stdin!);
        load.stdin?.end();
        await loaded;
        await runDocker([ "image", "inspect", image ], undefined, 30_000);
        return { image };
    } catch (error) {
        load.kill("SIGTERM");
        await loaded.catch(() => {});
        throw error;
    }
}
