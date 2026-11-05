import assert from "node:assert/strict";
import test from "node:test";
import { networkRepairTargets, NetworkRepairRead } from "./compose-network-repair";
import { parseResolvedComposeModel } from "./compose-network-namespace";
import { LABEL_NETWORK_REPAIR, setComposeLabel } from "../common/compose-labels";

const oldId = "a".repeat(64);
const newId = "b".repeat(64);
function fixture(options: { enabled?: boolean;
    running?: boolean;
    current?: string;
    missing?: boolean;
    modeOnly?: boolean;
    consumerRunning?: boolean } = {}) {
    const model = parseResolvedComposeModel(JSON.stringify({ services: {
        app: { labels: { [LABEL_NETWORK_REPAIR]: options.enabled !== false ? "true" : "false" },
            networks: { external: {} } },
        consumer: { network_mode: "service:app" },
        other: {},
    },
    networks: { external: { name: "fixture-network" } } }));
    const calls: string[][] = [];
    const read: NetworkRepairRead = async args => {
        calls.push(args);
        if (args[0] === "network") {
            return options.missing ? "" : JSON.stringify({ ID: options.current || newId,
                Name: "fixture-network" });
        }
        if (args[0] === "ps") {
            return (args.at(-1) === "consumer" ? "c" : "d").repeat(64);
        }
        return JSON.stringify({ running: args.at(-1)?.startsWith("c") ? !!options.consumerRunning : !!options.running,
            mode: oldId,
            networks: { "fixture-network": { NetworkID: options.modeOnly ? "" : oldId } } });
    };
    return { model,
        read,
        calls };
}

test("disabled by default: no Docker inspections and no recreation", async () => {
    const f = fixture({ enabled: false });
    assert.deepEqual(await networkRepairTargets(f.model, [ "app" ], f.read), []);
    delete f.model.services.app.labels;
    assert.deepEqual(await networkRepairTargets(f.model, [ "app" ], f.read), []);
    assert.equal(f.calls.length, 0);
});

test("changed network ID targets only opted-in service and namespace consumers", async () => {
    for (const modeOnly of [ false, true ]) {
        const f = fixture({ modeOnly });
        assert.deepEqual(await networkRepairTargets(f.model, [ "app", "other" ], f.read), [ "app", "consumer" ]);
        assert.equal(f.calls.filter(args => args[0] === "network").length, 1);
        assert.equal(f.calls.some(args => args.at(-1) === "other"), false);
    }
});

test("valid network and running containers are left alone", async () => {
    for (const options of [{ current: oldId }, { running: true }]) {
        const f = fixture(options);
        assert.deepEqual(await networkRepairTargets(f.model, [ "app" ], f.read), []);
    }
});

test("missing replacement network, inspection failure and running replica/dependant fail closed", async () => {
    for (const options of [{ missing: true }, { consumerRunning: true }]) {
        const f = fixture(options);
        await assert.rejects(networkRepairTargets(f.model, [ "app" ], f.read), /repair/);
    }
    const f = fixture();
    await assert.rejects(networkRepairTargets(f.model, [ "app" ], async () => {
        throw new Error("Docker unavailable");
    }), /Docker unavailable/);
    delete f.model.networks;
    await assert.rejects(networkRepairTargets(f.model, [ "app" ], f.read), /no longer configured/);
});

test("no existing container needs repair", async () => {
    const f = fixture();
    assert.deepEqual(await networkRepairTargets(f.model, [ "app" ], async (args, compose) => compose ? "" : f.read(args, compose)), []);
});

test("option preserves map/list labels and is removable", () => {
    for (const labels of [{ existing: "value" }, [ "existing=value" ]]) {
        const service: Record<string, unknown> = { labels: structuredClone(labels) };
        setComposeLabel(service, LABEL_NETWORK_REPAIR, "true");
        setComposeLabel(service, LABEL_NETWORK_REPAIR, null);
        assert.deepEqual(service.labels, labels);
    }
});
