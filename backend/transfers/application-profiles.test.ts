import test from "node:test";
import assert from "node:assert/strict";
import { APPLICATION_PROFILES, getApplicationProfile } from "./application-profiles";

test("exposes database consistency profiles without hiding their commands", () => {
    assert.deepEqual(APPLICATION_PROFILES.map(item => item.id), [ "postgresql", "mysql", "redis", "sqlite" ]);
    assert.match(getApplicationProfile("postgresql")!.preHook, /pg_dumpall/);
    assert.match(getApplicationProfile("sqlite")!.preHook, /wal_checkpoint/);
});

test("keeps custom hooks opt-in and rejects unknown profiles", () => {
    assert.equal(getApplicationProfile("custom"), undefined);
    assert.throws(() => getApplicationProfile("oracle"), /Unknown application profile/);
});
