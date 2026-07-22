import test, { mock } from "node:test";
import assert from "node:assert/strict";
import { Settings } from "../settings";
import { StackMoveManager } from "./stack-move-manager";

test("persists a pending move until explicit finalization", async () => {
    const memory = new Map<string, unknown>();
    mock.method(Settings, "get", async (key: string) => memory.get(key));
    mock.method(Settings, "set", async (key: string, value: unknown) => { memory.set(key, value); });
    try {
        const manager = StackMoveManager.getInstance();
        const move = await manager.save({ sourceEndpoint: "",
            sourceStackName: "source",
            targetEndpoint: "agent:5001",
            targetName: "target",
            runningServices: [ "app", "db" ],
            dataTransfer: true });
        assert.equal((await manager.list("", "source")).length, 1);
        assert.deepEqual(move.runningServices, [ "app", "db" ]);
        await manager.complete(move.id, "finalized");
        assert.equal((await manager.list("", "source")).length, 0);
    } finally { mock.restoreAll(); }
});

test("rejects invalid stack names", async () => {
    await assert.rejects(StackMoveManager.getInstance().save({ sourceEndpoint: "",
        sourceStackName: "../source",
        targetEndpoint: "agent",
        targetName: "target",
        runningServices: [],
        dataTransfer: false }), /Invalid source stack/);
});
