import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
    AutomationAuthorizationError,
    AutomationIdentity,
    AutomationManager,
} from "./automation/automation-manager";
import { DockgeServer } from "./dockge-server";
import { Stack } from "./stack";
import {
    isSensitiveGitPath,
    validateGitRemote,
} from "./stack-git-service";

const fakeServer = {
    stacksDir: "/tmp/dockge-enhanced-tests",
} as DockgeServer;

test("Build + Recreate is exposed only for Compose build services", () => {
    const stack = new Stack(fakeServer, "demo", `
services:
  image-only:
    image: nginx:alpine
  local-context:
    build: .
  local-object:
    build:
      context: ./worker
  disabled:
    build: null
`, "", true);

    assert.deepEqual(stack.getBuildServices(), [ "local-context", "local-object" ]);
    assert.deepEqual(
        (stack.toSimpleJSON("") as { buildServices: string[] }).buildServices,
        [ "local-context", "local-object" ],
    );
});

test("invalid Compose never exposes Build + Recreate", () => {
    const stack = new Stack(fakeServer, "broken", "services: [", "", true);
    assert.deepEqual(stack.getBuildServices(), []);
});

test("stack notes preserve existing metadata and enforce their size limit", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "dockge-note-test-"));
    const stackDir = path.join(root, "demo");
    await fs.mkdir(stackDir);
    await fs.writeFile(path.join(stackDir, ".dockge-meta.json"), JSON.stringify({
        lastUpdated: "2026-07-26T00:00:00.000Z",
        lastStartedAt: "2026-07-26T01:00:00.000Z",
    }));
    const stack = new Stack({ stacksDir: root } as DockgeServer, "demo", "", "", true);

    try {
        assert.equal(await stack.saveNote("  runbook: internal wiki  "), "runbook: internal wiki");
        assert.deepEqual(
            JSON.parse(await fs.readFile(path.join(stackDir, ".dockge-meta.json"), "utf8")),
            {
                createdAt: null,
                createdAtEstimated: false,
                lastUpdated: "2026-07-26T00:00:00.000Z",
                lastStartedAt: "2026-07-26T01:00:00.000Z",
                note: "runbook: internal wiki",
                startGuard: { enabled: false, conditions: [] },
            },
        );
        await assert.rejects(stack.saveNote("x".repeat(10_001)), /10000/);
    } finally {
        await fs.rm(root, { recursive: true,
            force: true });
    }
});

test("automation permissions enforce both action and stack scope", () => {
    const manager = new AutomationManager();
    const identity: AutomationIdentity = {
        id: 1,
        name: "home-assistant",
        prefix: "test",
        permissions: [ "stack:read", "stack:restart" ],
        stacks: [ "immich" ],
    };

    assert.doesNotThrow(() => manager.assertAccess(identity, "stack:restart", "immich"));
    assert.throws(
        () => manager.assertAccess(identity, "stack:stop", "immich"),
        AutomationAuthorizationError,
    );
    assert.throws(
        () => manager.assertAccess(identity, "stack:restart", "paperless"),
        AutomationAuthorizationError,
    );
});

test("Git rejects credential-bearing or unsafe remotes", () => {
    assert.equal(
        validateGitRemote("https://github.com/Aerya/example.git"),
        "https://github.com/Aerya/example.git",
    );
    assert.equal(
        validateGitRemote("git@github.com:Aerya/example.git"),
        "git@github.com:Aerya/example.git",
    );
    assert.throws(
        () => validateGitRemote("https://token@github.com/Aerya/example.git"),
        /Credentials must not be embedded/,
    );
    assert.throws(
        () => validateGitRemote("file:///tmp/example"),
        /HTTPS or SSH/,
    );
});

test("Git recognizes nested environment, secret and private-key paths", () => {
    for (const file of [
        ".env",
        ".env.production",
        "config/.env",
        "secrets/password",
        "nested/server.key",
        "nested/cert.pem",
    ]) {
        assert.equal(isSensitiveGitPath(file), true, file);
    }
    assert.equal(isSensitiveGitPath(".env.example"), false);
    assert.equal(isSensitiveGitPath("compose.yaml"), false);
});
