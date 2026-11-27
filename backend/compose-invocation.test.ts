import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync } from "node:child_process";
import { mkdtemp, writeFile, rm, mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { composeExecInvocation } from "./watchers/image-watcher";
import { composePrefixWithOverride } from "./compose-invocation";
import { Stack } from "./stack";
import type { DockgeServer } from "./dockge-server";

const base = "services:\n  vpn:\n    image: busybox:stable\n    command: [sleep, '300']\n    environment:\n      SERVER_NAMES: primary\n      SHARED: ${SHARED_VALUE:-default}\n      LOCAL: ${LOCAL_VALUE:-default}\n";
const override = "services:\n  vpn:\n    environment:\n      SERVER_NAMES: selected\n";
const run = (args: string[], cwd: string) => execFileSync("docker", args, { cwd,
    encoding: "utf8",
    timeout: 30_000 });

for (const variant of [ "none", "compose.override.yaml", "compose.override.yml", "docker-compose.override.yml", "explicit", "dotenv" ]) {
    test(`real Compose preserves effective configuration through update commands: ${variant}`, async t => {
        const root = await mkdtemp(path.join(os.tmpdir(), "compose-update-"));
        t.after(() => rm(root, { recursive: true,
            force: true }));
        const cwd = path.join(root, "demo");
        await mkdir(cwd);
        const composePath = path.join(cwd, "compose.yaml");
        await writeFile(composePath, base);
        await writeFile(path.join(root, "global.env"), "SHARED_VALUE=shared\nLOCAL_VALUE=shared\n");
        await writeFile(path.join(cwd, ".env"), "LOCAL_VALUE=local\n");
        let files: string[] | undefined;
        if (variant === "explicit" || variant === "dotenv") {
            await writeFile(path.join(cwd, "first.yaml"), override);
            await writeFile(path.join(cwd, "last.yaml"), override.replace("selected", "last"));
            // An unrelated default override must not enter an explicit chain.
            await writeFile(path.join(cwd, "compose.override.yaml"), override.replace("selected", "unwanted"));
            files = [ composePath, path.join(cwd, "first.yaml"), path.join(cwd, "last.yaml") ];
            if (variant === "dotenv") {
                await writeFile(path.join(cwd, ".env"), "LOCAL_VALUE=local\nCOMPOSE_PATH_SEPARATOR=|\nCOMPOSE_FILE=compose.yaml|first.yaml|last.yaml\n");
                files = undefined;
            }
        } else if (variant !== "none") {
            await writeFile(path.join(cwd, variant), override);
        }
        const expected = variant === "none" ? "primary" : [ "explicit", "dotenv" ].includes(variant) ? "last" : "selected";
        const invocation = (args: string[]) => composeExecInvocation(composePath, args, files ? "original" : undefined, files, files ? cwd : undefined);
        const stack = new Stack({ stacksDir: root } as DockgeServer, "demo", undefined, undefined, false, undefined,
            files ? cwd : undefined, files ? "original" : undefined, files);
        for (const command of [[ "config" ], [ "pull", "vpn" ], [ "up", "-d", "--force-recreate", "vpn" ]]) {
            // Resolve the exact prefix used by each phase with the real Compose CLI.
            const generated = invocation(command);
            const prefix = generated.args.slice(0, -command.length);
            const model = JSON.parse(run([ ...prefix, "config", "--format", "json" ], cwd));
            assert.equal(model.services.vpn.environment.SERVER_NAMES, expected);
            assert.equal(model.services.vpn.environment.LOCAL, "local");
            assert.equal(model.services.vpn.environment.SHARED, files ? "default" : "shared");
            const manual = stack.getComposeOptions(command[0], ...command.slice(1)).slice(0, -command.length);
            assert.deepEqual(JSON.parse(run([ ...manual, "config", "--format", "json" ], cwd)), model);
        }
        const temporary = path.join(cwd, "rollout.yaml");
        await writeFile(temporary, "services:\n  vpn:\n    labels:\n      fixture: rollout\n");
        const prefix = await composePrefixWithOverride(invocation([]).args, cwd, temporary, async args => run(args, cwd));
        const model = JSON.parse(run([ ...prefix, "config", "--format", "json" ], cwd));
        assert.equal(model.services.vpn.environment.SERVER_NAMES, expected);
        assert.equal(model.services.vpn.labels.fixture, "rollout");
    });
}

test("explicit config and env files retain order, project and working directory", async t => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), "compose-explicit-"));
    t.after(() => rm(cwd, { recursive: true,
        force: true }));
    await writeFile(path.join(cwd, "compose.yaml"), base);
    await writeFile(path.join(cwd, "compose.override.yaml"), override);
    await writeFile(path.join(cwd, "one.env"), "LOCAL_VALUE=first\n");
    await writeFile(path.join(cwd, "two.env"), "LOCAL_VALUE=last\n");
    const files = [ path.join(cwd, "compose.yaml") ];
    const invocation = composeExecInvocation(files[0], [ "config", "--format", "json" ], "original", files, cwd,
        [ path.join(cwd, "one.env"), path.join(cwd, "two.env") ]);
    const model = JSON.parse(run(invocation.args, invocation.cwd));
    assert.equal(model.name, "original");
    assert.equal(model.services.vpn.environment.SERVER_NAMES, "primary");
    assert.equal(model.services.vpn.environment.LOCAL, "last");
});

test("CI isolated container retains override after forced recreation", { skip: process.env.RUN_DOCKER_COMPOSE_UPDATE_TEST !== "1" }, async t => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), "compose-recreate-"));
    const project = `dockge-override-${Date.now()}`;
    const composePath = path.join(cwd, "compose.yaml");
    const invocation = (args: string[]) => composeExecInvocation(composePath, args, project);
    const command = (args: string[]) => run(invocation(args).args, cwd);
    t.after(async () => {
        try {
            command([ "down", "--remove-orphans" ]);
        } finally {
            await rm(cwd, { recursive: true,
                force: true });
        }
    });
    await writeFile(composePath, base);
    await writeFile(path.join(cwd, "compose.override.yaml"), override);
    command([ "up", "-d" ]);
    const before = command([ "ps", "-q", "vpn" ]).trim();
    command([ "pull", "vpn" ]);
    command([ "up", "-d", "--force-recreate", "--no-deps", "vpn" ]);
    const after = command([ "ps", "-q", "vpn" ]).trim();
    assert.notEqual(after, before);
    const container = JSON.parse(run([ "inspect", after ], cwd))[0];
    assert.ok(container.Config.Env.includes("SERVER_NAMES=selected"));
    assert.ok(container.Config.Labels["com.docker.compose.project.config_files"].includes("compose.override.yaml"));
});

test("process COMPOSE_FILE wins over .env and keeps explicit order without global.env", async t => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), "compose-process-"));
    const previous = process.env.COMPOSE_FILE;
    t.after(async () => {
        if (previous === undefined) {
            delete process.env.COMPOSE_FILE;
        } else {
            process.env.COMPOSE_FILE = previous;
        }
        await rm(cwd, { recursive: true,
            force: true });
    });
    await writeFile(path.join(cwd, "compose.yaml"), base);
    await writeFile(path.join(cwd, ".env"), "COMPOSE_FILE=missing.yaml\nLOCAL_VALUE=local\n");
    await writeFile(path.join(cwd, "selected.yaml"), override);
    process.env.COMPOSE_FILE = [ "compose.yaml", "selected.yaml" ].join(path.delimiter);
    const invocation = composeExecInvocation(path.join(cwd, "compose.yaml"), [ "config", "--format", "json" ]);
    const model = JSON.parse(run(invocation.args, cwd));
    assert.equal(model.services.vpn.environment.SERVER_NAMES, "selected");
    assert.equal(model.services.vpn.environment.LOCAL, "local");
});

test("missing explicit file fails instead of falling back to the base configuration", async t => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), "compose-missing-"));
    t.after(() => rm(cwd, { recursive: true,
        force: true }));
    const file = path.join(cwd, "compose.yaml");
    await writeFile(file, base);
    const invocation = composeExecInvocation(file, [ "config", "--format", "json" ], "fixture", [ file, path.join(cwd, "missing.yaml") ], cwd);
    assert.throws(() => run(invocation.args, cwd));
});

test("rollout refuses a candidate chain whose effective model differs", async t => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), "compose-guard-"));
    t.after(() => rm(cwd, { recursive: true,
        force: true }));
    await writeFile(path.join(cwd, "compose.yaml"), base);
    await assert.rejects(composePrefixWithOverride([ "compose" ], cwd, path.join(cwd, "temporary.yaml"), async args => {
        if (args.includes("--environment")) {
            return "";
        }
        return JSON.stringify({ value: args.includes("-f") ? "different" : "original" });
    }), /refusing rollout override/);
});

test("a removed native stack cannot fall back to a parent Compose project", async t => {
    const root = await mkdtemp(path.join(os.tmpdir(), "compose-removed-"));
    t.after(() => rm(root, { recursive: true,
        force: true }));
    const cwd = path.join(root, "removed");
    await mkdir(cwd);
    await writeFile(path.join(root, "compose.yaml"), base);
    const invocation = composeExecInvocation(path.join(cwd, "compose.yaml"), [ "config", "--format", "json" ]);
    assert.throws(() => run(invocation.args, invocation.cwd));
});
