import { R } from "redbean-node";
import type { DockgeServer } from "./dockge-server";
import { getAuthMode } from "./auth";
import { User } from "./models/user";
import { twoFaRateLimiter } from "./rate-limiter";
import { TwoFactorAuth } from "./two-factor-auth";
import { reserveAccountSecurity } from "./account-security";
import { checkLogin, doubleCheckPassword, type DockgeSocket } from "./util-server";

export function registerTwoFactorHandlers(socket: DockgeSocket, server: DockgeServer): TwoFactorAuth {
    const factors = new TwoFactorAuth(R.knex, server.config.dataDir);
    for (const action of [ "status", "prepare", "enable", "disable", "regenerate", "cancel" ] as const) {
        socket.on(`twoFactor:${action}`, async (request: { password?: unknown;
            code?: unknown } | null, callback) => {
            if (typeof callback !== "function") {
                return;
            }
            let release: (() => void) | undefined;
            try {
                checkLogin(socket);
                if (await getAuthMode() !== "local") {
                    throw new Error("twoFactor.unavailable");
                }
                if (action === "cancel") {
                    factors.forget(socket.id);
                    callback({ ok: true });
                    return;
                }
                if (action === "status") {
                    callback({ ok: true,
                        ...await factors.status(socket.userID) });
                    return;
                }
                if (!await twoFaRateLimiter.pass(callback)) {
                    return;
                }
                release = reserveAccountSecurity(socket.userID);
                // Every security change, including generating a secret, requires reauthentication.
                const authenticated = await doubleCheckPassword(socket, request?.password);
                const credentials = { passwordHash: authenticated.password,
                    version: Number(authenticated.twofa_version) };
                if (action === "prepare") {
                    callback({ ok: true,
                        uri: await factors.prepare(socket.userID, socket.id, credentials) });
                    return;
                }
                let recoveryCodes: string[] | undefined;
                if (action === "enable") {
                    recoveryCodes = await factors.enable(socket.userID, socket.id, request?.code);
                } else if (action === "disable") {
                    await factors.disable(socket.userID, request?.code, credentials);
                } else {
                    recoveryCodes = await factors.regenerate(socket.userID, request?.code, credentials);
                }
                const user = await R.findOne("user", " id = ? AND active = 1 ", [ socket.userID ]) as User;
                if (!user || user.password !== credentials.passwordHash || Number(user.twofa_version) !== credentials.version + 1) {
                    throw new Error("twoFactor.restartLogin");
                }
                server.disconnectAllSocketClients(socket.userID, socket.id, true);
                callback({ ok: true,
                    ...await factors.status(socket.userID),
                    recoveryCodes,
                    token: User.createJWT(user, server.jwtSecret) });
            } catch (error) {
                callback({ ok: false,
                    msg: error instanceof Error && error.message.startsWith("twoFactor.") ? error.message : "twoFactor.changeFailed",
                    msgi18n: true });
            } finally {
                release?.();
            }
        });
    }
    socket.on("disconnect", () => factors.forget(socket.id));
    return factors;
}
