import assert from "node:assert/strict";
import test from "node:test";
import { registerAccountSession, reserveAccountSecurity } from "./account-security";

function barrier() {
    let resolve!: () => void;
    const promise = new Promise<void>(done => {
        resolve = done;
    });
    return { promise,
        resolve };
}

test("a security change excludes a simultaneous login and releases on failure", async () => {
    const release = reserveAccountSecurity(1);
    try {
        await assert.rejects(registerAccountSession(1, async () => true, async () => assert.fail("must not register")), /restartLogin/);
        assert.throws(() => reserveAccountSecurity(1), /restartLogin/);
    } finally {
        release();
    }
    await assert.rejects(registerAccountSession(1, async () => {
        throw new Error("database unavailable");
    }, async () => {}), /database unavailable/);
    reserveAccountSecurity(1)();
});

test("login reserves before reading credentials and registers before release; slow agents do not hold the lock", async () => {
    const read = barrier();
    const remote = barrier();
    const registered = barrier();
    let visible = false;
    const login = registerAccountSession(2, async () => {
        await read.promise;
        return true;
    }, async () => {
        visible = true;
        registered.resolve();
        await remote.promise;
    });
    assert.throws(() => reserveAccountSecurity(2), /restartLogin/);
    read.resolve();
    await registered.promise;
    const release = reserveAccountSecurity(2);
    assert.equal(visible, true, "a security change can now revoke the registered socket");
    release();
    remote.resolve();
    await login;
});

test("failed registration releases the reservation and other accounts remain independent", async () => {
    const release = reserveAccountSecurity(3);
    await registerAccountSession(4, async () => true, async () => {});
    release();
    await assert.rejects(registerAccountSession(3, async () => true, async () => {
        throw new Error("disconnected");
    }), /disconnected/);
    reserveAccountSecurity(3)();
});
