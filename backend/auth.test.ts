import assert from "node:assert/strict";
import test from "node:test";
import jwt from "jsonwebtoken";
import { R } from "redbean-node";
import {
    authenticateHttpRequest,
    getTrustedProxyIdentity,
    initializeAuthentication,
    isSetupCompleted,
} from "./auth";
import { Settings } from "./settings";

process.env.DOCKGE_AUTH_PROXY_TRUSTED_NETWORKS = "172.20.0.0/24,::1";
process.env.DOCKGE_AUTH_PROXY_HEADER = "x-forwarded-user";

function proxyRequest(remoteAddress: string, username?: string) {
    return {
        socket: { remoteAddress },
        headers: username ? { "x-forwarded-user": username } : {},
        query: {},
    } as never;
}

test("trusted proxy accepts only configured networks and a valid identity", () => {
    assert.equal(
        getTrustedProxyIdentity(proxyRequest("::ffff:172.20.0.8", "alice")),
        "alice",
    );
    assert.throws(
        () => getTrustedProxyIdentity(proxyRequest("172.21.0.8", "alice")),
        /non autorisé/,
    );
    assert.throws(
        () => getTrustedProxyIdentity(proxyRequest("172.20.0.8")),
        /Header d’identité manquant/,
    );
});

test("disabled mode keeps the historical automatic identity", async () => {
    process.env.DOCKGE_AUTH_MODE = "disabled";
    const identity = await authenticateHttpRequest(
        { headers: {},
            query: {},
            socket: {} } as never,
        "unused",
    );
    assert.deepEqual(identity, {
        mode: "disabled",
        username: "auth-disabled",
    });
});

test("local mode still accepts Dockge JWT and rejects missing tokens", async () => {
    process.env.DOCKGE_AUTH_MODE = "local";
    const token = jwt.sign({ username: "local-user" }, "test-secret");
    const identity = await authenticateHttpRequest({
        headers: { authorization: `Bearer ${token}` },
        query: {},
        socket: {},
    } as never, "test-secret");
    assert.equal(identity.username, "local-user");

    await assert.rejects(
        authenticateHttpRequest(
            { headers: {},
                query: {},
                socket: {} } as never,
            "test-secret",
        ),
        /Authentification requise/,
    );
});

test("bootstrap only creates the first user and never changes it later", async () => {
    interface TestUser {
        id?: number;
        username?: string;
        password?: string;
        active?: boolean;
    }
    const users: TestUser[] = [];
    const settings = new Map<string, unknown>();
    const knexDescriptor = Object.getOwnPropertyDescriptor(R, "knex");
    const originalDispense = R.dispense;
    const originalStore = R.store;
    const originalFindOne = R.findOne;
    const originalSettingsGet = Settings.get;
    const originalSettingsSet = Settings.set;

    try {
        Object.defineProperty(R, "knex", {
            configurable: true,
            value: () => ({
                count: () => ({
                    first: async () => ({ count: users.length }),
                }),
            }),
        });
        R.dispense = (() => ({})) as unknown as typeof R.dispense;
        R.store = (async (bean: TestUser) => {
            if (bean.username && !bean.id) {
                bean.id = users.length + 1;
                bean.active = true;
                users.push(bean);
            }
            return bean.id ?? 1;
        }) as unknown as typeof R.store;
        R.findOne = (async (_table: string, _query?: string, params?: unknown[]) =>
            users.find((user) => user.username === params?.[0]) ?? null
        ) as typeof R.findOne;
        Settings.get = (async (key: string) => settings.get(key)) as typeof Settings.get;
        Settings.set = (async (key: string, value: unknown) => {
            settings.set(key, value);
        }) as typeof Settings.set;

        process.env.DOCKGE_AUTH_MODE = "local";
        process.env.DOCKGE_BOOTSTRAP_USERNAME = "bootstrap-admin";
        process.env.DOCKGE_BOOTSTRAP_PASSWORD = "StrongPass123!";
        assert.equal(await initializeAuthentication(), false);
        assert.equal(users.length, 1);
        assert.equal(users[0].username, "bootstrap-admin");
        assert.equal(await isSetupCompleted(), true);

        const originalHash = users[0].password;
        process.env.DOCKGE_BOOTSTRAP_PASSWORD = "AnotherStrong456!";
        assert.equal(await initializeAuthentication(), false);
        assert.equal(users.length, 1);
        assert.equal(users[0].password, originalHash);
    } finally {
        if (knexDescriptor) {
            Object.defineProperty(R, "knex", knexDescriptor);
        }
        R.dispense = originalDispense;
        R.store = originalStore;
        R.findOne = originalFindOne;
        Settings.get = originalSettingsGet;
        Settings.set = originalSettingsSet;
        delete process.env.DOCKGE_BOOTSTRAP_USERNAME;
        delete process.env.DOCKGE_BOOTSTRAP_PASSWORD;
    }
});
