import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { CommandRunner, measureVolumeSource } from "./volume-usage";

describe("volume usage measurement", () => {
    test("limits the helper and keeps the scan on one filesystem", async () => {
        const calls: Array<{ file: string; args: string[]; timeout: number }> = [];
        const runner: CommandRunner = async (file, args, options) => {
            calls.push({
                file,
                args,
                timeout: options.timeout
            });
            if (args[0] === "run") {
                return { stdout: "12345\t/mnt\n" };
            }
            throw new Error("already removed");
        };

        const result = await measureVolumeSource("/srv/app", {
            commandRunner: runner,
            helperName: "dockge-volume-test",
            timeoutMs: 5_000,
        });

        assert.deepEqual(result, { size: 12345 });
        assert.deepEqual(calls[0], {
            file: "docker",
            args: [
                "run", "--rm", "--name", "dockge-volume-test",
                "--network", "none", "--read-only",
                "--cpus", "0.50", "--memory", "128m", "--pids-limit", "32",
                "-v", "/srv/app:/mnt:ro",
                "busybox:stable", "du", "-sbx", "/mnt",
            ],
            timeout: 5_000,
        });
        assert.deepEqual(calls[1].args, [ "rm", "-f", "dockge-volume-test" ]);
    });

    test("force-removes the helper after a timeout or failure", async () => {
        const calls: string[][] = [];
        const runner: CommandRunner = async (_file, args) => {
            calls.push(args);
            if (args[0] === "run") {
                throw new Error("timed out");
            }
            return { stdout: "" };
        };

        const result = await measureVolumeSource("/mnt", {
            commandRunner: runner,
            helperName: "dockge-volume-timeout",
        });

        assert.equal(result.size, null);
        assert.match(result.error ?? "", /timed out/);
        assert.deepEqual(calls.at(-1), [ "rm", "-f", "dockge-volume-timeout" ]);
    });
});
