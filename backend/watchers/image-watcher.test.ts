import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { composeExecInvocation } from "./image-watcher";

test("construit Compose avec des arguments séparés", () => {
  const composePath = path.join("/opt/stacks", "demo", "compose file.yaml");
  assert.deepEqual(composeExecInvocation(composePath, [ "pull", "web;touch marker" ]), {
    cwd: path.join("/opt/stacks", "demo"),
    args: [ "compose", "-f", "compose file.yaml", "pull", "web;touch marker" ],
  });
});
