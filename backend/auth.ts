import { promises as fs } from "fs";
import { IncomingMessage } from "http";
import { BlockList, isIP } from "net";
import { randomBytes } from "crypto";
import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { passwordStrength } from "check-password-strength";
import { R } from "redbean-node";
import { log } from "./log";
import { User } from "./models/user";
import { generatePasswordHash } from "./password-hash";
import { Settings } from "./settings";
import { JWTDecoded } from "./util-server";

export type AuthMode = "local" | "disabled" | "trusted-proxy";

export interface AuthIdentity {
    mode: AuthMode;
    username: string;
}

const SETUP_COMPLETED_KEY = "setupCompleted";
const DEFAULT_PROXY_HEADER = "x-forwarded-user";

class AuthenticationError extends Error {
}

interface TrustedProxyConfig {
    blockList: BlockList;
    header: string;
}

let trustedProxyConfig: TrustedProxyConfig | null = null;
const proxyUserCache = new Map<string, { user: User; expiresAt: number }>();
const proxyUserLookups = new Map<string, Promise<User>>();
const PROXY_USER_CACHE_MS = 30_000;

function generatedInternalPassword(): string {
    return randomBytes(48).toString("base64url");
}

function configuredAuthMode(): AuthMode | null {
    const raw = process.env.DOCKGE_AUTH_MODE?.trim().toLowerCase();
    if (!raw) {
        return null;
    }
    if (raw === "local" || raw === "disabled" || raw === "trusted-proxy") {
        return raw;
    }
    throw new Error(
        "DOCKGE_AUTH_MODE doit être local, disabled ou trusted-proxy",
    );
}

export async function getAuthMode(): Promise<AuthMode> {
    const configured = configuredAuthMode();
    if (configured) {
        return configured;
    }
    return await Settings.get("disableAuth") ? "disabled" : "local";
}

function normalizeRemoteAddress(value: string | undefined): {
    address: string;
    type: "ipv4" | "ipv6";
} | null {
    if (!value) {
        return null;
    }
    let address = value.split("%")[0];
    if (address.startsWith("::ffff:") && isIP(address.slice(7)) === 4) {
        address = address.slice(7);
    }
    const version = isIP(address);
    if (version === 4) {
        return { address,
            type: "ipv4" };
    }
    if (version === 6) {
        return { address,
            type: "ipv6" };
    }
    return null;
}

function buildTrustedProxyConfig(): TrustedProxyConfig {
    const networks = process.env.DOCKGE_AUTH_PROXY_TRUSTED_NETWORKS?.trim() ?? "";
    const header = (
        process.env.DOCKGE_AUTH_PROXY_HEADER?.trim().toLowerCase() ||
        DEFAULT_PROXY_HEADER
    );

    if (!/^[a-z0-9-]+$/.test(header)) {
        throw new Error("DOCKGE_AUTH_PROXY_HEADER contient un nom invalide");
    }
    if (!networks) {
        throw new Error(
            "DOCKGE_AUTH_PROXY_TRUSTED_NETWORKS est requis en mode trusted-proxy",
        );
    }

    const blockList = new BlockList();
    for (const entry of networks.split(",").map((item) => item.trim()).filter(Boolean)) {
        const [ address, prefixRaw ] = entry.split("/");
        const normalized = normalizeRemoteAddress(address);
        if (!normalized) {
            throw new Error(`Réseau proxy invalide : ${entry}`);
        }
        if (prefixRaw === undefined) {
            blockList.addAddress(normalized.address, normalized.type);
            continue;
        }
        const prefix = Number(prefixRaw);
        const maxPrefix = normalized.type === "ipv4" ? 32 : 128;
        if (!Number.isInteger(prefix) || prefix < 0 || prefix > maxPrefix) {
            throw new Error(`Préfixe CIDR proxy invalide : ${entry}`);
        }
        blockList.addSubnet(normalized.address, prefix, normalized.type);
    }

    return { blockList,
        header };
}

export function validateTrustedProxyConfiguration(): void {
    trustedProxyConfig = buildTrustedProxyConfig();
}

function proxyConfig(): TrustedProxyConfig {
    if (!trustedProxyConfig) {
        trustedProxyConfig = buildTrustedProxyConfig();
    }
    return trustedProxyConfig;
}

export function getTrustedProxyIdentity(request: IncomingMessage): string {
    const config = proxyConfig();
    const remote = normalizeRemoteAddress(request.socket.remoteAddress);
    if (!remote || !config.blockList.check(remote.address, remote.type)) {
        throw new AuthenticationError("Proxy d’authentification non autorisé");
    }

    const rawHeader = request.headers[config.header];
    const username = (Array.isArray(rawHeader) ? rawHeader[0] : rawHeader)?.trim();
    if (!username) {
        throw new AuthenticationError(
            `Header d’identité manquant : ${config.header}`,
        );
    }
    if (username.length > 255 || /[\u0000-\u001f\u007f]/.test(username)) {
        throw new AuthenticationError("Identité proxy invalide");
    }
    return username;
}

async function createUser(username: string, password: string): Promise<User> {
    const user = R.dispense("user") as User;
    user.username = username;
    user.password = generatePasswordHash(password);
    await R.store(user);
    return user;
}

async function bootstrapUserIfConfigured(): Promise<User | null> {
    const username = process.env.DOCKGE_BOOTSTRAP_USERNAME?.trim() ?? "";
    const passwordFile = process.env.DOCKGE_BOOTSTRAP_PASSWORD_FILE?.trim() ?? "";
    const passwordFromEnv = process.env.DOCKGE_BOOTSTRAP_PASSWORD;
    const requested = Boolean(username || passwordFile || passwordFromEnv);
    if (!requested) {
        return null;
    }
    if (!username) {
        throw new Error("DOCKGE_BOOTSTRAP_USERNAME est requis pour le bootstrap");
    }

    let password = passwordFromEnv ?? "";
    if (passwordFile) {
        password = (await fs.readFile(passwordFile, "utf8")).replace(/\r?\n$/, "");
    }
    if (!password) {
        throw new Error(
            "DOCKGE_BOOTSTRAP_PASSWORD ou DOCKGE_BOOTSTRAP_PASSWORD_FILE est requis",
        );
    }
    if (passwordStrength(password).value === "Too weak") {
        throw new Error("Le mot de passe de bootstrap est trop faible");
    }

    const user = await createUser(username, password);
    await markSetupCompleted();
    log.info("auth", `Compte administrateur initial créé : ${username}`);
    return user;
}

export async function markSetupCompleted(): Promise<void> {
    await Settings.set(SETUP_COMPLETED_KEY, true, "security");
}

export async function isSetupCompleted(): Promise<boolean> {
    return Boolean(await Settings.get(SETUP_COMPLETED_KEY));
}

export async function initializeAuthentication(): Promise<boolean> {
    const mode = await getAuthMode();
    const userCount = Number(
        (await R.knex("user").count("id as count").first()).count,
    );
    log.info("auth", `Mode d’authentification : ${mode}`);

    if (userCount > 0) {
        if (!await Settings.get(SETUP_COMPLETED_KEY)) {
            await markSetupCompleted();
        }
        if (
            process.env.DOCKGE_BOOTSTRAP_USERNAME ||
            process.env.DOCKGE_BOOTSTRAP_PASSWORD ||
            process.env.DOCKGE_BOOTSTRAP_PASSWORD_FILE
        ) {
            log.info("auth", "Bootstrap ignoré : un utilisateur existe déjà");
        }
        if (mode === "trusted-proxy") {
            validateTrustedProxyConfiguration();
        }
        return false;
    }

    const bootstrapUser = await bootstrapUserIfConfigured();
    if (bootstrapUser) {
        return false;
    }

    if (mode === "trusted-proxy") {
        validateTrustedProxyConfiguration();
        return false;
    }

    if (mode === "disabled") {
        await createUser("admin", generatedInternalPassword());
        await markSetupCompleted();
        log.info("auth", "Compte interne généré pour le mode disabled");
        return false;
    }

    if (await Settings.get(SETUP_COMPLETED_KEY)) {
        log.error(
            "auth",
            "Installation déjà initialisée mais aucun utilisateur actif. " +
            "Utilisez le bootstrap pour créer un compte de récupération.",
        );
        return false;
    }

    log.info("server", "No user, need setup");
    return true;
}

async function findOrCreateTrustedProxyUser(username: string): Promise<User> {
    const existing = await R.findOne("user", " username = ? ", [ username ]) as User;
    if (existing) {
        if (!existing.active) {
            throw new AuthenticationError("Utilisateur proxy désactivé");
        }
        return existing;
    }

    try {
        const user = await createUser(username, generatedInternalPassword());
        await markSetupCompleted();
        log.info("auth", `Utilisateur proxy créé : ${username}`);
        return user;
    } catch (error) {
        const user = await R.findOne("user", " username = ? AND active = 1 ", [
            username,
        ]) as User;
        if (user) {
            return user;
        }
        throw error;
    }
}

export async function ensureTrustedProxyUser(username: string): Promise<User> {
    const cached = proxyUserCache.get(username);
    if (cached && cached.expiresAt > Date.now()) {
        return cached.user;
    }

    const running = proxyUserLookups.get(username);
    if (running) {
        return running;
    }

    const lookup = findOrCreateTrustedProxyUser(username)
        .then((user) => {
            proxyUserCache.set(username, {
                user,
                expiresAt: Date.now() + PROXY_USER_CACHE_MS,
            });
            return user;
        })
        .finally(() => proxyUserLookups.delete(username));
    proxyUserLookups.set(username, lookup);
    return lookup;
}

export async function authenticateHttpRequest(
    req: Request,
    jwtSecret: string,
): Promise<AuthIdentity> {
    const mode = await getAuthMode();
    if (mode === "disabled") {
        return { mode,
            username: "auth-disabled" };
    }
    if (mode === "trusted-proxy") {
        const username = getTrustedProxyIdentity(req);
        await ensureTrustedProxyUser(username);
        return { mode,
            username };
    }

    const authHeader = req.headers.authorization;
    const token =
        (authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : undefined) ??
        (typeof req.query.token === "string" ? req.query.token : undefined);
    if (!token) {
        throw new AuthenticationError("Authentification requise");
    }

    try {
        const decoded = jwt.verify(token, jwtSecret) as JWTDecoded;
        return { mode,
            username: decoded.username };
    } catch {
        throw new AuthenticationError("Token invalide ou expiré");
    }
}

export async function requireHttpAuth(
    req: Request,
    res: Response,
    next: NextFunction,
    jwtSecret: string,
    onAuthenticated?: (identity: AuthIdentity) => void,
): Promise<void> {
    try {
        const identity = await authenticateHttpRequest(req, jwtSecret);
        onAuthenticated?.(identity);
        next();
    } catch (error) {
        if (error instanceof AuthenticationError) {
            res.status(401).json({ ok: false,
                message: error.message });
            return;
        }
        next(error);
    }
}
