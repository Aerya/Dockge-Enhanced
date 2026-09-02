import assert from "node:assert/strict";
import { test } from "node:test";
import { Stack } from "./stack";
import { DockgeServer } from "./dockge-server";
import { ValidationError } from "./util-server";

test("getStack rejects path traversal even when filesystem operations are skipped", async () => {
    const server = {
        stacksDir: "/opt/stacks",
    } as DockgeServer;

    await assert.rejects(
        () => Stack.getStack(server, "../outside", true),
        (error: unknown) => error instanceof ValidationError
    );
});

test("getStack still accepts a valid stack name when filesystem operations are skipped", async () => {
    const server = {
        stacksDir: "/opt/stacks",
    } as DockgeServer;

    const stack = await Stack.getStack(server, "valid-stack_1", true);
    assert.equal(stack.name, "valid-stack_1");
});
