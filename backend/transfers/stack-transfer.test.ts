import test from "node:test";
import assert from "node:assert/strict";
import yaml from "yaml";
import { applyStackTransferMappings, StackTransferMount, suggestTargetSource } from "./stack-transfer";

function mount(overrides: Partial<StackTransferMount> = {}): StackTransferMount {
    return {
        id: "0-app-/data",
        service: "app",
        type: "bind",
        source: "/srv/apps/demo/data",
        target: "/data",
        readOnly: false,
        external: false,
        size: null,
        targetSource: "/mnt/apps/demo/data",
        confidence: "high",
        reason: "path-rule",
        ...overrides,
    };
}

test("uses the longest matching path rule", () => {
    assert.deepEqual(suggestTargetSource({ type: "bind",
        source: "/srv/apps/demo/data" }, [
        { sourcePrefix: "/srv",
            targetPrefix: "/storage" },
        { sourcePrefix: "/srv/apps",
            targetPrefix: "/mnt/apps" },
    ]), {
        targetSource: "/mnt/apps/demo/data",
        confidence: "high",
        reason: "path-rule",
    });
});

test("requires manual review for an unmapped absolute bind", () => {
    assert.equal(suggestTargetSource({ type: "bind",
        source: "/unknown/data" }, []).confidence, "manual");
});

test("supports a root path mapping rule", () => {
    assert.equal(suggestTargetSource({ type: "bind",
        source: "/srv/app/data" }, [{
        sourcePrefix: "/",
        targetPrefix: "/mnt/host",
    }]).targetSource, "/mnt/host/srv/app/data");
});

test("adds bind overrides without replacing existing override settings", () => {
    const result = yaml.parse(applyStackTransferMappings("services:\n  app:\n    environment:\n      MODE: prod\n", [ mount() ]));
    assert.equal(result.services.app.environment.MODE, "prod");
    assert.deepEqual(result.services.app.volumes, [ "/mnt/apps/demo/data:/data" ]);
});

test("maps a custom named volume to an explicit Docker volume name", () => {
    const result = yaml.parse(applyStackTransferMappings("", [ mount({
        type: "volume",
        source: "database",
        targetSource: "restored_database",
    }) ]));
    assert.deepEqual(result.services.app.volumes, [ "dockge_transfer_0:/data" ]);
    assert.equal(result.volumes.dockge_transfer_0.name, "restored_database");
});

test("preserves external volume semantics when its Docker name is remapped", () => {
    const result = yaml.parse(applyStackTransferMappings("", [ mount({
        type: "volume",
        source: "database",
        targetSource: "shared_database",
        external: true,
    }) ]));
    assert.deepEqual(result.volumes.dockge_transfer_0, {
        name: "shared_database",
        external: true,
    });
});

test("keeps the original override byte-for-byte when no mapping changes", () => {
    const original = "# keep this comment\nservices: {}\n";
    assert.equal(applyStackTransferMappings(original, [ mount({ targetSource: "/srv/apps/demo/data" }) ]), original);
});
