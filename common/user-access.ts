export const USER_PERMISSIONS = [ "view", "logs", "start", "stop", "restart", "update", "recreate" ] as const;
export type UserPermission = typeof USER_PERMISSIONS[number];
export interface StackGrant {
    endpoint: string;
    stack: string;
    service?: string;
    permissions: UserPermission[];
}
export interface UserAccess {
    role: "admin" | "restricted";
    grants: StackGrant[];
}

/** Namespace for standalone (non-Compose) containers; cannot collide with a Compose project name. */
export const STANDALONE_PREFIX = "@container:";
const STANDALONE_PERMISSIONS: readonly UserPermission[] = [ "view", "logs", "start", "stop", "restart" ];

export function standaloneContainerName(stack: string): string | null {
    return stack.startsWith(STANDALONE_PREFIX) ? stack.slice(STANDALONE_PREFIX.length) : null;
}

export function normalizeGrants(value: unknown): StackGrant[] {
    if (!Array.isArray(value) || value.length > 200) {
        throw new Error("access.invalid");
    }
    const seen = new Set<string>();
    return value.map(entry => {
        if (!entry || typeof entry !== "object" || typeof entry.endpoint !== "string" ||
            entry.endpoint.length > 255 || /[\s/\\\u0000-\u001f]/.test(entry.endpoint) ||
            typeof entry.stack !== "string" ||
            (entry.service !== undefined && (typeof entry.service !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/.test(entry.service))) ||
            !Array.isArray(entry.permissions) || !entry.permissions.includes("view") ||
            entry.permissions.some((p: unknown) => !USER_PERMISSIONS.includes(p as UserPermission))) {
            throw new Error("access.invalid");
        }
        const container = standaloneContainerName(entry.stack);
        const valid = container !== null
            // A standalone container is local only, has no service scope and cannot be updated or recreated.
            ? /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/.test(container) && entry.endpoint === "" && entry.service === undefined &&
                entry.permissions.every((p: unknown) => STANDALONE_PERMISSIONS.includes(p as UserPermission))
            : /^[a-z0-9][a-z0-9_-]*$/.test(entry.stack) && entry.stack.length <= 128;
        if (!valid) {
            throw new Error("access.invalid");
        }
        const key = JSON.stringify([ entry.endpoint, entry.stack, entry.service || "" ]);
        if (seen.has(key)) {
            throw new Error("access.invalid");
        }
        seen.add(key);
        return { endpoint: entry.endpoint,
            stack: entry.stack,
            ...(entry.service ? { service: entry.service } : {}),
            permissions: [ ...new Set<UserPermission>(entry.permissions) ] };
    });
}

export function canAccess(access: UserAccess, endpoint: string, stack: string, permission: UserPermission, service?: string): boolean {
    return access.role === "admin" || access.grants.some(grant => grant.endpoint === endpoint && grant.stack === stack && (!grant.service || grant.service === service) && grant.permissions.includes(permission));
}
