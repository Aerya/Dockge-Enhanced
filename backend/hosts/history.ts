import type { HostPackage } from "./report";
export function packageChanges(before: HostPackage[], after: HostPackage[]) {
    const previous = new Map(before.map(p => [ `${p.name}:${p.arch}`, p ]));
    const current = new Map(after.map(p => [ `${p.name}:${p.arch}`, p ]));
    const changes: Array<{ name: string;
        arch: string;
        before: string | null;
        after: string | null }> = [];
    for (const [ key, p ] of current) {
        const old = previous.get(key);
        if (!old || old.version !== p.version) {
            changes.push({ name: p.name,
                arch: p.arch,
                before: old?.version ?? null,
                after: p.version });
        }
    }
    for (const [ key, p ] of previous) {
        if (!current.has(key)) {
            changes.push({ name: p.name,
                arch: p.arch,
                before: p.version,
                after: null });
        }
    }
    return { total: changes.length,
        changes: changes.slice(0, 500) };
}
