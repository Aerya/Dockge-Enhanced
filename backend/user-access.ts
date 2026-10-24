import { R } from "redbean-node";
import type { DockgeSocket } from "./util-server";
import { normalizeGrants, type UserAccess } from "../common/user-access";

export function accessFromUser(value: unknown): UserAccess {
    if (!value || typeof value !== "object") {
        return { role: "restricted",
            grants: [] };
    }
    const user = value as { role?: unknown;
        stack_grants?: unknown };
    // Missing role only occurs with legacy records/tests before the migration.
    if (user.role === undefined || user.role === "admin") {
        return { role: "admin",
            grants: [] };
    }
    if (user.role !== "restricted") {
        return { role: "restricted",
            grants: [] };
    }
    try {
        return { role: "restricted",
            grants: normalizeGrants(JSON.parse(String(user.stack_grants))) };
    } catch {
        return { role: "restricted",
            grants: [] };
    }
}

export async function loadUserAccess(id: number): Promise<UserAccess> {
    const user = await R.findOne("user", " id = ? AND active = 1 ", [ id ]);
    if (!user) {
        throw new Error("access.denied");
    }
    return accessFromUser(user);
}

const PUBLIC_EVENTS = new Set([ "login", "loginByToken", "setup", "needSetup" ]);
const LIMITED_EVENTS = new Set([ "logout", "scopedList", "scopedRequest", "scopedPassword",
    "twoFactor:status", "twoFactor:prepare", "twoFactor:enable", "twoFactor:disable", "twoFactor:regenerate", "twoFactor:cancel" ]);

/** Default-deny gate also covers new handlers and the raw federation proxy. */
export function installUserAccessGuard(socket: DockgeSocket, load = loadUserAccess): void {
    socket.use(async ([ event, ...args ], next) => {
        try {
            if (!socket.userID) {
                if (!PUBLIC_EVENTS.has(event)) {
                    throw new Error("access.denied");
                }
            } else {
                const access = await load(socket.userID);
                if (access.role !== "admin" && !LIMITED_EVENTS.has(event)) {
                    throw new Error("access.denied");
                }
            }
            next();
        } catch {
            const ack = args.at(-1);
            if (typeof ack === "function") {
                ack({ ok: false,
                    msg: "access.denied",
                    msgi18n: true });
            }
            // Do not call next(): no handler (including agent proxy) may run.
        }
    });
    const emit = socket.emit.bind(socket);
    socket.emit = ((event: string, ...args: unknown[]) => {
        if (socket.restrictedUser && ![ "userAccess", "info", "refresh" ].includes(event)) {
            return false;
        }
        return emit(event, ...args);
    }) as typeof socket.emit;
}
