import assert from "node:assert/strict";
import test from "node:test";
import { getManagedStackNameFromConfigFiles } from "./stack";

test("maps a dotted Compose project back to its managed stack directory", () => {
    assert.equal(
        getManagedStackNameFromConfigFiles(
            "/opt/stacks/dashboard.example.com/compose.yml",
            "/opt/stacks"
        ),
        "dashboard.example.com"
    );
});

test("preserves uppercase characters from the managed stack directory", () => {
    assert.equal(
        getManagedStackNameFromConfigFiles(
            "/opt/stacks/My.Stack/compose.yaml",
            "/opt/stacks"
        ),
        "My.Stack"
    );
});

test("handles multiple ConfigFiles", () => {
    assert.equal(
        getManagedStackNameFromConfigFiles(
            "/opt/stacks/example.stack/compose.yaml,/opt/stacks/example.stack/compose.override.yaml",
            "/opt/stacks"
        ),
        "example.stack"
    );
});

test("does not claim an external Compose project", () => {
    assert.equal(
        getManagedStackNameFromConfigFiles(
            "/srv/external-app/compose.yml",
            "/opt/stacks"
        ),
        null
    );
});

test("does not claim nested directories", () => {
    assert.equal(
        getManagedStackNameFromConfigFiles(
            "/opt/stacks/group/example/compose.yml",
            "/opt/stacks"
        ),
        null
    );
});

test("ignores unknown config filenames", () => {
    assert.equal(
        getManagedStackNameFromConfigFiles(
            "/opt/stacks/example/custom-compose.yml",
            "/opt/stacks"
        ),
        null
    );
});

test("handles missing ConfigFiles safely", () => {
    assert.equal(getManagedStackNameFromConfigFiles(undefined, "/opt/stacks"), null);
    assert.equal(getManagedStackNameFromConfigFiles("", "/opt/stacks"), null);
});
