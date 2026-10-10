import assert from "node:assert/strict";
import test from "node:test";
import * as fs from "node:fs/promises";

test("le statut API privilégie une opération active sur une disponibilité distante", async () => {
    const source = await fs.readFile(new URL("../routers/watcher-router.ts", import.meta.url), "utf8");
    assert.match(source, /const selfUpdateActive = manager\.isUpdateExecutionInProgress\(\)/);
    assert.match(source, /updateAvailable: selfUpdateActive \? false : checkerStatus\.updateAvailable/);
});

test("ImageWatcher ne bloque le self-update que pendant une opération Docker", async () => {
    const source = await fs.readFile(new URL("../watchers/image-watcher.ts", import.meta.url), "utf8");
    assert.match(source, /hasDockerOperationInProgress\(\)/);
    assert.match(source, /this\._updatingImages\.size > 0 \|\| \(this\.manualBatch\.running && this\.manualBatch\.current !== null\)/);
});
