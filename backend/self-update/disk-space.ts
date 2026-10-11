import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const GIB = 1024 ** 3;

export function requiredSelfUpdateFreeBytes(currentImageBytes: number): number {
    if (!Number.isSafeInteger(currentImageBytes) || currentImageBytes <= 0) {
        throw new Error("Current image size is unavailable");
    }
    // Pulling the replacement can temporarily retain both images and unpacked layers.
    return Math.max(2 * GIB, 2 * currentImageBytes + GIB);
}

export function parseDockerFilesystemFreeBytes(output: string): number {
    const row = output.trim().split("\n").at(-1)?.trim().split(/\s+/);
    const availableKib = Number(row?.[3]);
    if (!row || row.length < 6 || !Number.isSafeInteger(availableKib) || availableKib < 0) {
        throw new Error("Docker storage free space could not be read");
    }
    return availableKib * 1024;
}

/** Inspect the Docker daemon's storage filesystem, not the Enhanced container's filesystem. */
export async function checkSelfUpdateDiskSpace(currentImageId: string,
    dockerCommand: (args: string[]) => Promise<string> = async args => (await execFileAsync("docker", args, { timeout: 30_000 })).stdout,
): Promise<{ freeBytes: number;
    requiredBytes: number }> {
    if (!/^sha256:[a-f0-9]{64}$/i.test(currentImageId)) {
        throw new Error("Current Docker image ID is invalid");
    }
    const [ rootResult, imageResult ] = await Promise.all([
        dockerCommand([ "info", "--format", "{{.DockerRootDir}}" ]),
        dockerCommand([ "image", "inspect", currentImageId, "--format", "{{.Size}}" ]),
    ]);
    const dockerRoot = rootResult.trim();
    if (!dockerRoot.startsWith("/") || dockerRoot.includes("\n")) {
        throw new Error("Docker storage path is unavailable");
    }
    const imageBytes = Number(imageResult.trim());
    const requiredBytes = requiredSelfUpdateFreeBytes(imageBytes);
    const stdout = await dockerCommand([
        "run", "--rm", "--pull=never", "--network=none", "--read-only",
        "-v", `${dockerRoot}:/dockge-docker-root:ro`,
        "--entrypoint", "df", currentImageId, "-Pk", "/dockge-docker-root",
    ]);
    return { freeBytes: parseDockerFilesystemFreeBytes(stdout),
        requiredBytes };
}
