import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { resolveStackPath } from "./stack";

test("résout les noms de stacks historiques sans modifier leur chemin", () => {
    const root = path.resolve("/tmp/dockge-stacks");
    for (const name of [ "demo", "demo-stack", "demo_stack", "demo.stack", "Demo1" ]) {
        assert.equal(resolveStackPath(root, name), path.join(root, name));
    }
});

test("rejette les traversées et noms interprétés comme chemins", () => {
    for (const name of [ "../secret", "stack/child", "stack\\child", ".", "..", "", "/absolute" ]) {
        assert.throws(() => resolveStackPath("/tmp/dockge-stacks", name), /Invalid stack/);
    }
});
