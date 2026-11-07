import test from "node:test";
import assert from "node:assert/strict";
import {
    containerFilePath,
    parseContainerDirectory,
    readContainerFiles,
    MAX_CONTAINER_FILE,
} from "./container-files";
import type { ContainerInstance } from "./container-instances";
const instance = { id: "a".repeat(64),
    state: "running" } as ContainerInstance;

test("paths reject pseudo-filesystems, controls and relative paths", () => {
    for (const value of [
        "/proc/1/environ",
        "/tmp/../dev/zero",
        "/sys",
        "/x\0y",
        "/x\ny",
        "../etc",
    ]) {
        assert.throws(() => containerFilePath(value));
    }
    assert.equal(containerFilePath("/tmp/../etc/passwd"), "/etc/passwd");
});

test("ownership is checked on every request before running any Docker command", async () => {
    let ran = false;
    await assert.rejects(
        readContainerFiles(
            async () => {
                throw new Error("wrong stack");
            },
            instance.id,
            "/",
            "list",
            async () => {
                ran = true;
                return Buffer.alloc(0);
            },
        ),
    );
    assert.equal(ran, false);
    await assert.rejects(
        readContainerFiles(
            async () => ({ ...instance,
                state: "exited" }),
            instance.id,
            "/",
            "list",
        ),
        /stopped/,
    );
});

test("path is an argument, never shell code; no privilege or user override; binary output is bounded", async () => {
    const name = "/tmp/$(touch evil); --user root";
    const result = await readContainerFiles(
        async () => instance,
        instance.id,
        name,
        "read",
        async (args) => {
            assert.equal(args.at(-1), name);
            assert.equal(args.includes("--user"), false);
            assert.equal(args.includes("--privileged"), false);
            assert.equal(args.includes("timeout"), true);
            assert.equal(args[args.indexOf("-c") + 1].includes(name), false);
            return Buffer.from([ 0, 255, 1 ]);
        },
    );
    assert.equal("content" in result && result.content, "AP8B");
    await assert.rejects(
        readContainerFiles(
            async () => instance,
            instance.id,
            "/large",
            "read",
            async () => Buffer.alloc(MAX_CONTAINER_FILE + 1),
        ),
        /tooLarge/,
    );
});

test("directory framing handles spaces, truncation and malformed output", () => {
    const result = parseContainerDirectory(
        Buffer.from(
            [ "/tmp", "a b", "file", "123", "__TRUNCATED__", "" ].join("\0"),
        ),
    );
    assert.equal(result.truncated, true);
    assert.equal(result.entries[0].name, "a b");
    assert.throws(() =>
        parseContainerDirectory(Buffer.from("/\0../bad\0file\0")),
    );
});

test("concurrency limit releases all reservations on failure", async () => {
    let release!: () => void;
    const barrier = new Promise<void>((resolve) => {
        release = resolve;
    });
    const pending = Array.from({ length: 4 }, () =>
        readContainerFiles(
            async () => {
                await barrier;
                throw new Error("gone");
            },
            instance.id,
            "/",
            "list",
        ),
    );
    await assert.rejects(
        readContainerFiles(async () => instance, instance.id, "/", "list"),
        /unavailable/,
    );
    release();
    await Promise.allSettled(pending);
    const result = await readContainerFiles(
        async () => instance,
        instance.id,
        "/",
        "list",
        async () => Buffer.from("/\0"),
    );
    assert.equal(result.path, "/");
});
