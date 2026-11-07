// Isolated fixture deployed through Enhanced's Stack API, using an existing image.
import assert from "node:assert/strict";
import {
    mkdtemp,
    mkdir,
    rm,
    writeFile,
    chmod,
    symlink,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { promisify } from "node:util";
import { execFile } from "../backend/buffered-process";
import { Stack } from "../backend/stack";
import {
    readContainerFiles,
    MAX_CONTAINER_FILE,
} from "../backend/container-files";
import type { DockgeServer } from "../backend/dockge-server";
import type { DockgeSocket } from "../backend/util-server";
if (process.env.DOCKGE_FILES_TEST !== "1") {
    throw new Error("Explicit DOCKGE_FILES_TEST=1 required");
}
const exec = promisify(execFile);
await exec("docker", [ "image", "inspect", "busybox:stable" ]);
const root = await mkdtemp(join(tmpdir(), "enhanced-files-test-"));
await chmod(root, 0o755);
const stacksDir = join(root, "stacks");
const files = join(root, "files");
await mkdir(stacksDir);
await mkdir(files, { mode: 0o755 });
await writeFile(join(files, "hello.txt"), "REAL_READ_OK\n", { mode: 0o644 });
await writeFile(join(files, "private.txt"), "PRIVATE", { mode: 0o600 });
await writeFile(join(files, "binary.bin"), Buffer.from([ 0, 255 ]));
await writeFile(join(files, "large"), Buffer.alloc(MAX_CONTAINER_FILE + 1));
await symlink("/proc/self/status", join(files, "proc-link"));
const name = "enhanced-files-" + randomBytes(5).toString("hex");
const server = {
    stacksDir,
    config: { dataDir: join(root, "data") },
} as DockgeServer;
const compose = `services:\n  app:\n    image: busybox:stable\n    pull_policy: never\n    user: '65534:65534'\n    command: [sleep, '3600']\n    stop_grace_period: 1s\n    volumes:\n      - ${files}:/fixture:ro\n`;
const stack = new Stack(server, name, compose, "", true);
const socket = {
    id: name,
    endpoint: "",
    connected: true,
    emitAgent: () => {},
} as unknown as DockgeSocket;
try {
    await stack.save(true);
    await stack.start(socket);
    const id = (await stack.getContainerInstances())[0].id;
    const inspect = (id: unknown) => stack.getContainerInstance(id);
    const list = await readContainerFiles(inspect, id, "/fixture", "list");
    assert.ok(
        "entries" in list &&
            list.entries.some((entry) => entry.name === "hello.txt"),
    );
    const file = await readContainerFiles(
        inspect,
        id,
        "/fixture/hello.txt",
        "read",
    );
    assert.equal(
        "content" in file && Buffer.from(file.content, "base64").toString(),
        "REAL_READ_OK\n",
    );
    const binary = await readContainerFiles(
        inspect,
        id,
        "/fixture/binary.bin",
        "read",
    );
    assert.equal("content" in binary && binary.content, "AP8=");
    await assert.rejects(
        readContainerFiles(inspect, id, "/fixture/private.txt", "read"),
        /denied/,
    );
    await assert.rejects(
        readContainerFiles(inspect, id, "/fixture/large", "read"),
        /tooLarge/,
    );
    await assert.rejects(
        readContainerFiles(inspect, id, "/fixture/proc-link", "read"),
        /blockedPath/,
    );
    await assert.rejects(
        readContainerFiles(inspect, "f".repeat(64), "/", "list"),
        /belong/,
    );
    await stack.stop(socket);
    await assert.rejects(
        readContainerFiles(inspect, id, "/", "list"),
        /stopped/,
    );
    console.log(
        "PASS real non-root filesystem: listing, text/binary, permissions, size limit, symlink protection, ownership, stopped container",
    );
} finally {
    await exec("docker", stack.getComposeOptions("down", "--remove-orphans"), {
        cwd: stack.path,
        timeout: 45000,
    });
    await rm(root, { recursive: true,
        force: true });
    console.log("PASS fixture container, network and data removed");
}
