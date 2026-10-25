import { readFileSync } from "fs";
import { randomBytes, timingSafeEqual } from "crypto";
import * as client from "openid-client";
import { R } from "redbean-node";
import { log } from "./log";
import { generatePasswordHash } from "./password-hash";

export const OIDC_CALLBACK_PATH = "/api/auth/oidc/callback";
const PENDING_TTL_MS = 10 * 60_000;
const LOGIN_CODE_TTL_MS = 60_000;
const MAX_PENDING = 500;

export interface OidcConfig {
    issuer: URL;
    clientId: string;
    clientSecret?: string;
    redirectUri: URL;
    scopes: string;
    usernameClaim: string;
    groupsClaim: string;
    adminUsers: string[];
    adminGroups: string[];
    linkExisting: boolean;
    disableLocalLogin: boolean;
    buttonLabel: string;
    allowHttp: boolean;
}

export interface OidcIdentity {
    issuer: string;
    subject: string;
    username?: string;
    emailVerified: boolean;
    groups: string[];
}

export interface OidcUserRow {
    id: number;
    username: string;
    password: string;
    active: number | boolean;
    role: string;
    twofa_version?: number;
    oidc_issuer?: string | null;
    oidc_subject?: string | null;
}

export interface OidcAccountResult {
    user: OidcUserRow;
    created: boolean;
    linked: boolean;
    firstUser: boolean;
    previousRole?: string;
}

/** A refusal whose message is an i18n key that can be shown to the user. */
export class OidcLoginError extends Error {
}

function flag(value: string | undefined): boolean {
    return [ "1", "true", "yes", "on" ].includes(value?.trim().toLowerCase() ?? "");
}

function list(value: string | undefined): string[] {
    return (value ?? "").split(",").map(item => item.trim()).filter(Boolean);
}

function httpUrl(name: string, value: string, allowHttp: boolean): URL {
    let url: URL;
    try {
        url = new URL(value);
    } catch {
        throw new Error(`${name} n’est pas une URL valide`);
    }
    if (url.protocol !== "https:" && !(allowHttp && url.protocol === "http:")) {
        throw new Error(`${name} doit utiliser https (DOCKGE_OIDC_ALLOW_HTTP=true pour un test local)`);
    }
    return url;
}

function claimName(name: string, value: string | undefined, fallback: string): string {
    const claim = value?.trim() || fallback;
    if (!/^[A-Za-z0-9_.:/-]{1,128}$/.test(claim)) {
        throw new Error(`${name} contient un nom de claim invalide`);
    }
    return claim;
}

/**
 * Read the OIDC settings from the environment. Returns null when OIDC is not
 * configured. Throws on an incomplete or unsafe configuration so startup fails
 * loudly, as trusted-proxy mode does.
 */
export function readOidcConfig(env: NodeJS.ProcessEnv = process.env): OidcConfig | null {
    const disableLocalLogin = flag(env.DOCKGE_OIDC_DISABLE_LOCAL_LOGIN);
    const issuerRaw = env.DOCKGE_OIDC_ISSUER?.trim();
    if (!issuerRaw) {
        if (disableLocalLogin) {
            throw new Error("DOCKGE_OIDC_DISABLE_LOCAL_LOGIN exige une configuration OIDC complète (DOCKGE_OIDC_ISSUER)");
        }
        return null;
    }
    const allowHttp = flag(env.DOCKGE_OIDC_ALLOW_HTTP);
    const clientId = env.DOCKGE_OIDC_CLIENT_ID?.trim();
    if (!clientId) {
        throw new Error("DOCKGE_OIDC_CLIENT_ID est requis quand DOCKGE_OIDC_ISSUER est défini");
    }
    const redirectRaw = env.DOCKGE_OIDC_REDIRECT_URI?.trim();
    if (!redirectRaw) {
        throw new Error("DOCKGE_OIDC_REDIRECT_URI est requis quand DOCKGE_OIDC_ISSUER est défini");
    }
    const redirectUri = httpUrl("DOCKGE_OIDC_REDIRECT_URI", redirectRaw, allowHttp);
    if (redirectUri.pathname !== OIDC_CALLBACK_PATH || redirectUri.search || redirectUri.hash) {
        throw new Error(`DOCKGE_OIDC_REDIRECT_URI doit se terminer par ${OIDC_CALLBACK_PATH}`);
    }

    let clientSecret = env.DOCKGE_OIDC_CLIENT_SECRET;
    const secretFile = env.DOCKGE_OIDC_CLIENT_SECRET_FILE?.trim();
    if (secretFile) {
        clientSecret = readFileSync(secretFile, "utf8").replace(/\r?\n$/, "");
    }

    const scopes = (env.DOCKGE_OIDC_SCOPES?.trim() || "openid profile email").split(/\s+/);
    if (!scopes.includes("openid")) {
        scopes.unshift("openid");
    }

    return {
        issuer: httpUrl("DOCKGE_OIDC_ISSUER", issuerRaw, allowHttp),
        clientId,
        clientSecret: clientSecret || undefined,
        redirectUri,
        scopes: scopes.join(" "),
        usernameClaim: claimName("DOCKGE_OIDC_USERNAME_CLAIM", env.DOCKGE_OIDC_USERNAME_CLAIM, "preferred_username"),
        groupsClaim: claimName("DOCKGE_OIDC_GROUPS_CLAIM", env.DOCKGE_OIDC_GROUPS_CLAIM, "groups"),
        adminUsers: list(env.DOCKGE_OIDC_ADMIN_USERS),
        adminGroups: list(env.DOCKGE_OIDC_ADMIN_GROUPS),
        linkExisting: flag(env.DOCKGE_OIDC_LINK_EXISTING),
        disableLocalLogin,
        buttonLabel: env.DOCKGE_OIDC_BUTTON_LABEL?.trim().slice(0, 64) || "",
        allowHttp,
    };
}

let oidcConfig: OidcConfig | null = null;
let discovered: Promise<client.Configuration> | null = null;

export function validateOidcConfiguration(): OidcConfig | null {
    oidcConfig = readOidcConfig();
    discovered = null;
    return oidcConfig;
}

export function getOidcConfig(): OidcConfig | null {
    return oidcConfig;
}

export function isLocalLoginDisabled(): boolean {
    return Boolean(oidcConfig?.disableLocalLogin);
}

/**
 * Discover the provider lazily and cache the result. A failed discovery is not
 * cached: an unreachable provider must neither block startup nor local login.
 */
export function oidcClientConfiguration(config: OidcConfig): Promise<client.Configuration> {
    if (!discovered) {
        discovered = client.discovery(
            config.issuer,
            config.clientId,
            config.clientSecret,
            config.clientSecret ? undefined : client.None(),
            {
                timeout: 10,
                execute: config.allowHttp ? [ client.allowInsecureRequests ] : [],
            },
        ).catch(error => {
            discovered = null;
            throw error;
        });
    }
    return discovered;
}

// ─── Short-lived in-memory state ────────────────────────────────────────────

interface PendingAuthorization {
    codeVerifier: string;
    nonce: string;
    expiresAt: number;
}

const pendingAuthorizations = new Map<string, PendingAuthorization>();
const loginCodes = new Map<string, { userId: number;
    expiresAt: number }>();

function prune<T extends { expiresAt: number }>(store: Map<string, T>): void {
    const now = Date.now();
    for (const [ key, value ] of store) {
        if (value.expiresAt <= now) {
            store.delete(key);
        }
    }
    if (store.size >= MAX_PENDING) {
        throw new OidcLoginError("oidc.busy");
    }
}

export function storePendingAuthorization(state: string, value: Omit<PendingAuthorization, "expiresAt">): void {
    prune(pendingAuthorizations);
    pendingAuthorizations.set(state, { ...value,
        expiresAt: Date.now() + PENDING_TTL_MS });
}

/** Single use: the entry is removed whether or not it is still valid. */
export function takePendingAuthorization(state: string): PendingAuthorization | null {
    const value = pendingAuthorizations.get(state);
    pendingAuthorizations.delete(state);
    return value && value.expiresAt > Date.now() ? value : null;
}

/**
 * The browser receives this code in the URL fragment instead of the session
 * token itself, then exchanges it once over the authenticated socket.
 */
export function issueLoginCode(userId: number): string {
    prune(loginCodes);
    const code = randomBytes(32).toString("base64url");
    loginCodes.set(code, { userId,
        expiresAt: Date.now() + LOGIN_CODE_TTL_MS });
    return code;
}

export function consumeLoginCode(code: unknown): number | null {
    if (typeof code !== "string" || code.length > 128) {
        return null;
    }
    const value = loginCodes.get(code);
    loginCodes.delete(code);
    return value && value.expiresAt > Date.now() ? value.userId : null;
}

export function sameSecret(a: string | undefined, b: string | undefined): boolean {
    if (!a || !b) {
        return false;
    }
    const left = Buffer.from(a);
    const right = Buffer.from(b);
    return left.length === right.length && timingSafeEqual(left, right);
}

// ─── Identity → account ─────────────────────────────────────────────────────

export function claimGroups(value: unknown): string[] {
    if (typeof value === "string") {
        return [ value ];
    }
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

/**
 * Role imposed by the provider at each login, or null to keep the stored role.
 * With DOCKGE_OIDC_ADMIN_GROUPS set, group membership is the source of truth and
 * leaving the group demotes the account. Without it, listed users are promoted
 * and nobody is ever demoted.
 */
export function oidcRoleFor(config: OidcConfig, username: string, groups: string[]): "admin" | "restricted" | null {
    const admin = config.adminUsers.includes(username) || groups.some(group => config.adminGroups.includes(group));
    if (config.adminGroups.length > 0) {
        return admin ? "admin" : "restricted";
    }
    return admin ? "admin" : null;
}

function validUsername(value: string | undefined): string {
    const username = value?.trim();
    if (!username) {
        throw new OidcLoginError("oidc.missingUsername");
    }
    if (username.length > 255 || /[\u0000-\u001f\u007f]/.test(username)) {
        throw new OidcLoginError("oidc.invalidUsername");
    }
    return username;
}

async function findByIdentity(identity: OidcIdentity): Promise<OidcUserRow | undefined> {
    return R.knex("user").where({ oidc_issuer: identity.issuer,
        oidc_subject: identity.subject }).first();
}

/**
 * Find, link or create the local account for a validated OIDC identity.
 * Accounts are bound to the stable (issuer, subject) pair. A username or email
 * is only used once, to link or create the account, because users can often
 * change those claims at the provider.
 */
export async function resolveOidcAccount(config: OidcConfig, identity: OidcIdentity): Promise<OidcAccountResult> {
    let user = await findByIdentity(identity);
    let created = false;
    let linked = false;
    let firstUser = false;

    if (!user) {
        const username = validUsername(identity.username);
        const existing: OidcUserRow | undefined = await R.knex("user").where({ username }).first();
        if (existing) {
            if (existing.oidc_subject || !config.linkExisting) {
                throw new OidcLoginError("oidc.accountConflict");
            }
            if (config.usernameClaim === "email" && !identity.emailVerified) {
                throw new OidcLoginError("oidc.emailNotVerified");
            }
            const count = await R.knex("user").where({ id: existing.id })
                .whereNull("oidc_subject")
                .update({ oidc_issuer: identity.issuer,
                    oidc_subject: identity.subject });
            if (!count) {
                throw new OidcLoginError("oidc.accountConflict");
            }
            linked = true;
        } else {
            const userCount = Number((await R.knex("user").count("id as count").first()).count);
            const role = oidcRoleFor(config, username, identity.groups) ?? "restricted";
            // The first account must be able to administer Dockge; otherwise the
            // installation would be locked with a restricted account only.
            if (userCount === 0 && role !== "admin") {
                throw new OidcLoginError("oidc.setupRequired");
            }
            try {
                await R.knex("user").insert({
                    username,
                    password: generatePasswordHash(randomBytes(48).toString("base64url")),
                    active: 1,
                    role,
                    stack_grants: "[]",
                    oidc_issuer: identity.issuer,
                    oidc_subject: identity.subject,
                });
                created = true;
                firstUser = userCount === 0;
            } catch (error) {
                // A concurrent callback may have created the same identity.
                if (!await findByIdentity(identity)) {
                    log.warn("auth", `Création du compte OIDC impossible : ${error}`);
                    throw new OidcLoginError("oidc.accountConflict");
                }
            }
        }
        user = await findByIdentity(identity);
        if (!user) {
            throw new OidcLoginError("oidc.failed");
        }
    }

    if (!user.active) {
        throw new OidcLoginError("oidc.accountDisabled");
    }

    let previousRole: string | undefined;
    const role = oidcRoleFor(config, user.username, identity.groups);
    if (!created && role && role !== user.role) {
        await R.knex("user").where({ id: user.id }).update({ role });
        previousRole = user.role;
        user = { ...user,
            role };
    }

    return { user,
        created,
        linked,
        firstUser,
        previousRole };
}
