import assert from "node:assert/strict";
import test from "node:test";
import { parse } from "yaml";
import {
    applyPlugNPiNLabelsToCompose,
    PlugNPiNSequenceLabelsError,
} from "./plugnpin-labels";

const labels = {
    "plugNPiN.ip": "192.168.0.10:8080",
    "plugNPiN.url": "service.home",
};

test("adds mapping labels without changing unrelated Compose values", () => {
    const input = [
        "# keep this comment",
        "services:",
        "  app:",
        "    image: nginx:latest",
        "    environment:",
        "      EXISTING: value",
        "    labels:",
        "      existing.label: kept",
        "",
    ].join("\n");
    const output = applyPlugNPiNLabelsToCompose(input, "app", labels);
    const parsed = parse(output);

    assert.match(output, /# keep this comment/);
    assert.equal(parsed.services.app.image, "nginx:latest");
    assert.equal(parsed.services.app.environment.EXISTING, "value");
    assert.equal(parsed.services.app.labels["existing.label"], "kept");
    assert.equal(parsed.services.app.labels["plugNPiN.ip"], "192.168.0.10:8080");
    assert.equal(parsed.services.app.labels["plugNPiN.url"], "service.home");
});

test("refuses list-form labels instead of rewriting them", () => {
    const input = [
        "services:",
        "  app:",
        "    image: nginx:latest",
        "    labels:",
        "      - existing.label=kept",
        "",
    ].join("\n");

    assert.throws(
        () => applyPlugNPiNLabelsToCompose(input, "app", labels),
        PlugNPiNSequenceLabelsError,
    );
});

test("refuses an unknown service", () => {
    assert.throws(
        () => applyPlugNPiNLabelsToCompose("services:\n  app:\n    image: nginx\n", "missing", labels),
        /does not exist/,
    );
});
