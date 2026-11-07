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
    parentId?: string;
}

export const MAX_STACK_GROUP_DEPTH = 4; // Root plus four nested levels.

function validParentChain(group: StackGroup, groups: StackGroup[]): boolean {
    const visited = new Set([ group.id ]);
    let parentId = group.parentId;
    while (parentId) {
        if (visited.has(parentId) || visited.size > MAX_STACK_GROUP_DEPTH) {
            return false;
        }
        visited.add(parentId);
        const parent = groups.find(item => item.id === parentId);
        if (!parent) {
            return false;
        }
        parentId = parent.parentId;
    }
    return true;
}

export function canReparentStackGroup(groups: StackGroup[], id: string, parentId: string): boolean {
    if (!groups.some(group => group.id === id)) {
        return false;
    }
    const next = groups.map(group => group.id === id ? { ...group,
        parentId } : group);
    return next.every(group => validParentChain(group, next));
}

export function stackGroupPath(groups: StackGroup[], id: string): string {
    const names: string[] = [];
    const visited = new Set<string>();
    let group = groups.find(item => item.id === id);
    while (group && !visited.has(group.id)) {
        visited.add(group.id);
        names.unshift(group.name);
        group = groups.find(item => item.id === group?.parentId);
    }
    return names.join(" / ");
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
                members: clean,
                ...(typeof group.parentId === "string" && group.parentId ? { parentId: group.parentId } : {}) });
        }
        // Reads recover old/corrupt data safely; the store rejects altered writes.
        const invalid = groups.filter(group => !validParentChain(group, groups));
        for (const group of invalid) {
            delete group.parentId;
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
    const rows = groups.map(group => {
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
            parentId: group.parentId || "",
            collapsed: group.collapsed && !searching,
            stacks: visible,
            depth: 0,
            descendantStacks: [] as T[] };
    });
    const result: typeof rows = [];
    const visited = new Set<string>();
    const visit = (parentId: string, depth: number): typeof rows => rows.filter(row => row.parentId === parentId && !visited.has(row.id)).flatMap(row => {
        visited.add(row.id);
        row.depth = depth;
        const children = visit(row.id, depth + 1);
        row.descendantStacks = [ ...row.stacks, ...children.filter(child => child.parentId === row.id).flatMap(child => child.descendantStacks) ];
        return row.descendantStacks.length ? [ row, ...children ] : [];
    });
    const tree = visit("", 0);
    let hiddenBelow = Number.POSITIVE_INFINITY;
    for (const row of tree) {
        if (row.depth > hiddenBelow) {
            continue;
        }
        result.push(row);
        hiddenBelow = row.collapsed ? row.depth : Number.POSITIVE_INFINITY;
    }
    const ungrouped = stacks.filter(stack => !assigned.has(stackIdentity(stack)));
    if (ungrouped.length) {
        result.push({ id: "",
            name: "",
            parentId: "",
            collapsed: false,
            depth: 0,
            descendantStacks: ungrouped,
            stacks: ungrouped });
    }
    return result;
}

export function assignStackGroup(groups: StackGroup[], stack: StackIdentity, groupId: string): StackGroup[] {
    const key = stackIdentity(stack);
    return groups.map(group => ({ ...group,
        members: [ ...group.members.filter(member => member !== key), ...(group.id === groupId ? [ key ] : []) ] }));
}

/** Explicit legacy import: existing server names, states and assignments win. */
export function importStackGroups(current: StackGroupPreferences, legacy: StackGroupPreferences): StackGroupPreferences {
    const merged = structuredClone(current);
    const assigned = new Set(merged.groups.flatMap(group => group.members));
    for (const source of legacy.groups) {
        let target = merged.groups.find(group => group.id === source.id);
        if (!target) {
            if (merged.groups.length >= 100) {
                throw new Error("stackGroups.importLimit");
            }
            target = { ...source,
                members: [] };
            merged.groups.push(target);
        }
        for (const member of source.members) {
            if (!assigned.has(member)) {
                target.members.push(member);
                assigned.add(member);
            }
        }
    }
    if (current.groups.length === 0 && legacy.groups.length > 0) {
        merged.enabled = legacy.enabled;
    }
    return merged;
}
