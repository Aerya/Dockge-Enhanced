import assert from "node:assert/strict";
import test from "node:test";
import { resolveCurrentContainer, selectCurrentContainer } from "./current-container";

test("selects the current container from Docker's default short-ID hostname", () => {
    const current = { Id: "abc1234567890",
        Config: { Hostname: "abc123456789" } };
    assert.equal(selectCurrentContainer([ current ], "abc123456789"), current);
});

test("selects a unique container with a custom hostname", () => {
    const current = { Id: "abc1234567890",
        Config: { Hostname: "dockge-ayaneo" } };
    assert.equal(selectCurrentContainer([{ Id: "other",
        Config: { Hostname: "other" } }, current ], "dockge-ayaneo"), current);
});

test("rejects an ambiguous custom hostname", () => {
    const containers = [
        { Id: "one",
            Config: { Hostname: "dockge" } },
        { Id: "two",
            Config: { Hostname: "dockge" } },
    ];
    assert.equal(selectCurrentContainer(containers, "dockge"), null);
});

test("explicit container override takes precedence", async () => {
    const calls: string[][] = [];
    const resolved = await resolveCurrentContainer(async (args) => {
        calls.push(args);
        return JSON.stringify([{ Id: "override-id",
            Config: { Hostname: "custom" } }]);
    }, { DOCKGE_CONTAINER_ID: "dockge-agent",
        HOSTNAME: "custom" });
    assert.equal(resolved.Id, "override-id");
    assert.deepEqual(calls, [[ "container", "inspect", "dockge-agent" ]]);
});

test("falls back to unique Config.Hostname discovery", async () => {
    const runner = async (args: string[]) => {
        if (args[2] === "custom-host") {
            throw new Error("not found");
        }
        if (args[1] === "ls") {
            return "one\ntwo\n";
        }
        return JSON.stringify([
            { Id: "one",
                Config: { Hostname: "other" } },
            { Id: "two",
                Name: "/dockge-agent",
                Config: { Hostname: "custom-host" } },
        ]);
    };
    const resolved = await resolveCurrentContainer(runner, { HOSTNAME: "custom-host" });
    assert.equal(resolved.Id, "two");
    assert.equal(resolved.Name, "/dockge-agent");
});

test("does not mistake another container name for a custom hostname", async () => {
    const runner = async (args: string[]) => {
        if (args[1] === "ls") {
            return "wrong\ncurrent\n";
        }
        if (args.length === 3) {
            return JSON.stringify([{ Id: "wrong",
                Name: "/custom-host",
                Config: { Hostname: "wrong" } }]);
        }
        return JSON.stringify([
            { Id: "wrong",
                Name: "/custom-host",
                Config: { Hostname: "wrong" } },
            { Id: "current",
                Name: "/dockge-agent",
                Config: { Hostname: "custom-host" } },
        ]);
    };
    const resolved = await resolveCurrentContainer(runner, { HOSTNAME: "custom-host" });
    assert.equal(resolved.Id, "current");
});
