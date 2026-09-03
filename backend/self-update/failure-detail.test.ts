import assert from "node:assert/strict";
import test from "node:test";
import { classifySelfUpdateFailure } from "./failure-detail";

test("classe un timeout GHCR même avec une URL signée très longue", () => {
    const raw = [
        "Command failed: docker image pull ghcr.io/aerya/dockge-enhanced@sha256:abc",
        "failed to copy: httpReadSeeker: failed open: failed to do request:",
        'Get "https://pkg-containers.githubusercontent.com/ghcrblobs11/blobs/sha256:deadbeef?se=2026-09-02T23%3A20%3A00Z&sig=very-long-signed-query":',
        "net/http: timeout awaiting response headers",
    ].join("\n");

    assert.equal(classifySelfUpdateFailure(raw), "network-timeout");
});

test("classe les principaux échecs de registre", () => {
    assert.equal(classifySelfUpdateFailure("unauthorized: authentication required"), "registry-auth");
    assert.equal(classifySelfUpdateFailure("denied: requested access to the resource is denied"), "registry-forbidden");
    assert.equal(classifySelfUpdateFailure("manifest unknown: manifest unknown"), "image-not-found");
});

test("classe les erreurs DNS", () => {
    assert.equal(classifySelfUpdateFailure("dial tcp: lookup ghcr.io: no such host"), "dns");
});

test("conserve un fallback générique", () => {
    assert.equal(classifySelfUpdateFailure("unexpected docker failure"), "generic");
});
