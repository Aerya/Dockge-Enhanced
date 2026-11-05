/** Display preferences only. Membership never grants access to a stack. */
export interface StackIdentity {
    name: string;
    endpoint?: string;
}

export interface StackGroup {
    id: string;
    name: string;
    collapsed: boolean;
    members: string[];
}

export interface StackGroupPreferences {
    enabled: boolean;
    groups: StackGroup[];
}

export function stackIdentity(stack: StackIdentity): string {
    return JSON.stringify([ stack.endpoint || "", stack.name ]);
}

export function stackGroupStorageKey(username: string): string {
    return `stackGroups:v1:${JSON.stringify(username)}`;
}

export function parseStackGroups(raw: string | null): StackGroupPreferences {
    const empty = { enabled: false,
        groups: [] };
    try {
        const value = JSON.parse(raw || "null");
        if (!value || !Array.isArray(value.groups)) {
            return empty;
        }
        const ids = new Set<string>();
        const members = new Set<string>();
        const groups: StackGroup[] = [];
        for (const group of value.groups.slice(0, 100)) {
            if (!group || typeof group.id !== "string" || !group.id || ids.has(group.id)
                || typeof group.name !== "string" || !group.name.trim() || !Array.isArray(group.members)) {
                continue;
            }
            ids.add(group.id);
            const clean: string[] = [];
            for (const member of group.members) {
                if (typeof member !== "string" || members.has(member)) {
                    continue;
                }
                try {
                    const pair: unknown = JSON.parse(member);
                    if (!Array.isArray(pair) || pair.length !== 2 || !pair.every(item => typeof item === "string") || !pair[1]) {
                        continue;
                    }
                    members.add(member);
                    clean.push(member);
                } catch { /* Ignore invalid preferences, never invent a stack. */ }
            }
            groups.push({ id: group.id,
                name: group.name.trim().slice(0, 80),
                collapsed: group.collapsed === true,
                members: clean });
        }
        return { enabled: value.enabled === true,
            groups };
    } catch {
        return empty;
    }
}

/** Input must already be permission-filtered, filtered and sorted by the caller. */
export function groupVisibleStacks<T extends StackIdentity>(stacks: T[], groups: StackGroup[], searching = false) {
    const assigned = new Set<string>();
    const result = groups.map(group => {
        const members = new Set(group.members);
        const visible = stacks.filter(stack => {
            const key = stackIdentity(stack);
            if (!members.has(key) || assigned.has(key)) {
                return false;
            }
            assigned.add(key);
            return true;
        });
        return { id: group.id,
            name: group.name,
            collapsed: group.collapsed && !searching,
            stacks: visible };
    }).filter(group => group.stacks.length > 0);
    const ungrouped = stacks.filter(stack => !assigned.has(stackIdentity(stack)));
    if (ungrouped.length) {
        result.push({ id: "",
            name: "",
            collapsed: false,
            stacks: ungrouped });
    }
    return result;
}

export function assignStackGroup(groups: StackGroup[], stack: StackIdentity, groupId: string): StackGroup[] {
    const key = stackIdentity(stack);
    return groups.map(group => ({ ...group,
        members: [ ...group.members.filter(member => member !== key), ...(group.id === groupId ? [ key ] : []) ] }));
}
