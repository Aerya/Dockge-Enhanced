import assert from "node:assert/strict";
import test from "node:test";
import { normalizeRegistryHost } from "./registry-auth";

test("normalizes registry URLs without accepting paths as hosts", () => {
    assert.equal(normalizeRegistryHost("https://REGISTRY.example.test/team/"), "registry.example.test");
    assert.equal(normalizeRegistryHost("http://registry.example.test///"), "registry.example.test");
    assert.equal(normalizeRegistryHost("registry.example.test/team"), "registry.example.test");
});

test("normalizes Docker Hub aliases", () => {
    assert.equal(normalizeRegistryHost("docker.io"), "registry-1.docker.io");
    assert.equal(normalizeRegistryHost("index.docker.io/v1/"), "registry-1.docker.io");
});
