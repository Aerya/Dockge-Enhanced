import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { Stack } from "./stack";

test("real Compose inherits shared values, applies local empty values and keeps instance boundaries", async t => {
    const root = await mkdtemp(path.join(tmpdir(), "enhanced-shared-env-"));
    t.after(() => rm(root, { recursive: true,
        force: true }));
    const stacksDir = path.join(root, "managed");
    const workingDir = path.join(root, "separate", "demo");
    await mkdir(stacksDir, { recursive: true });
    await mkdir(workingDir, { recursive: true });
    await writeFile(path.join(root, ".env"), "INHERIT_VALUE=do-not-inherit-parent\n");
    await writeFile(path.join(stacksDir, "global.env"), "INHERIT_VALUE=shared\nINHERIT_EMPTY=shared\nINHERIT_OTHER=common\n");
    await writeFile(path.join(workingDir, ".env"), "INHERIT_VALUE=local\nINHERIT_EMPTY=\n");
    await writeFile(path.join(workingDir, "compose.yaml"), "services:\n  demo:\n    image: busybox:stable\n    environment:\n      VALUE: ${INHERIT_VALUE-default}\n      EMPTY: ${INHERIT_EMPTY-default}\n      OTHER: ${INHERIT_OTHER-default}\n");
    const host = { stacksDir };
    const fake = { server: host,
        path: workingDir,
        isExternal: false } as unknown as Stack;
    const args = () => Stack.prototype.getComposeOptions.call(fake, "config", "--format", "json");
    const environment = { ...process.env };
    for (const key of Object.keys(environment)) {
        if (key.startsWith("INHERIT_")) {
            delete environment[key];
        }
    }
    const run = (extraEnv = {}) => JSON.parse(execFileSync("docker", args(), { cwd: workingDir,
        env: { ...environment,
            ...extraEnv },
        encoding: "utf8",
        timeout: 15000 })).services.demo.environment;
    assert.deepEqual(run(), { VALUE: "local",
        EMPTY: "",
        OTHER: "common" });
    assert.equal(run({ INHERIT_VALUE: "process" }).VALUE, "process");
    await rm(path.join(workingDir, ".env"));
    assert.deepEqual(run(), { VALUE: "shared",
        EMPTY: "shared",
        OTHER: "common" });
    await writeFile(path.join(stacksDir, "global.env"), "INHERIT_VALUE=changed\n");
    assert.equal(run().VALUE, "changed"); // Commands read current values, not cached settings.
    await rm(path.join(stacksDir, "global.env"));
    assert.equal(run().VALUE, "default"); // Never scans parent .env files.
    const otherInstance = path.join(root, "other-instance");
    await mkdir(otherInstance);
    await writeFile(path.join(otherInstance, "global.env"), "INHERIT_VALUE=other-instance\n");
    host.stacksDir = otherInstance;
    assert.equal(run().VALUE, "other-instance");
});

test("external stacks retain explicit env-file order without inheriting Enhanced global.env", async t => {
    const root = await mkdtemp(path.join(tmpdir(), "enhanced-external-env-"));
    t.after(() => rm(root, { recursive: true,
        force: true }));
    await writeFile(path.join(root, "global.env"), "PRIVATE_SHARED=not-for-external\n");
    const fake = { server: { stacksDir: root },
        path: root,
        isExternal: true,
        _externalProject: "existing",
        _externalConfigFiles: [ path.join(root, "compose.yaml") ],
        _externalEnvFiles: [ path.join(root, "base.env"), path.join(root, "override.env") ] } as unknown as Stack;
    const args = Stack.prototype.getComposeOptions.call(fake, "config");
    assert.deepEqual(args.filter((_, i) => args[i - 1] === "--env-file"), [ path.join(root, "base.env"), path.join(root, "override.env") ]);
    assert.equal(args.includes(path.join(root, "global.env")), false);
});
