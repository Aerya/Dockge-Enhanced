import test from "node:test";
import assert from "node:assert/strict";
import { buildAppriseEndpoint } from "./apprise";

test("construit un endpoint Apprise HTTP explicite", () => {
    assert.equal(buildAppriseEndpoint("http://apprise:8000"), "http://apprise:8000/notify/");
    assert.equal(buildAppriseEndpoint("http://192.168.0.20:8000"), "http://192.168.0.20:8000/notify/");
    assert.equal(buildAppriseEndpoint("https://notify.example.test/base/"), "https://notify.example.test/base/notify/");
});

test("rejette les variantes d’URL Apprise ambiguës", () => {
    assert.throws(() => buildAppriseEndpoint("file:///etc/passwd"), /invalide/);
    assert.throws(() => buildAppriseEndpoint("https://user:secret@example.test"), /invalide/);
    assert.throws(() => buildAppriseEndpoint("https://example.test?next=http://127.0.0.1"), /invalide/);
    assert.equal(buildAppriseEndpoint("https://example.test/%2e%2e/admin"), "https://example.test/admin/notify/");
    assert.throws(() => buildAppriseEndpoint("https://-bad.example/path"), /invalide/);
});
