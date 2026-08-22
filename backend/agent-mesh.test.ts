import test from "node:test";
import assert from "node:assert/strict";
import { meshEndpoint, normalizeMeshPeer, normalizeMeshSelf, peersForTarget, validateMeshCatalogue, validateMeshPeers } from "./agent-mesh";
import { AGENT_TOKEN_USERNAME } from "./agent-manager";

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

test("turns a server-issued token into a federation credential", () => {
    assert.deepEqual(normalizeMeshSelf({
        url: "https://enhanced-a.example.org/",
        token: "signed-federation-token",
        displayName: "A",
    }), {
        url: "https://enhanced-a.example.org",
        username: AGENT_TOKEN_USERNAME,
        password: "signed-federation-token",
        displayName: "A",
    });
});

test("accepts an empty catalogue when an instance leaves the federation", () => {
    assert.deepEqual(validateMeshCatalogue([]), []);
});
