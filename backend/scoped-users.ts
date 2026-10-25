import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { R } from "redbean-node";
import { passwordStrength } from "check-password-strength";
import { AgentSocket } from "../common/agent-socket";
import { canAccess, normalizeGrants, standaloneContainerName, USER_PERMISSIONS, type UserPermission, type UserAccess } from "../common/user-access";
import { loadUserAccess, accessFromUser } from "./user-access";
import type { DockgeSocket } from "./util-server";
import type { DockgeServer } from "./dockge-server";
import { Stack } from "./stack";
import { getAuthMode } from "./auth";
import { generatePasswordHash } from "./password-hash";
import { resolveCurrentContainer } from "./current-container";
import { assertNotSelfStack } from "./stack-pause-policy";
import { reserveAccountSecurity } from "./account-security";
import { AuditLogger } from "./audit-log";
import { registerScopedAccount } from "./scoped-account";
import { actionStandalone, listStandaloneContainers, logsStandalone, viewStandalone } from "./standalone-containers";

const execute = promisify(execFile);
interface ScopedRequest { endpoint: string;
    stack: string;
    service?: string;
    permission: UserPermission }
const ACTION_EVENTS = { start: "startStack",
    stop: "stopStack",
    restart: "restartStack",
    update: "updateStack",
    recreate: "recreateStack" } as const;
const activeRequests = new Set<string>();

export function assertScopedServiceTargets(service: string, targets: string[], managedRelays: string[] = []): void {
    const expected = [ service, ...managedRelays ];
    if (managedRelays.length > 1 || new Set(expected).size !== expected.length ||
        targets.length !== expected.length || targets.some(target => !expected.includes(target))) {
        throw new Error("access.denied");
    }
}

export function assertScopedMutationAccess(access: UserAccess, request: ScopedRequest, targets: string[], managedRelays: string[] = [], delegatedServices?: string[]): void {
    assertScopedServiceTargets(request.service!, targets, managedRelays);
    if (targets.some(target => !canAccess(access, "", request.stack, request.permission, target) ||
        (delegatedServices !== undefined && !delegatedServices.includes(target)))) {
        throw new Error("access.denied");
    }
}

async function remoteRequest(socket: DockgeSocket, request: ScopedRequest): Promise<{ ok: boolean;
    data?: unknown }> {
    // Construct the delegation exclusively from server-side grants, never from
    // a browser-supplied list. The remote agent must constrain relay mutations
    // despite its federation connection being authenticated as administrator.
    const access = await loadUserAccess(socket.userID);
    const delegatedServices = request.service ? [ ...new Set([ request.service, ...access.grants
        .filter(grant => grant.endpoint === request.endpoint && grant.stack === request.stack && grant.service &&
            canAccess(access, request.endpoint, request.stack, request.permission, grant.service))
        .map(grant => grant.service!) ]) ] : [];
    if (request.service && ![ "view", "logs" ].includes(request.permission)) {
        const probe = await remoteRequest(socket, { ...request,
            permission: "view" });
        if (!probe.ok || !canAccess(await loadUserAccess(socket.userID), request.endpoint, request.stack, request.permission, request.service)) {
            throw new Error("access.denied");
        }
    }
    return new Promise((resolve, reject) => {
        const timeout = [ "view", "logs" ].includes(request.permission) ? 30_000 : 30 * 60_000;
        const timer = setTimeout(() => reject(new Error("access.operationFailed")), timeout);
        socket.instanceManager.emitToEndpoint(request.endpoint, request.service ? "scopedServiceRequest" : "scopedStackRequest", { ...request,
            delegatedServices,
            delegatedStack: canAccess(access, request.endpoint, request.stack, request.permission) }, (result: { ok: boolean;
            data?: unknown }) => {
            clearTimeout(timer);
            resolve(result);
        }).catch(error => {
            clearTimeout(timer);
            reject(error);
        });
    });
}

export function parseScopedRequest(value: unknown): ScopedRequest {
    if (!value || typeof value !== "object") {
        throw new Error("access.denied");
    }
    const request = value as ScopedRequest;
    if (!USER_PERMISSIONS.includes(request.permission)) {
        throw new Error("access.denied");
    }
    normalizeGrants([{ endpoint: request.endpoint,
        stack: request.stack,
        ...(request.service !== undefined ? { service: request.service } : {}),
        permissions: [ "view", request.permission ] }]);
    return { endpoint: request.endpoint,
        stack: request.stack,
        ...(request.service ? { service: request.service } : {}),
        permission: request.permission };
}

/** Apply the same allowlist to remote replies; never relay arbitrary agent data. */
export function scopedResponse(request: ScopedRequest, value: unknown): unknown {
    if (!value || typeof value !== "object") {
        throw new Error("access.operationFailed");
    }
    const data = value as Record<string, unknown>;
    if (request.permission === "view" && typeof data.status === "number" && Number.isFinite(data.status)) {
        return { name: request.stack,
            status: data.status,
            displayName: typeof data.displayName === "string" ? data.displayName.slice(0, 256) : request.stack,
            ...(request.service && typeof data.serviceState === "string" ? { serviceState: data.serviceState.slice(0, 64) } : {}) };
    }
    if (request.permission === "logs" && typeof data.logs === "string" && Buffer.byteLength(data.logs) <= 1024 * 1024) {
        return { logs: data.logs };
    }
    if (![ "view", "logs" ].includes(request.permission) && data.applied === true) {
        return { applied: true };
    }
    throw new Error("access.operationFailed");
}

/** Deliberately small response contract, never Compose/env/inspect/host files. */
/** Standalone containers have no Compose definition: only lifecycle and read-only actions exist. */
async function executeStandalone(socket: DockgeSocket, name: string, request: ScopedRequest): Promise<unknown> {
    if (request.service || !canAccess(await loadUserAccess(socket.userID), "", request.stack, request.permission)) {
        throw new Error("access.denied");
    }
    if (request.permission === "view") {
        return viewStandalone(name);
    }
    if (request.permission === "logs") {
        return logsStandalone(name);
    }
    const current = await resolveCurrentContainer();
    await actionStandalone(name, request.permission as "start" | "stop" | "restart", current.Id);
    return { applied: true };
}

export async function executeScopedLocal(socket: DockgeSocket, server: DockgeServer, agent: AgentSocket, request: ScopedRequest, delegatedServices?: string[]): Promise<unknown> {
    const standalone = standaloneContainerName(request.stack);
    if (standalone) {
        return executeStandalone(socket, standalone, request);
    }
    const stack = await Stack.getStack(server, request.stack);
    if (request.service) {
        // Resolve the service from Compose, not from an untrusted container name.
        await stack.getServiceActionTargets(request.service);
    }
    if (request.permission === "view") {
        await stack.updateStatus();
        const summary = stack.toSimpleJSON("") as { status: number;
            displayName?: string };
        return { name: request.stack,
            status: summary.status,
            displayName: summary.displayName || request.stack,
            ...(request.service ? { serviceState: (await stack.getServiceStatusList()).serviceStatusList.get(request.service)?.state || "unknown" } : {}) };
    }
    if (request.permission === "logs") {
        const result = await execute("docker", stack.getComposeOptions("logs", "--no-color", "--tail", "200", ...(request.service ? [ request.service ] : [])), {
            cwd: stack.path,
            timeout: 15_000,
            maxBuffer: 1024 * 1024,
        });
        return { logs: result.stdout };
    }
    // A delegated account must never stop/recreate this management plane.
    const current = await resolveCurrentContainer();
    assertNotSelfStack(current.Id, await stack.getContainerIds());
    if (!canAccess(await loadUserAccess(socket.userID), "", request.stack, request.permission, request.service)) {
        throw new Error("access.denied");
    }
    if (request.service) {
        await stack.serviceAction(socket, request.service, request.permission as "start" | "stop" | "restart" | "update" | "recreate", async (targets, managedRelays = []) => {
            // A service grant cannot mutate namespace dependants, even through
            // an administrator-authenticated federation link. Fail closed.
            assertScopedMutationAccess(await loadUserAccess(socket.userID), request, targets, managedRelays, delegatedServices);
        });
        return { applied: true };
    }
    await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("access.operationFailed")), 30 * 60_000);
        agent.call(ACTION_EVENTS[request.permission as keyof typeof ACTION_EVENTS], request.stack, (result: { ok?: boolean }) => {
            clearTimeout(timer);
            if (result?.ok) {
                resolve();
            } else {
                reject(new Error("access.operationFailed"));
            }
        });
    });
    return { applied: true };
}

export function registerScopedUsers(socket: DockgeSocket, server: DockgeServer, agent: AgentSocket): void {
    registerScopedAccount(socket, server);
    // This handler is accessible over an authenticated admin federation only.
    // A restricted browser cannot enter the raw `agent` proxy at all.
    for (const event of [ "scopedStackRequest", "scopedServiceRequest" ]) {
        agent.on(event, async (payload: unknown, callback) => {
            try {
                if ((await loadUserAccess(socket.userID)).role !== "admin") {
                    throw new Error("access.denied");
                }
                const request = parseScopedRequest(payload);
                const delegation = (payload as { delegatedServices?: unknown }).delegatedServices;
                if (delegation !== undefined && (!Array.isArray(delegation) || delegation.length > 1024 ||
                    delegation.some(value => typeof value !== "string" || !/^[a-zA-Z0-9_.-]+$/.test(value)))) {
                    throw new Error("access.denied");
                }
                // Older peers never delegate sibling services implicitly.
                const wholeStack = (payload as { delegatedStack?: unknown }).delegatedStack === true;
                const services = request.service && !wholeStack ? (delegation as string[] | undefined) ?? [ request.service ] : undefined;
                const data = await executeScopedLocal(socket, server, agent, request, services);
                if (typeof callback === "function") {
                    callback({ ok: true,
                        data });
                }
            } catch {
                if (typeof callback === "function") {
                    callback({ ok: false,
                        msg: "access.operationFailed" });
                }
            }
        });
    }
    socket.on("scopedList", async (callback) => {
        try {
            const access = await loadUserAccess(socket.userID);
            callback({ ok: true,
                data: access.grants });
        } catch {
            if (typeof callback === "function") {
                callback({ ok: false,
                    msg: "access.denied" });
            }
        }
    });
    socket.on("scopedRequest", async (payload: unknown, callback) => {
        let reservation: string | undefined;
        try {
            const request = parseScopedRequest(payload);
            const access = await loadUserAccess(socket.userID);
            if (!canAccess(access, request.endpoint, request.stack, request.permission, request.service)) {
                throw new Error("access.denied");
            }
            const key = JSON.stringify([ socket.userID, request.endpoint, request.stack ]);
            if (activeRequests.has(key)) {
                throw new Error("access.operationFailed");
            }
            activeRequests.add(key);
            reservation = key;
            const data = request.endpoint
                ? await remoteRequest(socket, request)
                : { ok: true,
                    data: await executeScopedLocal(socket, server, agent, request) };
            if (!data.ok) {
                throw new Error("access.operationFailed");
            }
            if (!canAccess(await loadUserAccess(socket.userID), request.endpoint, request.stack, request.permission, request.service)) {
                throw new Error("access.denied");
            }
            if (![ "view", "logs" ].includes(request.permission)) {
                await AuditLogger.getInstance().logFromSocket(socket, {
                    action: `stack.delegated.${request.permission}`,
                    category: "stack",
                    targetType: "stack",
                    target: request.service ? `${request.stack}/${request.service}` : request.stack,
                    endpoint: request.endpoint,
                    status: "success",
                });
            }
            if (typeof callback === "function") {
                callback({ ok: true,
                    data: scopedResponse(request, data.data) });
            }
        } catch {
            // Docker errors can include environment values, paths and Compose.
            if (typeof callback === "function") {
                callback({ ok: false,
                    msg: "access.operationFailed",
                    msgi18n: true });
            }
        } finally {
            if (reservation) {
                activeRequests.delete(reservation);
            }
        }
    });
    // Admin-only picker source: standalone containers of this instance, excluding this management container.
    socket.on("scopedContainerCandidates", async (callback) => {
        try {
            if ((await loadUserAccess(socket.userID)).role !== "admin" || await getAuthMode() !== "local") {
                throw new Error("access.denied");
            }
            const current = await resolveCurrentContainer();
            const names = (await listStandaloneContainers())
                .filter(container => !current.Id || !(container.id.startsWith(current.Id) || current.Id.startsWith(container.id)))
                .map(container => container.name);
            if (typeof callback === "function") {
                callback({ ok: true,
                    data: names });
            }
        } catch {
            if (typeof callback === "function") {
                callback({ ok: false,
                    msg: "access.denied" });
            }
        }
    });
    socket.on("usersList", async (callback) => {
        try {
            if ((await loadUserAccess(socket.userID)).role !== "admin" || await getAuthMode() !== "local") {
                throw new Error("access.denied");
            }
            const rows: { id: number;
                username: string;
                active: number;
                role: string;
                stack_grants: string }[] = await R.knex("user").select("id", "username", "active", "role", "stack_grants");
            callback({ ok: true,
                data: rows.map(row => ({ id: row.id,
                    username: row.username,
                    active: Boolean(row.active),
                    ...accessFromUser(row) })) });
        } catch {
            if (typeof callback === "function") {
                callback({ ok: false,
                    msg: "access.denied" });
            }
        }
    });
    socket.on("usersSave", async (payload: unknown, callback) => {
        let release: (() => void) | undefined;
        try {
            if ((await loadUserAccess(socket.userID)).role !== "admin" || await getAuthMode() !== "local") {
                throw new Error("access.denied");
            }
            const input = payload as { id?: number;
                username: string;
                password?: string;
                active: boolean;
                grants: unknown };
            if (!input || typeof input.username !== "string" || !/^[a-zA-Z0-9_.-]{1,64}$/.test(input.username) || typeof input.active !== "boolean") {
                throw new Error("access.invalid");
            }
            if (input.id !== undefined && (!Number.isSafeInteger(input.id) || input.id <= 0)) {
                throw new Error("access.invalid");
            }
            const grants = normalizeGrants(input.grants);
            if ((!input.id || input.password) && (typeof input.password !== "string" || input.password.length > 256 || passwordStrength(input.password).value === "Too weak")) {
                throw new Error("access.invalid");
            }
            const values = { username: input.username,
                active: input.active ? 1 : 0,
                stack_grants: JSON.stringify(grants),
                ...(input.password ? { password: generatePasswordHash(input.password) } : {}) };
            if (input.id) {
                release = reserveAccountSecurity(input.id);
                // Never modify the current account or any administrator here.
                const count = await R.knex("user").where({ id: input.id,
                    role: "restricted" }).update(values);
                if (!count) {
                    throw new Error("access.denied");
                }
                server.disconnectAllSocketClients(input.id);
            } else {
                await R.knex("user").insert({ ...values,
                    role: "restricted" });
            }
            await AuditLogger.getInstance().logFromSocket(socket, {
                action: input.id ? "user.restricted.update" : "user.restricted.create",
                category: "security",
                targetType: "user",
                target: input.username,
                metadata: { active: input.active,
                    grantCount: grants.length },
            });
            if (typeof callback === "function") {
                callback({ ok: true });
            }
        } catch {
            if (typeof callback === "function") {
                callback({ ok: false,
                    msg: "access.saveFailed",
                    msgi18n: true });
            }
        } finally {
            release?.();
        }
    });
}
