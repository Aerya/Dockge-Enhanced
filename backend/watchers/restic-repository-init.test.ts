import test from "node:test";
import assert from "node:assert/strict";
import { isResticRepositoryMissingError } from "./backup-manager";

test("recognises a genuinely missing config", () => {
    assert.equal(isResticRepositoryMissingError(new Error("unable to open config file: no such file or directory")), true);
    assert.equal(isResticRepositoryMissingError(new Error("repository does not exist")), true);
});

test("does not initialise on errors that might hide an existing repository", () => {
    for (const error of [
        "wrong password or no key found",
        "permission denied: unable to open config file: no such file or directory",
        "network is unreachable",
        "connection refused",
        "cannot access endpoint: timeout",
        "invalid repository configuration",
    ]) {
        assert.equal(isResticRepositoryMissingError(new Error(error)), false, error);
    }
});
