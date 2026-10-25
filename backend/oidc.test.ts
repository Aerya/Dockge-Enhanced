import test from "node:test";
import assert from "node:assert/strict";
import { createHash, generateKeyPairSync } from "node:crypto";
import { createServer, type Server } from "node:http";
import { createRequire } from "node:module";
import type { AddressInfo } from "node:net";
import express from "express";
import jwt from "jsonwebtoken";
import knex, { type Knex } from "knex";
import sqlite from "@louislam/sqlite3";
import { R } from "redbean-node";
import { up as addRoles } from "./migrations/2026-10-24-0001-scoped-users";
import { up as addOidcIdentity } from "./migrations/2026-10-25-0001-oidc-identity";
import {
    claimGroups,
    consumeLoginCode,
    issueLoginCode,
    oidcRoleFor,
    readOidcConfig,
    resolveOidcAccount,
    storePendingAuthorization,
    takePendingAuthorization,
    validateOidcConfiguration,
    type OidcConfig,
    type OidcIdentity,
} from "./oidc";
import { OidcRouter } from "./routers/oidc-router";
import { AuditLogger } from "./audit-log";
import { Settings } from "./settings";
import type { DockgeServer } from "./dockge-server";

const Dialect = createRequire(import.meta.url)("knex/lib/dialects/sqlite3/index.js") as typeof Knex.Client;
class TestDialect extends Dialect {
    _driver() {
        return sqlite;
    }
}

const baseEnv = {
    DOCKGE_OIDC_ISSUER: "https://id.example.test",
    DOCKGE_OIDC_CLIENT_ID: "dockge",
    DOCKGE_OIDC_REDIRECT_URI: "https://dockge.example.test/api/auth/oidc/callback",
};

function config(overrides: Partial<OidcConfig> = {}): OidcConfig {
    return { ...readOidcConfig(baseEnv)!,
        ...overrides };
}

async function useDatabase(t: test.TestContext): Promise<Knex> {
    const db = knex({ client: TestDialect,
        connection: { filename: ":memory:" },
        useNullAsDefault: true });
    await db.schema.createTable("user", table => {
        table.increments("id");
        table.string("username", 255).notNullable().unique();
        table.string("password", 255);
        table.boolean("active").notNullable().defaultTo(true);
        table.integer("twofa_version").notNullable().defaultTo(0);
    });
    await addRoles(db);
    await addOidcIdentity(db);
    const descriptor = Object.getOwnPropertyDescriptor(R, "knex");
    Object.defineProperty(R, "knex", { configurable: true,
        value: db });
    t.after(async () => {
        if (descriptor) {
            Object.defineProperty(R, "knex", descriptor);
        }
        await db.destroy();
    });
    return db;
}

function identity(overrides: Partial<OidcIdentity> = {}): OidcIdentity {
    return { issuer: "https://id.example.test",
        subject: "sub-alice",
        username: "alice",
        emailVerified: false,
        groups: [],
        ...overrides };
}

test("configuration requires the client, a callback path and https", () => {
    assert.equal(readOidcConfig({}), null);
    assert.throws(() => readOidcConfig({ DOCKGE_OIDC_DISABLE_LOCAL_LOGIN: "true" }), /DOCKGE_OIDC_ISSUER/);
    assert.throws(() => readOidcConfig({ ...baseEnv,
        DOCKGE_OIDC_CLIENT_ID: "" }), /CLIENT_ID/);
    assert.throws(() => readOidcConfig({ ...baseEnv,
        DOCKGE_OIDC_REDIRECT_URI: "https://dockge.example.test/callback" }), /se terminer par/);
    assert.throws(() => readOidcConfig({ ...baseEnv,
        DOCKGE_OIDC_ISSUER: "http://id.example.test" }), /https/);
    assert.ok(readOidcConfig({ ...baseEnv,
        DOCKGE_OIDC_ISSUER: "http://id.example.test",
        DOCKGE_OIDC_ALLOW_HTTP: "true" }));
    assert.throws(() => readOidcConfig({ ...baseEnv,
        DOCKGE_OIDC_USERNAME_CLAIM: "bad claim" }), /claim invalide/);

    const parsed = readOidcConfig({ ...baseEnv,
        DOCKGE_OIDC_SCOPES: "profile email groups",
        DOCKGE_OIDC_ADMIN_GROUPS: "dockge-admins, ops",
        DOCKGE_OIDC_DISABLE_LOCAL_LOGIN: "1" })!;
    assert.equal(parsed.scopes, "openid profile email groups");
    assert.deepEqual(parsed.adminGroups, [ "dockge-admins", "ops" ]);
    assert.equal(parsed.usernameClaim, "preferred_username");
    assert.equal(parsed.linkExisting, false);
    assert.equal(parsed.disableLocalLogin, true);
});

test("roles: listed users are promoted, admin groups sync both ways", () => {
    assert.equal(oidcRoleFor(config(), "alice", [ "dockge-admins" ]), null);
    assert.equal(oidcRoleFor(config({ adminUsers: [ "alice" ] }), "alice", []), "admin");
    const groups = config({ adminGroups: [ "dockge-admins" ] });
    assert.equal(oidcRoleFor(groups, "alice", [ "dockge-admins" ]), "admin");
    assert.equal(oidcRoleFor(groups, "alice", [ "users" ]), "restricted");
    assert.deepEqual(claimGroups("ops"), [ "ops" ]);
    assert.deepEqual(claimGroups([ "ops", 3, "dev" ]), [ "ops", "dev" ]);
    assert.deepEqual(claimGroups(undefined), []);
});

test("pending authorizations and login codes are single use", () => {
    storePendingAuthorization("state-1", { codeVerifier: "v",
        nonce: "n" });
    assert.equal(takePendingAuthorization("state-1")?.nonce, "n");
    assert.equal(takePendingAuthorization("state-1"), null);

    const code = issueLoginCode(42);
    assert.equal(consumeLoginCode("unknown"), null);
    assert.equal(consumeLoginCode(code), 42);
    assert.equal(consumeLoginCode(code), null);
});

test("accounts: fail-closed creation, no implicit first admin, binding by subject", async t => {
    const db = await useDatabase(t);

    await assert.rejects(resolveOidcAccount(config(), identity()), /oidc.setupRequired/);
    assert.equal((await db("user")).length, 0);

    const first = await resolveOidcAccount(config({ adminUsers: [ "alice" ] }), identity());
    assert.equal(first.created, true);
    assert.equal(first.firstUser, true);
    assert.equal(first.user.role, "admin");

    const bob = await resolveOidcAccount(config(), identity({ subject: "sub-bob",
        username: "bob" }));
    assert.equal(bob.user.role, "restricted");
    assert.equal(bob.firstUser, false);
    assert.equal((await db("user").where({ id: bob.user.id }).first()).stack_grants, "[]");

    // A renamed user at the provider keeps the same account.
    const renamed = await resolveOidcAccount(config(), identity({ subject: "sub-bob",
        username: "robert" }));
    assert.equal(renamed.user.id, bob.user.id);
    assert.equal(renamed.created, false);

    await assert.rejects(resolveOidcAccount(config(), identity({ subject: "sub-other" })), /oidc.accountConflict/);
    await assert.rejects(resolveOidcAccount(config(), identity({ subject: "sub-x",
        username: "" })), /oidc.missingUsername/);

    await db("user").where({ id: bob.user.id }).update({ active: 0 });
    await assert.rejects(resolveOidcAccount(config(), identity({ subject: "sub-bob" })), /oidc.accountDisabled/);
});

test("accounts: linking an existing local account is opt-in and needs a verified email", async t => {
    const db = await useDatabase(t);
    await db("user").insert({ username: "admin",
        password: "hash",
        role: "admin" });
    await db("user").insert({ username: "carol@example.test",
        password: "hash",
        role: "restricted" });

    await assert.rejects(resolveOidcAccount(config(), identity({ username: "admin" })), /oidc.accountConflict/);

    const byEmail = config({ linkExisting: true,
        usernameClaim: "email" });
    await assert.rejects(resolveOidcAccount(byEmail, identity({ subject: "sub-carol",
        username: "carol@example.test" })), /oidc.emailNotVerified/);
    const linked = await resolveOidcAccount(byEmail, identity({ subject: "sub-carol",
        username: "carol@example.test",
        emailVerified: true }));
    assert.equal(linked.linked, true);
    assert.equal(linked.user.password, "hash");

    // Another identity cannot take over an account that is already linked.
    await assert.rejects(resolveOidcAccount(byEmail, identity({ subject: "sub-mallory",
        username: "carol@example.test",
        emailVerified: true })), /oidc.accountConflict/);
});

test("accounts: admin groups promote and demote on each login", async t => {
    const db = await useDatabase(t);
    const groups = config({ adminGroups: [ "dockge-admins" ] });
    const created = await resolveOidcAccount(groups, identity({ groups: [ "dockge-admins" ] }));
    assert.equal(created.user.role, "admin");

    const demoted = await resolveOidcAccount(groups, identity({ groups: [] }));
    assert.equal(demoted.user.role, "restricted");
    assert.equal(demoted.previousRole, "admin");
    assert.equal((await db("user").where({ id: created.user.id }).first()).role, "restricted");

    const unchanged = await resolveOidcAccount(groups, identity({ groups: [] }));
    assert.equal(unchanged.previousRole, undefined);
});

// ─── Full authorization code flow against a local provider ─────────────────

interface Provider {
    issuer: string;
    server: Server;
    nonceOverride?: string;
    lastAuthorize?: URLSearchParams;
}

async function startProvider(): Promise<Provider> {
    const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const jwk = { ...publicKey.export({ format: "jwk" }),
        kid: "test",
        alg: "RS256",
        use: "sig" };
    const codes = new Map<string, { challenge: string;
        nonce: string }>();
    const app = express();
    const provider = { server: createServer(app) } as Provider;
    app.use(express.urlencoded({ extended: false }));
    app.get("/.well-known/openid-configuration", (_req, res) => {
        res.json({
            issuer: provider.issuer,
            authorization_endpoint: `${provider.issuer}/authorize`,
            token_endpoint: `${provider.issuer}/token`,
            jwks_uri: `${provider.issuer}/jwks`,
            response_types_supported: [ "code" ],
            subject_types_supported: [ "public" ],
            id_token_signing_alg_values_supported: [ "RS256" ],
            code_challenge_methods_supported: [ "S256" ],
        });
    });
    app.get("/jwks", (_req, res) => {
        res.json({ keys: [ jwk ] });
    });
    app.post("/token", (req, res) => {
        const grant = codes.get(req.body.code);
        codes.delete(req.body.code);
        const challenge = createHash("sha256").update(String(req.body.code_verifier)).digest("base64url");
        if (!grant || grant.challenge !== challenge || req.body.client_id !== "dockge") {
            res.status(400).json({ error: "invalid_grant" });
            return;
        }
        const idToken = jwt.sign({
            nonce: provider.nonceOverride ?? grant.nonce,
            preferred_username: "alice",
            groups: [ "dockge-admins" ],
        }, privateKey, { algorithm: "RS256",
            keyid: "test",
            issuer: provider.issuer,
            audience: "dockge",
            subject: "sub-alice",
            expiresIn: 300 });
        res.json({ access_token: "access",
            token_type: "Bearer",
            expires_in: 300,
            id_token: idToken });
    });
    // Test helper standing in for the user approving the login at the provider.
    provider.lastAuthorize = undefined;
    (provider as Provider & { issueCode: (params: URLSearchParams) => string }).issueCode = (params) => {
        const code = `code-${codes.size + 1}-${Date.now()}`;
        codes.set(code, { challenge: params.get("code_challenge")!,
            nonce: params.get("nonce")! });
        return code;
    };
    await new Promise<void>(resolve => provider.server.listen(0, "127.0.0.1", resolve));
    provider.issuer = `http://127.0.0.1:${(provider.server.address() as AddressInfo).port}`;
    return provider;
}

async function startDockge(fakeServer: Partial<DockgeServer>): Promise<{ url: string;
    server: Server }> {
    const app = express();
    app.use(new OidcRouter().create(app, fakeServer as DockgeServer));
    const server = createServer(app);
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    return { url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
        server };
}

test("authorization code flow with PKCE, state cookie and nonce", { timeout: 15000 }, async t => {
    await useDatabase(t);
    const provider = await startProvider() as Provider & { issueCode: (params: URLSearchParams) => string };
    const disconnected: number[] = [];
    const fakeServer = { needSetup: true,
        disconnectAllSocketClients: (id: number | undefined) => {
            disconnected.push(Number(id));
        } } as Partial<DockgeServer>;
    const dockge = await startDockge(fakeServer);
    const savedEnv = { ...process.env };
    t.mock.method(AuditLogger.getInstance(), "log", async () => {});
    t.mock.method(Settings, "set", async () => {});
    t.after(() => {
        process.env = savedEnv;
        validateOidcConfiguration();
        provider.server.close();
        dockge.server.close();
    });
    Object.assign(process.env, {
        DOCKGE_AUTH_MODE: "local",
        DOCKGE_OIDC_ISSUER: provider.issuer,
        DOCKGE_OIDC_CLIENT_ID: "dockge",
        DOCKGE_OIDC_CLIENT_SECRET: "",
        DOCKGE_OIDC_REDIRECT_URI: `${dockge.url}/api/auth/oidc/callback`,
        DOCKGE_OIDC_ADMIN_GROUPS: "dockge-admins",
        DOCKGE_OIDC_ALLOW_HTTP: "true",
    });
    validateOidcConfiguration();

    async function startLogin() {
        const res = await fetch(`${dockge.url}/api/auth/oidc/login`, { redirect: "manual" });
        assert.equal(res.status, 302);
        const location = new URL(res.headers.get("location")!);
        assert.equal(location.origin, provider.issuer);
        assert.equal(location.searchParams.get("code_challenge_method"), "S256");
        const cookie = res.headers.get("set-cookie")!.split(";")[0];
        return { params: location.searchParams,
            cookie };
    }

    async function callback(query: string, cookie?: string) {
        const res = await fetch(`${dockge.url}/api/auth/oidc/callback?${query}`, {
            redirect: "manual",
            headers: cookie ? { cookie } : {},
        });
        assert.equal(res.status, 302);
        return new URLSearchParams(res.headers.get("location")!.replace(/^\/#/, ""));
    }

    // Successful login: first user, admin through the group claim.
    let login = await startLogin();
    let code = provider.issueCode(login.params);
    let result = await callback(`code=${code}&state=${login.params.get("state")}`, login.cookie);
    const userId = consumeLoginCode(result.get("oidc"));
    assert.ok(userId);
    assert.equal(fakeServer.needSetup, false);
    const user = await R.knex("user").where({ id: userId }).first();
    assert.equal(user.username, "alice");
    assert.equal(user.role, "admin");
    assert.equal(user.oidc_issuer, provider.issuer);

    // The state cookie binds the callback to the browser that started it.
    login = await startLogin();
    code = provider.issueCode(login.params);
    result = await callback(`code=${code}&state=${login.params.get("state")}`);
    assert.equal(result.get("oidcError"), "oidc.expired");

    // A replayed state is refused.
    login = await startLogin();
    code = provider.issueCode(login.params);
    const query = `code=${code}&state=${login.params.get("state")}`;
    assert.ok((await callback(query, login.cookie)).get("oidc"));
    assert.equal((await callback(query, login.cookie)).get("oidcError"), "oidc.expired");

    // A wrong nonce in the ID token is refused.
    provider.nonceOverride = "forged";
    login = await startLogin();
    code = provider.issueCode(login.params);
    result = await callback(`code=${code}&state=${login.params.get("state")}`, login.cookie);
    assert.equal(result.get("oidcError"), "oidc.failed");
    provider.nonceOverride = undefined;

    // An error from the provider is reported without echoing its text.
    login = await startLogin();
    result = await callback(`error=access_denied&state=${login.params.get("state")}`, login.cookie);
    assert.equal(result.get("oidcError"), "oidc.providerError");
    assert.deepEqual(disconnected, []);
});
