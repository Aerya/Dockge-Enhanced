import assert from "node:assert/strict";
import test from "node:test";
import { loadCompactInterface, saveCompactInterface } from "./interface-density";

test("classic is the default; compact is persisted per account and reversible", () => {
    const values = new Map<string, string>();
    const storage = {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => {
            values.set(key, value);
        },
    };
    assert.equal(loadCompactInterface(storage, "alice"), false);
    saveCompactInterface(storage, "alice", true);
    assert.equal(loadCompactInterface(storage, "alice"), true);
    assert.equal(loadCompactInterface(storage, "bob"), false);
    assert.equal(loadCompactInterface(storage, null), false);
    saveCompactInterface(storage, null, true);
    assert.equal(values.size, 1);
    saveCompactInterface(storage, "alice", false);
    assert.equal(loadCompactInterface(storage, "alice"), false);
    values.set("interface-density:alice", "unexpected");
    assert.equal(loadCompactInterface(storage, "alice"), false);
});

test("unavailable storage does not break the interface", () => {
    const storage = {
        getItem: () => {
            throw new Error("Storage blocked");
        },
        setItem: () => {
            throw new Error("Storage blocked");
        },
    };
    assert.equal(loadCompactInterface(storage, "alice"), false);
    assert.doesNotThrow(() => saveCompactInterface(storage, "alice", true));
});
