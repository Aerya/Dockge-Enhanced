import test from "node:test";
import assert from "node:assert/strict";
import { meshEndpoint, normalizeMeshPeer, peersForTarget, validateMeshPeers } from "./agent-mesh";

const peers = [
    { url: "http://enhanced-a:5001",
        username: "admin",
        password: "secret-a",
        displayName: "A" },
    { url: "http://enhanced-b:5001/",
        username: "admin",
        password: "secret-b",
        displayName: "B" },
    { url: "http://enhanced-c:5001",
        username: "admin",
        password: "secret-c",
        displayName: "C" },
];

test("normalizes URLs and preserves credentials", () => {
    assert.deepEqual(normalizeMeshPeer(peers[1]), { ...peers[1],
        url: "http://enhanced-b:5001" });
});

test("rejects duplicate endpoints", () => {
    assert.throws(() => validateMeshPeers([
        peers[0],
        { ...peers[0],
            url: "http://enhanced-a:5001/" },
    ]), /Duplicate mesh endpoint/);
});

test("builds a target-specific catalogue without the target itself", () => {
    const validated = validateMeshPeers(peers);
    assert.deepEqual(peersForTarget(validated, "enhanced-b:5001").map(meshEndpoint), [
        "enhanced-a:5001",
        "enhanced-c:5001",
    ]);
});

test("supports a two-instance mesh", () => {
    const validated = validateMeshPeers(peers.slice(0, 2));
    assert.deepEqual(peersForTarget(validated, "enhanced-a:5001").map(meshEndpoint), [ "enhanced-b:5001" ]);
});

test("rejects non-HTTP peer URLs", () => {
    assert.throws(() => normalizeMeshPeer({ ...peers[0],
        url: "file:///tmp/enhanced" }), /HTTP or HTTPS/);
});
