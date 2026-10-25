import test from "node:test";
import assert from "node:assert/strict";
import { RolloutRelay } from "./rollout-relay";
import { readFile } from "node:fs/promises";
import { relayConfig } from "../common/rollout-relay";

test("relay validates before reload and waits for the old workers without killing them", async () => {
    const calls: string[][] = [];
    let generation = 1;
    let busy = true;
    const relay = new RolloutRelay(async args => {
        calls.push(args);
        if (args.includes("cat")) {
            return relayConfig([ "old" ], 8080);
        }
        if (args[0] === "cp") {
            assert.match(await readFile(args[1], "utf8"), /server replacement:8080 resolve/);
        }
        if (args.includes("reload")) {
            generation++;
        }
        if (args.includes("ps")) {
            return generation + " nginx: worker process\n" + (generation > 1 && busy ? "1 nginx: worker process is shutting down\n" : "");
        }
        return "";
    }, "test-relay-id", 8080);
    await relay.assertReady();
    await relay.route([ "replacement" ], async () => {});
    assert.ok(calls.findIndex(args => args.includes("-t") && args.at(-1)?.endsWith(".next")) < calls.findIndex(args => args.includes("reload")));
    await assert.rejects(relay.drain([ "1" ], async () => {}, 2), /active connections/);
    busy = false;
    await relay.drain([ "1" ], async () => {}, 2);
    assert.equal(calls.some(args => args.includes("kill") || args.includes("stop")), false);
});

test("invalid relay candidate configuration never replaces the current configuration", async () => {
    const calls: string[][] = [];
    const relay = new RolloutRelay(async args => {
        calls.push(args);
        if (args.includes("ps")) {
            return "1 nginx: worker process";
        }
        if (args.includes("-t")) {
            throw new Error("invalid candidate");
        }
        return "";
    }, "test-relay-id", 8080);
    await assert.rejects(relay.route([ "replacement" ], async () => {}), /invalid candidate/);
    assert.equal(calls.some(args => args.includes("mv") || args.includes("reload")), false);
});

test("a missing reload acknowledgment is not reported as a successful switch", async () => {
    const relay = new RolloutRelay(async args => args.includes("ps") ? "1 nginx: worker process" : "", "test-relay-id", 8080);
    await assert.rejects(relay.route([ "replacement" ], async () => {}), /acknowledge/);
});
