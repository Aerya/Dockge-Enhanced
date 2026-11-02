import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { inspectStackVolumes, runVolumeCommand, VOLUME_INSPECT_BATCH_SIZE, VOLUME_INSPECT_FORMAT } from "./stack-volume-inspection";
import { log } from "./log";

const id = (index: number) => index.toString(16).padStart(64, "0");
const row = (containerId: string) => ({
    Id: containerId,
    Name: "/example-1",
    Service: "example",
    State: "running",
    Mounts: [{ Type: "bind",
        Source: "/path with spaces/é",
        Destination: "/data" }, { Type: "volume",
        Name: "named",
        Source: "/volumes/named",
        Destination: "/cache" }],
});

test("empty stack does not inspect anything", async () => {
    let calls = 0;
    assert.deepEqual(await inspectStackVolumes([ "compose", "ps", "-aq" ], "/tmp", async () => {
        calls++;
        return "\n";
    }), []);
    assert.equal(calls, 1);
});

test("large stack uses sequential bounded batches and preserves mounts and replicas", async () => {
    const ids = Array.from({ length: 65 }, (_, index) => id(index + 1));
    let active = 0;
    const sizes: number[] = [];
    const result = await inspectStackVolumes([ "compose", "-f", "override.yaml", "ps", "-aq" ], "/stack", async (args, cwd) => {
        assert.equal(cwd, "/stack");
        if (args[0] === "compose") {
            return ids.join("\r\n") + "\r\n" + ids[0];
        }
        assert.equal(active++, 0);
        await new Promise(resolve => setImmediate(resolve));
        assert.deepEqual(args.slice(0, 3), [ "inspect", "--format", VOLUME_INSPECT_FORMAT ]);
        const batch = args.slice(3);
        assert.ok(batch.length <= VOLUME_INSPECT_BATCH_SIZE);
        sizes.push(batch.length);
        active--;
        return batch.map(containerId => JSON.stringify(row(containerId))).join("\n");
    });
    assert.deepEqual(sizes, [ 16, 16, 16, 16, 1 ]);
    assert.deepEqual(result, ids.map(row));
});

test("unlabelled and stopped containers remain visible", async () => {
    const container = { ...row(id(1)),
        Service: null,
        State: "exited",
        Mounts: [] };
    const result = await inspectStackVolumes([ "compose" ], "/tmp", async args => args[0] === "compose" ? id(1) : JSON.stringify(container));
    assert.deepEqual(result, [ container ]);
});

test("invalid IDs never become Docker arguments", async () => {
    let calls = 0;
    await assert.rejects(inspectStackVolumes([ "compose" ], "/tmp", async () => {
        calls++;
        return "--all";
    }), /invalid container IDs/);
    assert.equal(calls, 1);
});

test("invalid JSON, fields and incomplete output produce safe contextual errors", async t => {
    const messages: string[] = [];
    t.mock.method(log, "warn", (_module: string, message: string) => messages.push(message));
    for (const output of [ "SECRET=private", "", JSON.stringify({ ...row(id(1)),
        Mounts: [{ Source: 42 }] }) ]) {
        await assert.rejects(inspectStackVolumes([ "compose" ], "/tmp", async args => args[0] === "compose" ? id(1) : output), /docker inspect mounts, batch 1.*invalid or incomplete/);
    }
    assert.equal(messages.length, 3);
    assert.ok(messages.every(message => !message.includes("SECRET")));
});

test("failed later batch is not silently returned as a complete stack", async () => {
    const ids = Array.from({ length: 17 }, (_, index) => id(index + 1));
    await assert.rejects(inspectStackVolumes([ "compose" ], "/tmp", async args => {
        if (args[0] === "compose") {
            return ids.join("\n");
        }
        if (args.at(-1) === ids[16]) {
            throw new Error("inspect failed");
        }
        return args.slice(3).map(containerId => JSON.stringify(row(containerId))).join("\n");
    }), /inspect failed/);
});

test("real subprocess accepts more than 200 KiB, enforces bounded output and hides stderr secrets", async t => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "dockge-volume-buffer-"));
    const oldPath = process.env.PATH;
    const messages: string[] = [];
    t.mock.method(log, "warn", (_module: string, message: string) => messages.push(message));
    try {
        const fixture = { ...row(id(1)),
            Mounts: Array.from({ length: 3000 }, (_, index) => ({ Type: "bind",
                Source: `/fixture/source-${index}`,
                Destination: `/fixture/target-${index}` })) };
        const json = JSON.stringify(fixture);
        assert.ok(Buffer.byteLength(json) > 200 * 1024);
        await writeFile(path.join(dir, "fixture.json"), json);
        await writeFile(path.join(dir, "docker"), `#!${process.execPath}\nconst fs=require('node:fs');const action=process.argv[2];if(action==='compose'){process.stdout.write('${id(1)}');}else if(action==='inspect'){process.stdout.write(fs.readFileSync('fixture.json'));}else{const n=Number(action);if(n<0){process.stderr.write('SECRET=private');process.exitCode=1;}else{process.stdout.write('x'.repeat(n));}}\n`, { mode: 0o700 });
        process.env.PATH = `${dir}${path.delimiter}${oldPath ?? ""}`;
        assert.deepEqual(await inspectStackVolumes([ "compose", "ps", "-aq" ], dir), [ fixture ]);
        assert.equal((await runVolumeCommand([ "300000" ], dir, "compose ps -aq")).length, 300000);
        await assert.rejects(runVolumeCommand([ "4194305" ], dir, "docker inspect mounts"), /docker inspect mounts.*exceeds 4 MiB/);
        await assert.rejects(runVolumeCommand([ "-1" ], dir, "compose ps -aq"), error => {
            assert.ok(error instanceof Error);
            assert.match(error.message, /compose ps -aq.*failed.*exit 1/);
            assert.ok(!JSON.stringify(error).includes("SECRET"));
            return true;
        });
        assert.equal(messages.length, 2);
        assert.ok(messages.every(message => !message.includes("SECRET") && !message.includes(dir)));
    } finally {
        if (oldPath === undefined) {
            delete process.env.PATH;
        } else {
            process.env.PATH = oldPath;
        }
        await rm(dir, { recursive: true,
            force: true });
    }
});
