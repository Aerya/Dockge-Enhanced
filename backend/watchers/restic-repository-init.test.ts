import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { assertExistingPathWithinRoots, isResticRepositoryMissingError } from "./backup-manager";

test("recognises a genuinely missing config", () => {
    assert.equal(isResticRepositoryMissingError(new Error("unable to open config file: no such file or directory")), true);
    assert.equal(isResticRepositoryMissingError(new Error("repository does not exist")), true);
});

test("does not initialise on errors that might hide an existing repository", () => {
    for (const error of [
        "wrong password or no key found",
        "permission denied: unable to open config file: no such file or directory",
        "network is unreachable",
        "connection refused",
        "cannot access endpoint: timeout",
        "invalid repository configuration",
    ]) {
        assert.equal(isResticRepositoryMissingError(new Error(error)), false, error);
    }
});


test("backup path validation rejects traversal and symlinks escaping the allowed root", async () => {
    const temp = await mkdtemp(path.join(os.tmpdir(), "dockge-restic-path-test-"));
    const allowed = path.join(temp, "allowed");
    const outside = path.join(temp, "outside");
    try {
        await mkdir(allowed);
        await mkdir(outside);
        await writeFile(path.join(allowed, "ok.txt"), "safe");
        await writeFile(path.join(outside, "secret.txt"), "private");
        await symlink(outside, path.join(allowed, "escape"));

        assert.equal(
            await assertExistingPathWithinRoots(path.join(allowed, "ok.txt"), [ allowed ]),
            path.join(allowed, "ok.txt"),
        );
        await assert.rejects(
            assertExistingPathWithinRoots(path.join(allowed, "..", "outside", "secret.txt"), [ allowed ]),
        );
        await assert.rejects(
            assertExistingPathWithinRoots(path.join(allowed, "escape", "secret.txt"), [ allowed ]),
        );
    } finally {
        await rm(temp, { recursive: true,
            force: true });
    }
});
