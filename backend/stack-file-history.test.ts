import assert from "node:assert/strict";
import test from "node:test";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { StackFileHistory } from "./stack-file-history";
import { withStackMutation } from "./stack-mutation";

test("encrypted revisions retain 20 versions, deduplicate and restore exact files without deployment", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "config-history-"));
    try {
        const paths = { compose: path.join(dir, "compose.yaml"),
            env: path.join(dir, ".env"),
            override: path.join(dir, "compose.override.yaml") };
        const store = new StackFileHistory(dir, "stack-a");
        await fs.writeFile(paths.env, "TOKEN=super-private-secret");
        for (let index = 0; index < 25; index++) {
            await fs.writeFile(paths.compose, `services: { web: { image: 'fixture:${index}' } }`);
            await store.capture(paths, "save");
        }
        await store.capture(paths, "save");
        const entries = await store.list();
        assert.equal(entries.length, 20);
        assert.equal(JSON.stringify(entries).includes("super-private"), false);
        const sealed = await fs.readdir(path.join(dir, "stack-file-history"), { recursive: true });
        for (const name of sealed.filter(name => name.endsWith(".json"))) {
            assert.equal((await fs.readFile(path.join(dir, "stack-file-history", name), "utf8")).includes("super-private"), false);
        }
        const oldest = entries.at(-1)!;
        const prior = await store.get(oldest.id);
        await fs.writeFile(paths.override, "services: {}");
        await store.restore(paths, oldest.id);
        assert.equal(await fs.readFile(paths.compose, "utf8"), prior.files.compose);
        await assert.rejects(fs.stat(paths.override), { code: "ENOENT" });
        assert.equal(await fs.readFile(paths.env, "utf8"), "TOKEN=super-private-secret");
        assert.equal((await fs.stat(path.join(dir, "stack-file-history.key"))).mode & 0o777, 0o600);
        await assert.rejects(store.get("../../etc/passwd"));
        await assert.rejects(store.restore({ other: paths.env }, oldest.id));
        assert.equal((await new StackFileHistory(dir, "stack-b").list()).length, 0);
        assert.equal((await new StackFileHistory(dir, "stack-a").list()).length, 20);
    } finally {
        await fs.rm(dir, { recursive: true,
            force: true });
    }
});

test("missing keys and oversized files fail closed without changing configuration", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "config-failure-"));
    try {
        const file = path.join(dir, "compose.yaml");
        const store = new StackFileHistory(dir, "stack");
        await fs.writeFile(file, "services: {}");
        await store.capture({ file }, "save");
        const revision = (await store.list())[0];
        await fs.unlink(path.join(dir, "stack-file-history.key"));
        await assert.rejects(store.restore({ file }, revision.id));
        assert.equal(await fs.readFile(file, "utf8"), "services: {}");
        await assert.rejects(store.capture({ file }, "save"));
        await fs.writeFile(file, Buffer.alloc(2 * 1024 * 1024 + 1));
        await assert.rejects(store.readFiles({ file }));
    } finally {
        await fs.rm(dir, { recursive: true,
            force: true });
    }
});

test("different stacks can create the encryption key concurrently", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "config-concurrent-"));
    try {
        const file = path.join(dir, "compose.yaml");
        await fs.writeFile(file, "services: {}");
        const stores = Array.from({ length: 10 }, (_, i) => new StackFileHistory(dir, `stack-${i}`));
        await Promise.all(stores.map(store => store.capture({ file }, "save")));
        assert.deepEqual(await Promise.all(stores.map(async store => (await store.list()).length)), Array(10).fill(1));
    } finally {
        await fs.rm(dir, { recursive: true,
            force: true });
    }
});

test("restore/save/Git reservations cannot overlap", async () => {
    let release!: () => void;
    const barrier = new Promise<void>(resolve => {
        release = resolve;
    });
    const first = withStackMutation("history-project", async () => barrier);
    await assert.rejects(withStackMutation("history-project", async () => undefined));
    release();
    await first;
    await withStackMutation("history-project", async () => undefined);
});
