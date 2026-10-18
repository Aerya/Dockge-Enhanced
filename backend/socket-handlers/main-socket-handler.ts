// @ts-ignore
import composerize from "composerize";
import { SocketHandler } from "../socket-handler.js";
import { DockgeServer } from "../dockge-server";
import { log } from "../log";
import { R } from "redbean-node";
import { loginRateLimiter, twoFaRateLimiter } from "../rate-limiter";
import { generatePasswordHash, needRehashPassword, passwordVersionFingerprint, verifyPassword } from "../password-hash";
import { User } from "../models/user";
import {
    callbackError,
    checkLogin,
    DockgeSocket,
    doubleCheckPassword,
    JWTDecoded,
    ValidationError
} from "../util-server";
import { passwordStrength } from "check-password-strength";
import jwt from "jsonwebtoken";
import { Settings } from "../settings";
import fs, { promises as fsAsync } from "fs";
import path from "path";
import axios from "axios";
import { getAuthMode, isSetupCompleted, markSetupCompleted } from "../auth";
import { parseDocument } from "yaml";
import { createLoginChallenge, interactiveSessionVersionMatches, validLoginChallenge, type LoginChallenge } from "../two-factor-auth";
import { registerTwoFactorHandlers } from "../two-factor-socket";
import { registerAccountSession, reserveAccountSecurity } from "../account-security";

/**
 * Vérifie un token Cloudflare Turnstile côté serveur via l'API siteverify.
 * Retourne true si la protection est désactivée ou si le token est valide.
 */
async function verifyTurnstile(token : unknown, clientIP : string) : Promise<boolean> {
    const settings = await Settings.getSettings("general");
    if (!settings.turnstileEnabled || !settings.turnstileSecret) {
        return true;
    }
    if (typeof token !== "string" || token === "") {
        return false;
    }
    try {
        const params = new URLSearchParams();
        params.append("secret", settings.turnstileSecret);
        params.append("response", token);
        if (clientIP) {
            params.append("remoteip", clientIP);
        }
        const res = await axios.post(
            "https://challenges.cloudflare.com/turnstile/v0/siteverify",
            params,
            { timeout: 10000 }
        );
        return res.data?.success === true;
    } catch (e) {
        log.warn("auth", "Turnstile verification failed: " + (e instanceof Error ? e.message : String(e)));
        return false;
    }
}

export class MainSocketHandler extends SocketHandler {
    create(socket : DockgeSocket, server : DockgeServer) {
        const factors = registerTwoFactorHandlers(socket, server);
        const finishLogin = async (authenticated: User, federation = false) => {
            const validate = async () => {
                const current = await R.findOne("user", " id = ? AND active = 1 ", [ authenticated.id ]) as User;
                if (!socket.connected || !current || (!federation &&
                    (current.password !== authenticated.password || Number(current.twofa_version) !== Number(authenticated.twofa_version)))) {
                    throw new Error("twoFactor.restartLogin");
                }
                return current;
            };
            const register = (user: User) => {
                socket.federationAuthenticated = federation;
                return server.afterLogin(socket, user);
            };
            if (federation) {
                // A scoped credential is independent of interactive 2FA changes.
                // Do not turn temporary enrollment contention into an agent's
                // permanent authentication failure; still revalidate active user.
                await register(await validate());
            } else {
                await registerAccountSession(authenticated.id, validate, register);
            }
            if (!socket.connected) {
                throw new Error("twoFactor.restartLogin");
            }
        };
        let pendingLogin: LoginChallenge | null = null;
        let pendingAccount: { id: number;
            version: number;
            password: string } | null = null;
        socket.on("disconnect", () => {
            pendingLogin = null;
            pendingAccount = null;
        });

        // ***************************
        // Public Socket API
        // ***************************

        // Setup
        socket.on("setup", async (username, password, callback) => {
            let setupClaimed = false;
            try {
                if (
                    await getAuthMode() !== "local" ||
                    !server.needSetup ||
                    await isSetupCompleted()
                ) {
                    throw new Error("Dockge has already been initialized.");
                }
                if (passwordStrength(password).value === "Too weak") {
                    throw new Error("Password is too weak. It should contain alphabetic and numeric characters. It must be at least 6 characters in length.");
                }

                if ((await R.knex("user").count("id as count").first()).count !== 0) {
                    throw new Error("Dockge has been initialized. If you want to run setup again, please delete the database.");
                }

                server.needSetup = false;
                setupClaimed = true;

                const user = R.dispense("user");
                user.username = username;
                user.password = generatePasswordHash(password);
                await R.store(user);
                await markSetupCompleted();

                callback({
                    ok: true,
                    msg: "successAdded",
                    msgi18n: true,
                });

            } catch (e) {
                if (
                    setupClaimed &&
                    await getAuthMode().catch(() => "local") === "local" &&
                    Number((await R.knex("user").count("id as count").first()).count) === 0
                ) {
                    server.needSetup = true;
                }
                if (e instanceof Error) {
                    callback({
                        ok: false,
                        msg: e.message,
                    });
                }
            }
        });

        socket.on("needSetup", (callback) => {
            if (typeof callback === "function") {
                callback(server.needSetup);
            }
        });

        // Login by token
        socket.on("loginByToken", async (token, callback) => {
            const clientIP = await server.getClientIP(socket);

            log.info("auth", `Login by token. IP=${clientIP}`);

            try {
                if (await getAuthMode() !== "local") {
                    throw new Error("Local authentication is disabled.");
                }
                const decoded = jwt.verify(token, server.jwtSecret) as JWTDecoded;

                log.info("auth", "Username from JWT: " + decoded.username);

                const isFederationToken = decoded.scope === "federation";
                const user = isFederationToken && Number.isInteger(decoded.userId)
                    ? await R.findOne("user", " id = ? AND active = 1 ", [ Number(decoded.userId) ]) as User
                    : await R.findOne("user", " username = ? AND active = 1 ", [ decoded.username ]) as User;

                if (user) {
                    // Check if the password changed
                    if (!isFederationToken && (decoded.h !== passwordVersionFingerprint(user.password, server.jwtSecret) || !interactiveSessionVersionMatches(decoded, { twofa_version: user.twofa_version }))) {
                        throw new Error("The token is invalid due to password change or old token");
                    }

                    log.debug("auth", "afterLogin");
                    await finishLogin(user, isFederationToken);
                    log.debug("auth", "afterLogin ok");

                    log.info("auth", `Successfully logged in user ${user.username}. IP=${clientIP}`);

                    callback({
                        ok: true,
                    });
                } else {

                    log.info("auth", `Inactive or deleted user ${decoded.username}. IP=${clientIP}`);

                    callback({
                        ok: false,
                        msg: "authUserInactiveOrDeleted",
                        msgi18n: true,
                    });
                }
            } catch (error) {
                if (!(error instanceof Error)) {
                    console.error("Unknown error:", error);
                    return;
                }
                log.error("auth", `Invalid token. IP=${clientIP}`);
                if (error.message) {
                    log.error("auth", error.message + ` IP=${clientIP}`);
                }
                callback({
                    ok: false,
                    msg: "authInvalidToken",
                    msgi18n: true,
                });
            }

        });

        // Login
        socket.on("login", async (data, callback) => {
            if (typeof callback !== "function") {
                return;
            }
            try {
                if (!data || typeof data.username !== "string" || typeof data.password !== "string" || await getAuthMode() !== "local") {
                    throw new Error("authIncorrectCreds");
                }
                if (!await loginRateLimiter.pass(callback)) {
                    return;
                }
                const challenged = validLoginChallenge(pendingLogin, data.challenge, data.username, data.password, server.jwtSecret);
                if (data.challenge && !challenged) {
                    throw new Error("twoFactor.restartLogin");
                }
                if (!challenged && !await verifyTurnstile(data.turnstileToken, await server.getClientIP(socket))) {
                    throw new Error("authTurnstileFailed");
                }
                const user = await this.login(data.username, data.password);
                if (!user) {
                    throw new Error("authIncorrectCreds");
                }
                if (user.twofa_status) {
                    if (!data.token) {
                        pendingLogin = createLoginChallenge(data.username, data.password, server.jwtSecret);
                        pendingAccount = { id: user.id,
                            version: Number(user.twofa_version),
                            password: user.password };
                        callback({ tokenRequired: true,
                            challenge: pendingLogin.id });
                        return;
                    }
                    if (challenged && (!pendingAccount || pendingAccount.id !== user.id ||
                        pendingAccount.version !== Number(user.twofa_version) || pendingAccount.password !== user.password)) {
                        throw new Error("twoFactor.restartLogin");
                    }
                    if (!await twoFaRateLimiter.pass(callback)) {
                        return;
                    }
                    await factors.verify(user.id, data.token, { passwordHash: user.password,
                        version: Number(user.twofa_version) });
                }
                pendingLogin = null;
                pendingAccount = null;
                await finishLogin(user);
                callback({ ok: true,
                    token: User.createJWT(user, server.jwtSecret) });
            } catch (error) {
                const message = error instanceof Error ? error.message : "";
                callback({ ok: false,
                    msg: message.startsWith("twoFactor.") || [ "authIncorrectCreds", "authTurnstileFailed" ].includes(message)
                        ? message : "twoFactor.unavailable",
                    msgi18n: true });
            }
        });

        // Change Password
        socket.on("changePassword", async (password, callback) => {
            let release: (() => void) | undefined;
            try {
                checkLogin(socket);

                if (! password.newPassword) {
                    throw new Error("Invalid new password");
                }

                if (passwordStrength(password.newPassword).value === "Too weak") {
                    throw new Error("Password is too weak. It should contain alphabetic and numeric characters. It must be at least 6 characters in length.");
                }

                release = reserveAccountSecurity(socket.userID);
                let user = await doubleCheckPassword(socket, password.currentPassword);
                await user.resetPassword(password.newPassword);

                server.disconnectAllSocketClients(user.id, socket.id);

                callback({
                    ok: true,
                    msg: "Password has been updated successfully.",
                });

            } catch (e) {
                if (e instanceof Error) {
                    callback({
                        ok: false,
                        msg: e.message,
                    });
                }
            } finally {
                release?.();
            }
        });

        socket.on("getSettings", async (callback) => {
            try {
                checkLogin(socket);
                const data = await Settings.getSettings("general");

                if (fs.existsSync(path.join(server.stacksDir, "global.env"))) {
                    data.globalENV = fs.readFileSync(path.join(server.stacksDir, "global.env"), "utf-8");
                } else {
                    data.globalENV = "# VARIABLE=value #comment";
                }

                callback({
                    ok: true,
                    data: data,
                });

            } catch (e) {
                if (e instanceof Error) {
                    callback({
                        ok: false,
                        msg: e.message,
                    });
                }
            }
        });

        socket.on("setSettings", async (data, currentPassword, callback) => {
            try {
                checkLogin(socket);

                if (data.composeTemplate !== undefined) {
                    if (typeof data.composeTemplate !== "string" || Buffer.byteLength(data.composeTemplate, "utf8") > 65536) {
                        throw new ValidationError("Invalid Compose template");
                    }
                    const templateDocument = parseDocument(data.composeTemplate);
                    if (templateDocument.errors.length || !templateDocument.has("services")) {
                        throw new ValidationError("Invalid Compose template");
                    }
                }

                // If currently is disabled auth, don't need to check
                // Disabled Auth + Want to Disable Auth => No Check
                // Disabled Auth + Want to Enable Auth => No Check
                // Enabled Auth + Want to Disable Auth => Check!!
                // Enabled Auth + Want to Enable Auth => No Check
                const currentAuthMode = await getAuthMode();
                if (
                    !process.env.DOCKGE_AUTH_MODE &&
                    currentAuthMode === "local" &&
                    data.disableAuth
                ) {
                    await doubleCheckPassword(socket, currentPassword);
                }
                // Handle global.env
                if (data.globalENV && data.globalENV != "# VARIABLE=value #comment") {
                    await fsAsync.writeFile(path.join(server.stacksDir, "global.env"), data.globalENV);
                } else {
                    await fsAsync.rm(path.join(server.stacksDir, "global.env"), {
                        recursive: true,
                        force: true
                    });
                }
                delete data.globalENV;

                await Settings.setSettings("general", data);

                callback({
                    ok: true,
                    msg: "Saved"
                });

                server.sendInfo(socket);

            } catch (e) {
                if (e instanceof Error) {
                    callback({
                        ok: false,
                        msg: e.message,
                    });
                }
            }
        });

        // Langue de l'interface : mémorisée côté serveur pour que les
        // notifications (Discord/Apprise) suivent la langue du système.
        socket.on("setUILocale", async (locale) => {
            try {
                checkLogin(socket);
                if (typeof locale === "string" && /^[a-zA-Z-]{2,12}$/.test(locale)) {
                    await Settings.set("uiLocale", locale, "general");
                }
            } catch (e) {
                if (e instanceof Error) {
                    log.warn("setUILocale", e.message);
                }
            }
        });

        // Disconnect all other socket clients of the user
        socket.on("disconnectOtherSocketClients", async () => {
            try {
                checkLogin(socket);
                server.disconnectAllSocketClients(socket.userID, socket.id);
            } catch (e) {
                if (e instanceof Error) {
                    log.warn("disconnectOtherSocketClients", e.message);
                }
            }
        });

        // composerize
        socket.on("composerize", async (dockerRunCommand : unknown, callback) => {
            try {
                checkLogin(socket);

                if (typeof(dockerRunCommand) !== "string") {
                    throw new ValidationError("dockerRunCommand must be a string");
                }

                // Option: 'latest' | 'v2x' | 'v3x'
                let composeTemplate = composerize(dockerRunCommand, "", "latest");

                // Remove the first line "name: <your project name>"
                composeTemplate = composeTemplate.split("\n").slice(1).join("\n");

                callback({
                    ok: true,
                    composeTemplate,
                });
            } catch (e) {
                callbackError(e, callback);
            }
        });
    }

    async login(username : string, password : string) : Promise<User | null> {
        if (typeof username !== "string" || typeof password !== "string") {
            return null;
        }

        const user = await R.findOne("user", " username = ? AND active = 1 ", [
            username,
        ]) as User;

        if (user && verifyPassword(password, user.password)) {
            // Upgrade the hash to bcrypt
            if (needRehashPassword(user.password)) {
                user.password = generatePasswordHash(password);
                await R.exec("UPDATE `user` SET password = ? WHERE id = ? ", [
                    user.password,
                    user.id,
                ]);
            }
            return user;
        }

        return null;
    }
}
