export const USER_PERMISSIONS = [ "view", "logs", "start", "stop", "restart", "update", "recreate" ] as const;
export type UserPermission = typeof USER_PERMISSIONS[number];
export interface StackGrant {
    endpoint: string;
    stack: string;
    permissions: UserPermission[];
}
export interface UserAccess {
    role: "admin" | "restricted";
    grants: StackGrant[];
}

export function normalizeGrants(value: unknown): StackGrant[] {
    if (!Array.isArray(value) || value.length > 200) {
        throw new Error("access.invalid");
    }
    const seen = new Set<string>();
    return value.map(entry => {
        if (!entry || typeof entry !== "object" || typeof entry.endpoint !== "string" ||
            entry.endpoint.length > 255 || /[\s/\\\u0000-\u001f]/.test(entry.endpoint) ||
            typeof entry.stack !== "string" || !/^[a-z0-9][a-z0-9_-]*$/.test(entry.stack) || entry.stack.length > 128 ||
            !Array.isArray(entry.permissions) || !entry.permissions.includes("view") ||
            entry.permissions.some((p: unknown) => !USER_PERMISSIONS.includes(p as UserPermission))) {
            throw new Error("access.invalid");
        }
        const key = JSON.stringify([ entry.endpoint, entry.stack ]);
        if (seen.has(key)) {
            throw new Error("access.invalid");
        }
        seen.add(key);
        return { endpoint: entry.endpoint,
            stack: entry.stack,
            permissions: [ ...new Set<UserPermission>(entry.permissions) ] };
    });
}

export function canAccess(access: UserAccess, endpoint: string, stack: string, permission: UserPermission): boolean {
    return access.role === "admin" || access.grants.some(grant => grant.endpoint === endpoint && grant.stack === stack && grant.permissions.includes(permission));
}
