import { R } from "redbean-node";
import { passwordStrength } from "check-password-strength";
import { getAuthMode } from "./auth";
import { reserveAccountSecurity } from "./account-security";
import { loadUserAccess } from "./user-access";
import { User } from "./models/user";
import { TwoFactorAuth } from "./two-factor-auth";
import { twoFaRateLimiter } from "./rate-limiter";
import { doubleCheckPassword, type DockgeSocket } from "./util-server";
import type { DockgeServer } from "./dockge-server";
import { AuditLogger } from "./audit-log";

export function registerScopedAccount(socket: DockgeSocket, server: DockgeServer): void {
    socket.on("scopedPassword", async (input: { currentPassword?: unknown;
        newPassword?: unknown;
        code?: unknown } | null, callback) => {
        if (typeof callback !== "function") {
            return;
        }
        let release: (() => void) | undefined;
        try {
            await loadUserAccess(socket.userID);
            if (await getAuthMode() !== "local") {
                throw new Error("access.denied");
            }
            if (!await twoFaRateLimiter.pass(callback)) {
                return;
            }
            if (typeof input?.newPassword !== "string" || input.newPassword.length > 256 || passwordStrength(input.newPassword).value === "Too weak") {
                throw new Error("access.invalid");
            }
            release = reserveAccountSecurity(socket.userID);
            const user = await doubleCheckPassword(socket, input.currentPassword);
            if (user.twofa_status) {
                await new TwoFactorAuth(R.knex, server.config.dataDir).verify(socket.userID, input.code, { passwordHash: user.password,
                    version: Number(user.twofa_version) });
            }
            // Identity is always the authenticated socket, never a request user ID.
            await User.resetPassword(socket.userID, input.newPassword);
            const updated = await R.findOne("user", " id = ? AND active = 1 ", [ socket.userID ]) as User;
            server.disconnectAllSocketClients(socket.userID, socket.id);
            await AuditLogger.getInstance().logFromSocket(socket, { action: "user.password.change",
                category: "security",
                targetType: "user",
                target: String(socket.userID) });
            callback({ ok: true,
                token: User.createJWT(updated, server.jwtSecret) });
        } catch {
            callback({ ok: false,
                msg: "access.accountFailed",
                msgi18n: true });
        } finally {
            release?.();
        }
    });

    socket.on("usersAccountAction", async (input: { id?: unknown;
        action?: unknown;
        password?: unknown;
        code?: unknown;
        confirm?: unknown } | null, callback) => {
        if (typeof callback !== "function") {
            return;
        }
        let release: (() => void) | undefined;
        let releaseAdmin: (() => void) | undefined;
        try {
            if ((await loadUserAccess(socket.userID)).role !== "admin" || await getAuthMode() !== "local") {
                throw new Error("access.denied");
            }
            if (!input || !Number.isSafeInteger(input.id) || Number(input.id) <= 0 || input.id === socket.userID || ![ "delete", "reset2fa" ].includes(String(input.action)) || input.confirm !== true) {
                throw new Error("access.invalid");
            }
            if (!await twoFaRateLimiter.pass(callback)) {
                return;
            }
            releaseAdmin = reserveAccountSecurity(socket.userID);
            const admin = await doubleCheckPassword(socket, input.password);
            if (admin.twofa_status) {
                await new TwoFactorAuth(R.knex, server.config.dataDir).verify(socket.userID, input.code, { passwordHash: admin.password,
                    version: Number(admin.twofa_version) });
            }
            const id = Number(input.id);
            release = reserveAccountSecurity(id);
            const target = R.knex("user").where({ id,
                role: "restricted" });
            const count = input.action === "delete" ? await target.delete() : await target.update({
                twofa_status: 0,
                twofa_secret: null,
                twofa_secret_encrypted: null,
                twofa_recovery_hashes: null,
                twofa_last_counter: -1,
                twofa_last_token: null,
                twofa_version: R.knex.raw("twofa_version + 1"),
            });
            if (count !== 1) {
                throw new Error("access.denied");
            }
            server.disconnectAllSocketClients(id);
            await AuditLogger.getInstance().logFromSocket(socket, { action: `user.restricted.${input.action}`,
                category: "security",
                targetType: "user",
                target: String(id) });
            callback({ ok: true });
        } catch {
            callback({ ok: false,
                msg: "access.accountFailed",
                msgi18n: true });
        } finally {
            release?.();
            releaseAdmin?.();
        }
    });
}
