import assert from "node:assert/strict";
import test from "node:test";
import { passwordVersionFingerprint } from "./password-hash";

test("password version fingerprints are stable and keyed", () => {
    const digest = "$2b$10$stored-bcrypt-digest";
    const first = passwordVersionFingerprint(digest, "jwt-secret-a");

    assert.equal(first, passwordVersionFingerprint(digest, "jwt-secret-a"));
    assert.notEqual(first, passwordVersionFingerprint(digest, "jwt-secret-b"));
    assert.notEqual(first, passwordVersionFingerprint(`${digest}-changed`, "jwt-secret-a"));
    assert.match(first, /^[a-f0-9]{32}$/);
});
