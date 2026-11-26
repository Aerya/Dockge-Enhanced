import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { configureSecrets } from "./store";
import { installBitwardenCLI, verifyBitwardenArchive, BITWARDEN_ASSETS } from "./bitwarden-cli";

test("tampered downloads cannot install an executable; failure releases the installer", async t => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "dockge-cli-test-"));
    configureSecrets(directory);
    t.after(() => rm(directory, { recursive: true,
        force: true }));
    t.mock.method(globalThis, "fetch", async () => new Response("not-an-official-archive"));
    await assert.rejects(installBitwardenCLI(), /stackSecrets.unavailable/);
    await assert.rejects(installBitwardenCLI(), /stackSecrets.unavailable/);
    assert.deepEqual(await readdir(directory), []);
    assert.throws(() => verifyBitwardenArchive(Buffer.from("wrong"), BITWARDEN_ASSETS.x64.sha256));
});
