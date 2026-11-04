// Integration test: Git and Docker Compose CLI required; never starts containers.
import assert from "node:assert/strict";
import test from "node:test";
import { promises as fs } from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import os from "node:os";
import path from "node:path";
import { StackGitService } from "../backend/stack-git-service";
import { Stack } from "../backend/stack";
import type { DockgeServer } from "../backend/dockge-server";

test("real Git pull and restore preserve file history and ignored environment", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "config-git-"));
    const execute = promisify(execFile);
    const git = (cwd: string, ...args: string[]) => execute("git", [ "-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", ...args ], { cwd });
    try {
        const upstream = path.join(root, "upstream");
        const stacksDir = path.join(root, "stacks");
        const dataDir = path.join(root, "data");
        await Promise.all([ upstream, stacksDir, dataDir ].map(dir => fs.mkdir(dir)));
        await git(upstream, "init");
        const original = "services:\n  web:\n    image: busybox:stable\n";
        await fs.writeFile(path.join(upstream, "compose.yaml"), original);
        await fs.writeFile(path.join(upstream, ".gitignore"), ".env\n.dockge-meta.json\n");
        await git(upstream, "add", ".");
        await git(upstream, "commit", "-m", "Initial fixture");
        const first = (await git(upstream, "rev-parse", "HEAD")).stdout.trim();
        await git(stacksDir, "clone", upstream, "fixture");
        const working = path.join(stacksDir, "fixture");
        await fs.writeFile(path.join(working, ".env"), "PRIVATE=fixture-only\n");
        await fs.writeFile(path.join(upstream, "compose.yaml"), original + "# second version\n");
        await git(upstream, "commit", "-am", "Second fixture");
        const server = { stacksDir,
            config: { dataDir },
            externalStacks: { get: async () => undefined } } as unknown as DockgeServer;
        const service = new StackGitService(server);
        await service.pull("fixture");
        const stack = await Stack.getStack(server, "fixture");
        const history = await stack.fileHistory.list();
        assert.equal(history.length, 1);
        assert.equal(history[0].reason, "git-pull");
        assert.equal((await stack.fileHistory.get(history[0].id)).files[path.join(working, "compose.yaml")], original);
        await service.restore("fixture", first);
        assert.equal(await fs.readFile(path.join(working, "compose.yaml"), "utf8"), original);
        assert.equal(await fs.readFile(path.join(working, ".env"), "utf8"), "PRIVATE=fixture-only\n");
        assert.equal((await stack.fileHistory.list()).length, 2);
    } finally {
        await fs.rm(root, { recursive: true,
            force: true });
    }
});
