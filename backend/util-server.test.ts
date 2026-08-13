import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileExists } from "./util-server";

test("vérifie un chemin sans interprétation par un shell", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "dockge-file-exists-"));
    const marker = path.join(tempDir, "marker");
    const hostilePath = path.join(tempDir, "file;touch marker");

    try {
        await fs.writeFile(hostilePath, "test");

        assert.equal(await fileExists(hostilePath), true);
        assert.equal(await fileExists(path.join(tempDir, "absent")), false);
        assert.equal(await fileExists(marker), false);
    } finally {
        await fs.rm(tempDir, { recursive: true, force: true });
    }
});
