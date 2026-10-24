import express, { Express, Request, Response, Router as ExpressRouter } from "express";
import * as client from "openid-client";
import { DockgeServer } from "../dockge-server";
import { Router } from "../router";
import { activeOidcConfig, markSetupCompleted } from "../auth";
import { AuditLogger } from "../audit-log";
import { log } from "../log";
import {
    claimGroups,
    issueLoginCode,
    OIDC_CALLBACK_PATH,
    oidcClientConfiguration,
    OidcConfig,
    OidcLoginError,
    resolveOidcAccount,
    sameSecret,
    storePendingAuthorization,
    takePendingAuthorization,
} from "../oidc";

const STATE_COOKIE = "dockge_oidc_state";
const COOKIE_PATH = "/api/auth/oidc";

function readCookie(req: Request, name: string): string | undefined {
    for (const part of (req.headers.cookie ?? "").split(";")) {
        const [ key, ...value ] = part.trim().split("=");
        if (key === name) {
            return decodeURIComponent(value.join("="));
        }
    }
    return undefined;
}

function stateCookie(config: OidcConfig, value: string, maxAge: number): string {
    return [
        `${STATE_COOKIE}=${value}`,
        `Path=${COOKIE_PATH}`,
        `Max-Age=${maxAge}`,
        "HttpOnly",
        "SameSite=Lax",
        ...(config.redirectUri.protocol === "https:" ? [ "Secure" ] : []),
    ].join("; ");
}

/** Back to the web UI. The fragment never reaches the server or its access logs. */
function redirectToUi(res: Response, key: "oidc" | "oidcError", value: string): void {
    res.redirect(302, `/#${key}=${encodeURIComponent(value)}`);
}

function stringClaim(claims: Record<string, unknown>, name: string): string | undefined {
    const value = claims[name];
    return typeof value === "string" ? value : undefined;
}

export class OidcRouter extends Router {
    create(_app: Express, server: DockgeServer): ExpressRouter {
        const router = express.Router();

        router.use((_req, res, next) => {
            res.setHeader("Cache-Control", "no-store");
            res.setHeader("Referrer-Policy", "no-referrer");
            next();
        });

        router.get("/login", async (_req: Request, res: Response) => {
            const config = await activeOidcConfig();
            if (!config) {
                res.status(404).end();
                return;
            }
            try {
                const configuration = await oidcClientConfiguration(config);
                const codeVerifier = client.randomPKCECodeVerifier();
                const state = client.randomState();
                const nonce = client.randomNonce();
                storePendingAuthorization(state, { codeVerifier,
                    nonce });
                const url = client.buildAuthorizationUrl(configuration, {
                    redirect_uri: config.redirectUri.href,
                    scope: config.scopes,
                    code_challenge: await client.calculatePKCECodeChallenge(codeVerifier),
                    code_challenge_method: "S256",
                    state,
                    nonce,
                });
                res.setHeader("Set-Cookie", stateCookie(config, state, 600));
                res.redirect(302, url.href);
            } catch (error) {
                if (error instanceof OidcLoginError) {
                    redirectToUi(res, "oidcError", error.message);
                    return;
                }
                log.error("auth", `Fournisseur OIDC injoignable : ${error}`);
                redirectToUi(res, "oidcError", "oidc.providerUnavailable");
            }
        });

        router.get("/callback", async (req: Request, res: Response) => {
            const config = await activeOidcConfig();
            if (!config) {
                res.status(404).end();
                return;
            }
            const state = typeof req.query.state === "string" ? req.query.state : "";
            const cookieState = readCookie(req, STATE_COOKIE);
            res.setHeader("Set-Cookie", stateCookie(config, "", 0));
            let username: string | undefined;
            try {
                if (typeof req.query.error === "string") {
                    log.warn("auth", `Connexion OIDC refusée par le fournisseur : ${req.query.error.slice(0, 100)}`);
                    throw new OidcLoginError("oidc.providerError");
                }
                // The state cookie binds the callback to the browser that started
                // the login, which blocks login CSRF with a forged callback URL.
                const pending = sameSecret(state, cookieState) ? takePendingAuthorization(state) : null;
                if (!pending) {
                    throw new OidcLoginError("oidc.expired");
                }

                const configuration = await oidcClientConfiguration(config);
                // Rebuild the callback URL from configuration, never from Host headers.
                const currentUrl = new URL(config.redirectUri);
                currentUrl.search = new URL(req.originalUrl, "http://localhost").search;
                const tokens = await client.authorizationCodeGrant(configuration, currentUrl, {
                    pkceCodeVerifier: pending.codeVerifier,
                    expectedState: state,
                    expectedNonce: pending.nonce,
                    idTokenExpected: true,
                });
                const idClaims = tokens.claims();
                if (!idClaims) {
                    throw new Error("ID token absent");
                }
                let claims: Record<string, unknown> = { ...idClaims };
                // Some providers only return profile and group claims from userinfo.
                if ((claims[config.usernameClaim] === undefined || claims[config.groupsClaim] === undefined) &&
                    configuration.serverMetadata().userinfo_endpoint) {
                    const userinfo = await client.fetchUserInfo(configuration, tokens.access_token, idClaims.sub);
                    claims = { ...userinfo,
                        ...claims };
                }
                username = stringClaim(claims, config.usernameClaim);

                const result = await resolveOidcAccount(config, {
                    issuer: idClaims.iss,
                    subject: idClaims.sub,
                    username,
                    emailVerified: claims.email_verified === true,
                    groups: claimGroups(claims[config.groupsClaim]),
                });
                const user = result.user;
                if (result.firstUser) {
                    await markSetupCompleted();
                    server.needSetup = false;
                }
                if (result.previousRole) {
                    // Reconnecting sockets pick up the new role on loginByToken.
                    server.disconnectAllSocketClients(user.id);
                }
                await AuditLogger.getInstance().log({
                    userId: user.id,
                    username: user.username,
                    action: "auth.oidc.login",
                    category: "security",
                    targetType: "user",
                    target: user.username,
                    ip: req.ip ?? null,
                    endpoint: `GET ${OIDC_CALLBACK_PATH}`,
                    metadata: {
                        created: result.created,
                        linked: result.linked,
                        role: user.role,
                        previousRole: result.previousRole ?? null,
                    },
                });
                log.info("auth", `Connexion OIDC : ${user.username} (${user.role})` +
                    (result.created ? ", compte créé" : "") + (result.linked ? ", compte lié" : ""));
                redirectToUi(res, "oidc", issueLoginCode(user.id));
            } catch (error) {
                const key = error instanceof OidcLoginError ? error.message : "oidc.failed";
                if (!(error instanceof OidcLoginError)) {
                    log.error("auth", `Échec de la connexion OIDC : ${error}`);
                }
                await AuditLogger.getInstance().log({
                    username: username ?? null,
                    action: "auth.oidc.login",
                    category: "security",
                    status: "failure",
                    message: key,
                    ip: req.ip ?? null,
                    endpoint: `GET ${OIDC_CALLBACK_PATH}`,
                });
                redirectToUi(res, "oidcError", key);
            }
        });

        const mountRouter = express.Router();
        mountRouter.use(COOKIE_PATH, router);
        return mountRouter;
    }
}
