import { createHash, randomUUID } from "node:crypto";
import { promises as fs, existsSync } from "node:fs";
import path from "node:path";
import { execFile } from "../../extra/command-buffer.cjs";
import { promisify } from "node:util";
import { getSecretsStore, secretsError } from "./store";

const RELEASE = "2.1.0";
export const BITWARDEN_ASSETS = {
    x64: { name: "x86_64",
        sha256: "f59ee150e42b82128d437087e9bac920053c6bfddcb960d20ce9386e5ac9bba6" },
    arm64: { name: "aarch64",
        sha256: "eb0f1ae61d1c3b74244d2841233276e05c77e8be4da197ed90fc6248387005e1" },
};
function directory() {
    const store = getSecretsStore();
    if (!store) {
        throw secretsError();
    }
    return path.join(store.dataDir, "secret-tools");
}
export function bitwardenExecutable(): string {
    const managed = getSecretsStore() ? path.join(directory(), "bws") : "";
    return managed && existsSync(managed) ? managed : "bws";
}
export function bitwardenAvailable() {
    return existsSync(path.join(directory(), "bws")) || existsSync("/usr/local/bin/bws");
}
export function verifyBitwardenArchive(bytes: Uint8Array, expected: string) {
    if (createHash("sha256").update(bytes).digest("hex") !== expected) {
        throw secretsError();
    }
}
let installing = false;
/** Explicit admin action: download from the publisher, never redistribute the CLI in our image. */
export async function installBitwardenCLI() {
    if (installing || process.platform !== "linux" || !(process.arch in BITWARDEN_ASSETS)) {
        throw secretsError();
    }
    const asset = BITWARDEN_ASSETS[process.arch as keyof typeof BITWARDEN_ASSETS];
    const root = directory();
    installing = true;
    const archive = path.join(root, randomUUID() + ".zip");
    const binary = archive + ".bin";
    try {
        const url = `https://github.com/bitwarden/sdk-sm/releases/download/bws-v${RELEASE}/bws-${asset.name}-unknown-linux-musl-${RELEASE}.zip`;
        const response = await fetch(url, { signal: AbortSignal.timeout(60_000) });
        if (!response.ok || Number(response.headers.get("content-length")) > 64 * 1024 * 1024) {
            throw secretsError();
        }
        const reader = response.body?.getReader();
        if (!reader) {
            throw secretsError();
        }
        const chunks: Uint8Array[] = [];
        let size = 0;
        try {
            for (;;) {
                const { done, value } = await reader.read();
                if (done) {
                    break;
                }
                size += value.length;
                if (size > 64 * 1024 * 1024) {
                    throw secretsError();
                }
                chunks.push(value);
            }
        } finally {
            await reader.cancel();
        }
        const bytes = Buffer.concat(chunks);
        verifyBitwardenArchive(bytes, asset.sha256);
        await fs.mkdir(root, { recursive: true,
            mode: 0o700 });
        await fs.writeFile(archive, bytes, { flag: "wx",
            mode: 0o600 });
        const result = await promisify(execFile)("unzip", [ "-p", archive, "bws" ], { encoding: "buffer",
            timeout: 15_000,
            maxBuffer: 128 * 1024 * 1024 });
        await fs.writeFile(binary, result.stdout, { flag: "wx",
            mode: 0o700 });
        const version = await promisify(execFile)(binary, [ "--version" ], { timeout: 10_000,
            maxBuffer: 4096 });
        if (!version.stdout.trim().endsWith(RELEASE)) {
            throw secretsError();
        }
        await fs.rename(binary, path.join(root, "bws"));
    } catch {
        throw secretsError();
    } finally {
        installing = false;
        await fs.rm(archive, { force: true });
        await fs.rm(binary, { force: true });
    }
}
