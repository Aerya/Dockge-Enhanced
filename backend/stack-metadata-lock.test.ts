import test from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { withStackMetadataWriteLock } from "./stack-metadata-lock";

test("les écritures concurrentes de métadonnées sont sérialisées", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "dockge-meta-lock-"));
    const metadataPath = path.join(root, ".dockge-meta.json");
    await fs.writeFile(metadataPath, JSON.stringify({ note: "initial" }));

    const update = (fields: Record<string, string>) => withStackMetadataWriteLock(metadataPath, async () => {
        const current = JSON.parse(await fs.readFile(metadataPath, "utf8")) as Record<string, string>;
        await new Promise(resolve => setTimeout(resolve, 5));
        await fs.writeFile(metadataPath, JSON.stringify({ ...current,
            ...fields }));
    });

    await Promise.all([
        update({ note: "kept" }),
        update({ lastUpdated: "2026-10-10T12:00:00.000Z" }),
    ]);
    assert.deepEqual(JSON.parse(await fs.readFile(metadataPath, "utf8")), {
        note: "kept",
        lastUpdated: "2026-10-10T12:00:00.000Z",
    });
    await fs.rm(root, { recursive: true,
        force: true });
});
