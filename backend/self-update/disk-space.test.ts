import assert from "node:assert/strict";
import test from "node:test";
import { checkSelfUpdateDiskSpace, parseDockerFilesystemFreeBytes, requiredSelfUpdateFreeBytes } from "./disk-space";

test("self-update storage reserve covers the current image and unpacking overhead", () => {
    assert.equal(requiredSelfUpdateFreeBytes(500 * 1024 ** 2), 2 * 1024 ** 3);
    assert.equal(requiredSelfUpdateFreeBytes(2 * 1024 ** 3), 5 * 1024 ** 3);
    assert.throws(() => requiredSelfUpdateFreeBytes(0));
});

test("Docker filesystem free space is parsed from df, never from the app filesystem", () => {
    assert.equal(parseDockerFilesystemFreeBytes("Filesystem 1024-blocks Used Available Capacity Mounted on\n/dev/vda1 10000000 9000000 1000000 90% /dockge-docker-root\n"), 1_024_000_000);
    assert.throws(() => parseDockerFilesystemFreeBytes("Filesystem 1024-blocks Used Available\n"));
});

test("disk preflight uses Docker root with an existing image and never pulls a helper", async () => {
    const image = `sha256:${"a".repeat(64)}`;
    const calls: string[][] = [];
    const result = await checkSelfUpdateDiskSpace(image, async args => {
        calls.push(args);
        if (args[0] === "info") {
            return "/var/lib/docker\n";
        }
        if (args[0] === "image") {
            return String(500 * 1024 ** 2);
        }
        return "Filesystem 1024-blocks Used Available Capacity Mounted on\n/dev/vda1 10000000 1000000 9000000 10% /dockge-docker-root\n";
    });
    assert.equal(result.freeBytes, 9_216_000_000);
    assert.equal(result.requiredBytes, 2 * 1024 ** 3);
    assert.deepEqual(calls[2], [
        "run", "--rm", "--pull=never", "--network=none", "--read-only",
        "-v", "/var/lib/docker:/dockge-docker-root:ro",
        "--entrypoint", "df", image, "-Pk", "/dockge-docker-root",
    ]);
});
