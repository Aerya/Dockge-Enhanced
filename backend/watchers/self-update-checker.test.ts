import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import test from "node:test";


test("same OCI build revision suppresses digest-only self-update false positives", async () => {
    const source = await fs.readFile(new URL("./self-update-checker.ts", import.meta.url), "utf8");
    assert.match(source, /const sameBuildRevision/);
    assert.match(source, /localInfo\.build\.revision === remoteInfo\.build\.revision/);
    assert.match(source, /!sameBuildRevision/);
    assert.match(source, /clearObsoleteFailureState/);
});
