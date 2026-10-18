import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { mkdtemp, readFile, rm, stat, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import knex from "knex";
// @ts-ignore Knex's custom SQLite driver is also used by Database.
import Dialect from "knex/lib/dialects/sqlite3/index.js";
import sqlite from "@louislam/sqlite3";
import { up } from "./migrations/2026-10-18-0001-two-factor-authentication";
import { createLoginChallenge, interactiveSessionVersionMatches, matchingTotpCounter, totpFor, TwoFactorAuth, validLoginChallenge } from "./two-factor-auth";

Dialect.prototype._driver = () => sqlite;
const referenceSecret = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";
for (const [ seconds, expected ] of [[ 59, "287082" ], [ 1111111109, "081804" ], [ 1111111111, "050471" ], [ 1234567890, "005924" ], [ 2000000000, "279037" ], [ 20000000000, "353130" ]] as const) {
    test(`RFC 6238 SHA1 six-digit vector at ${seconds}`, () => {
        assert.equal(totpFor(referenceSecret).generate({ timestamp: seconds * 1000 }), expected);
        assert.equal(matchingTotpCounter(referenceSecret, expected, seconds * 1000), Math.floor(seconds / 30));
    });
}
test("TOTP accepts only a bounded clock window and six digits", () => {
    const now = 1_800_000_000_000;
    for (const offset of [ -30_000, 0, 30_000 ]) {
        assert.notEqual(matchingTotpCounter(referenceSecret, totpFor(referenceSecret).generate({ timestamp: now + offset }), now), null);
    }
    assert.equal(matchingTotpCounter(referenceSecret, totpFor(referenceSecret).generate({ timestamp: now - 60_000 }), now), null);
    for (const invalid of [ null, 123456, "12345", "1234567", "abcdef" ]) {
        assert.equal(matchingTotpCounter(referenceSecret, invalid, now), null);
    }
});

async function fixture(t: TestContext) {
    const directory = await mkdtemp(path.join(tmpdir(), "dockge-totp-"));
    const db = knex({ client: Dialect,
        connection: { filename: path.join(directory, "test.db") },
        useNullAsDefault: true });
    t.after(async () => {
        await db.destroy();
        await rm(directory, { recursive: true,
            force: true });
    });
    await db.schema.createTable("user", table => {
        table.increments("id");
        table.string("username");
        table.string("password");
        table.integer("active").defaultTo(1);
        table.boolean("twofa_status").defaultTo(false);
        table.string("twofa_secret");
        table.string("twofa_last_token");
    });
    await db("user").insert({ username: "fixture",
        password: "fixture-hash" });
    await up(db);
    let now = 1_800_000_000_000;
    const service = new TwoFactorAuth(db, directory, () => now);
    const enroll = async () => {
        const uri = await service.prepare(1, "session");
        const secret = new URL(uri).searchParams.get("secret")!;
        const code = totpFor(secret).generate({ timestamp: now });
        const recovery = await service.enable(1, "session", code);
        return { secret,
            code,
            recovery };
    };
    return { directory,
        db,
        service,
        enroll,
        clock: () => now,
        advance: (ms = 30_000) => {
            now += ms;
        },
        code: (secret: string) => totpFor(secret).generate({ timestamp: now }) };
}

test("a lost encryption key is not recreated by enrollment of another account", async t => {
    const f = await fixture(t);
    await f.enroll();
    await unlink(path.join(f.directory, "two-factor.key"));
    await f.db("user").insert({ username: "second",
        password: "second-hash" });
    const uri = await f.service.prepare(2, "second");
    const secret = new URL(uri).searchParams.get("secret")!;
    await assert.rejects(f.service.enable(2, "second", f.code(secret)), /keyUnavailable/);
    await assert.rejects(stat(path.join(f.directory, "two-factor.key")), { code: "ENOENT" });
    assert.equal((await f.service.status(1)).enabled, true);
    assert.equal((await f.service.status(2)).enabled, false);
});

test("migration preserves the account; enrollment is temporary, verified and encrypted", async t => {
    const f = await fixture(t);
    const uri = await f.service.prepare(1, "session");
    const secret = new URL(uri).searchParams.get("secret")!;
    assert.deepEqual(await f.service.status(1), { enabled: false,
        recoveryRemaining: 0 });
    await assert.rejects(f.service.enable(1, "other-session", f.code(secret)), /setupExpired/);
    await assert.rejects(f.service.enable(1, "session", "invalid"), /invalidCode/);
    const recovery = await f.service.enable(1, "session", f.code(secret));
    assert.equal(recovery.length, 10);
    const user = await f.db("user").first();
    assert.equal(user.password, "fixture-hash");
    assert.equal(user.username, "fixture");
    assert.equal(user.twofa_secret, null);
    assert.ok(user.twofa_secret_encrypted.startsWith("v1."));
    assert.ok(!JSON.stringify(user).includes(secret));
    assert.ok(recovery.every(code => !JSON.stringify(user).includes(code)));
    assert.equal((await stat(path.join(f.directory, "two-factor.key"))).mode & 0o777, 0o600);
    assert.equal(user.twofa_version, 1);
    await assert.rejects(f.service.verify(1, f.code(secret)), /invalidCode/);
    f.advance();
    await f.service.verify(1, f.code(secret));
});
test("expired enrollment and account changes cannot activate 2FA", async t => {
    const f = await fixture(t);
    let uri = await f.service.prepare(1, "session");
    f.advance(600_001);
    await assert.rejects(f.service.enable(1, "session", f.code(new URL(uri).searchParams.get("secret")!)), /setupExpired/);
    uri = await f.service.prepare(1, "session");
    await f.db("user").where({ id: 1 }).update({ password: "changed" });
    await assert.rejects(f.service.enable(1, "session", f.code(new URL(uri).searchParams.get("secret")!)), /setupExpired/);
    assert.equal((await f.service.status(1)).enabled, false);
});
test("concurrent TOTP and recovery-code attempts each allow exactly one success", async t => {
    const f = await fixture(t);
    const { secret, recovery } = await f.enroll();
    f.advance();
    for (const code of [ f.code(secret), recovery[0] ]) {
        const attempts = await Promise.allSettled([ f.service.verify(1, code), f.service.verify(1, code) ]);
        assert.equal(attempts.filter(result => result.status === "fulfilled").length, 1);
        await assert.rejects(f.service.verify(1, code), /invalidCode/);
    }
    assert.equal((await f.service.status(1)).recoveryRemaining, 9);
});
test("regeneration revokes old recovery codes; disabling requires a valid second factor", async t => {
    const f = await fixture(t);
    const { recovery } = await f.enroll();
    await assert.rejects(f.service.disable(1, "invalid"), /invalidCode/);
    const replacement = await f.service.regenerate(1, recovery[0]);
    await assert.rejects(f.service.verify(1, recovery[1]), /invalidCode/);
    assert.equal((await f.db("user").first()).twofa_version, 2);
    await f.service.disable(1, replacement[0]);
    assert.deepEqual(await f.service.status(1), { enabled: false,
        recoveryRemaining: 0 });
    const user = await f.db("user").first();
    assert.equal(user.twofa_secret_encrypted, null);
    assert.equal(user.twofa_version, 3);
});
test("password and security-version changes invalidate a previously authenticated operation", async t => {
    const f = await fixture(t);
    const { recovery } = await f.enroll();
    const credentials = { passwordHash: "fixture-hash",
        version: 1 };
    await f.db("user").where({ id: 1 }).update({ password: "new-hash" });
    await assert.rejects(f.service.verify(1, recovery[0], credentials), /restartLogin/);
    await assert.rejects(f.service.disable(1, recovery[0], credentials), /restartLogin/);
    await assert.rejects(f.service.regenerate(1, recovery[0], credentials), /restartLogin/);
    assert.equal((await f.service.status(1)).recoveryRemaining, 10);
    await f.db("user").where({ id: 1 }).update({ password: "fixture-hash",
        twofa_version: 2 });
    await assert.rejects(f.service.verify(1, recovery[0], credentials), /restartLogin/);
    await f.service.verify(1, recovery[0], { ...credentials,
        version: 2 });
});
test("missing encryption key fails closed without recreating it; recovery still works", async t => {
    const f = await fixture(t);
    const { secret, recovery } = await f.enroll();
    await unlink(path.join(f.directory, "two-factor.key"));
    f.advance();
    await assert.rejects(f.service.verify(1, f.code(secret)), /keyUnavailable/);
    await assert.rejects(readFile(path.join(f.directory, "two-factor.key")), { code: "ENOENT" });
    await f.service.disable(1, recovery[0]);
});
test("tampered encrypted secrets fail closed and survive service restarts", async t => {
    const f = await fixture(t);
    const { secret } = await f.enroll();
    f.advance();
    await new TwoFactorAuth(f.db, f.directory, f.clock).verify(1, f.code(secret));
    await writeFile(path.join(f.directory, "two-factor.key"), Buffer.alloc(32));
    await assert.rejects(f.service.verify(1, f.code(secret)), /keyUnavailable/);
});
test("interactive sessions are version-bound, including legacy tokens", () => {
    assert.equal(interactiveSessionVersionMatches({}, {}), true);
    assert.equal(interactiveSessionVersionMatches({}, { twofa_version: 1 }), false);
    assert.equal(interactiveSessionVersionMatches({ twoFaVersion: 1 }, { twofa_version: 1 }), true);
    assert.equal(interactiveSessionVersionMatches({ twoFaVersion: "1" }, { twofa_version: 1 }), false);
});
test("second-step captcha challenges are credential-bound, expiring and safe for malformed input", () => {
    const challenge = createLoginChallenge("fixture", "password", "test-secret", 1000);
    assert.equal(validLoginChallenge(challenge, challenge.id, "fixture", "password", "test-secret", 2000), true);
    assert.equal(validLoginChallenge(challenge, challenge.id, "fixture", "wrong", "test-secret", 2000), false);
    assert.equal(validLoginChallenge(challenge, challenge.id, "other", "password", "test-secret", 2000), false);
    assert.equal(validLoginChallenge(challenge, challenge.id, "fixture", "password", "test-secret", 301001), false);
    assert.equal(validLoginChallenge(challenge, "é".repeat(challenge.id.length), "fixture", "password", "test-secret", 2000), false);
    assert.equal(validLoginChallenge(null, challenge.id, "fixture", "password", "test-secret"), false);
});
