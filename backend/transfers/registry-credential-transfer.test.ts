import test, { mock } from "node:test";
import assert from "node:assert/strict";
import { ImageWatcher, RegistryCredential } from "../watchers/image-watcher";
import {
    createRegistryCredentialTransferKey,
    exportRegistryCredentialEnvelope,
    importRegistryCredentialEnvelope,
} from "./registry-credential-transfer";

test("transfers only an encrypted registry credential through a one-use envelope", async () => {
    const credential: RegistryCredential = { registry: "ghcr.io",
        username: "example",
        token: "secret-read-packages-token" };
    let imported: RegistryCredential | undefined;
    mock.method(ImageWatcher, "getInstance", () => ({
        getRegistryCredential: () => credential,
        importRegistryCredential: async (value: RegistryCredential) => {
            imported = value;
        },
    } as unknown as ImageWatcher));
    try {
        const key = createRegistryCredentialTransferKey();
        const envelope = exportRegistryCredentialEnvelope("ghcr.io", key);
        assert.equal(JSON.stringify(envelope).includes(credential.token), false);
        assert.equal(await importRegistryCredentialEnvelope(envelope), "ghcr.io");
        assert.deepEqual(imported, credential);
        await assert.rejects(importRegistryCredentialEnvelope(envelope), /invalid or expired/);
    } finally {
        mock.restoreAll();
    }
});

test("rejects a modified encrypted registry credential", async () => {
    const credential: RegistryCredential = { registry: "ghcr.io",
        username: "example",
        token: "secret-read-packages-token" };
    mock.method(ImageWatcher, "getInstance", () => ({
        getRegistryCredential: () => credential,
        importRegistryCredential: async () => {},
    } as unknown as ImageWatcher));
    try {
        const key = createRegistryCredentialTransferKey();
        const envelope = exportRegistryCredentialEnvelope("ghcr.io", key);
        envelope.ciphertext = `${envelope.ciphertext.slice(0, -2)}AA`;
        await assert.rejects(importRegistryCredentialEnvelope(envelope), /could not be decrypted/);
    } finally {
        mock.restoreAll();
    }
});
