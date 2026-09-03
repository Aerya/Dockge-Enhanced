import type { DockgeServer } from "./dockge-server";
import { Stack } from "./stack";
import { BackupManager, type BackupResult } from "./watchers/backup-manager";
import { ValidationError } from "./util-server";

export type GlobalSearchResultType = "stack" | "compose" | "env" | "backup";

export interface GlobalSearchResult {
    id: string;
    type: GlobalSearchResultType;
    title: string;
    stackName?: string;
    source?: "compose" | "override" | "env";
    line?: number;
    excerpt?: string;
    status?: number;
    timestamp?: string;
}

export interface GlobalSearchResponse {
    results: GlobalSearchResult[];
    truncated: boolean;
}

const MAX_QUERY_LENGTH = 120;
const MAX_RESULT_LIMIT = 100;
const MAX_MATCHES_PER_DOCUMENT = 5;
const SENSITIVE_KEY = /(?:password|passwd|secret|token|api[_-]?key|private[_-]?key|credential|authorization|cookie)/i;
const SEARCH_INDEX_TTL_MS = 5_000;

interface StackSearchDocument {
    stackName: string;
    status: number;
    compose: string;
    override: string;
    envKeys: string[];
}

const searchIndexCache = new WeakMap<DockgeServer, { expiresAt: number; documents: StackSearchDocument[] }>();

export function normalizeGlobalSearchQuery(value: unknown): string {
    if (typeof value !== "string") {
        throw new ValidationError("Search query must be a string");
    }
    const query = value.trim();
    if (query.length < 2) {
        throw new ValidationError("Search query must contain at least 2 characters");
    }
    if (query.length > MAX_QUERY_LENGTH || /[\u0000-\u001f\u007f]/.test(query)) {
        throw new ValidationError("Invalid search query");
    }
    return query;
}

export function extractEnvKeys(content: string): string[] {
    const keys = new Set<string>();
    for (const rawLine of content.split(/\r?\n/)) {
        const line = rawLine.trim();
        if (!line || line.startsWith("#")) continue;
        const separator = line.indexOf("=");
        if (separator <= 0) continue;
        const key = line.slice(0, separator).trim();
        if (/^[A-Za-z_][A-Za-z0-9_.-]*$/.test(key)) keys.add(key);
    }
    return [ ...keys ].sort((a, b) => a.localeCompare(b));
}

export function isSensitiveConfigLine(line: string): boolean {
    const trimmed = line.trim();
    const separator = trimmed.search(/[:=]/);
    if (separator <= 0) return false;
    return SENSITIVE_KEY.test(trimmed.slice(0, separator));
}

function searchableConfigLine(line: string): { search: string; excerpt: string } | null {
    if (isSensitiveConfigLine(line)) return null;

    // Inline environment assignments can contain credentials even when the
    // variable name itself is harmless. Search only the variable name and
    // never its value. The same rule applies to upper-case YAML env keys.
    const listEnv = line.match(/^(\s*-\s*)([A-Za-z_][A-Za-z0-9_.-]*)(\s*=).*/);
    if (listEnv) {
        return { search: listEnv[2], excerpt: `${listEnv[1]}${listEnv[2]}${listEnv[3]}<hidden>` };
    }
    const yamlEnv = line.match(/^(\s*)([A-Z_][A-Z0-9_.-]*)(\s*:).*/);
    if (yamlEnv) {
        return { search: yamlEnv[2], excerpt: `${yamlEnv[1]}${yamlEnv[2]}${yamlEnv[3]} <hidden>` };
    }
    return { search: line, excerpt: line };
}

function cleanExcerpt(line: string): string {
    const collapsed = line.replace(/[\u0000-\u001f\u007f]/g, " ").trim().replace(/\s+/g, " ");
    return collapsed.length > 180 ? `${collapsed.slice(0, 177)}…` : collapsed;
}

export function searchConfigLines(content: string, query: string): Array<{ line: number; excerpt: string }> {
    const needle = query.toLocaleLowerCase();
    const matches: Array<{ line: number; excerpt: string }> = [];
    const lines = content.split(/\r?\n/);
    for (let index = 0; index < lines.length && matches.length < MAX_MATCHES_PER_DOCUMENT; index++) {
        const line = lines[index];
        if (!line.trim()) continue;
        const safeLine = searchableConfigLine(line);
        if (!safeLine || !safeLine.search.toLocaleLowerCase().includes(needle)) continue;
        matches.push({ line: index + 1, excerpt: cleanExcerpt(safeLine.excerpt) });
    }
    return matches;
}

async function getStackSearchDocuments(server: DockgeServer): Promise<StackSearchDocument[]> {
    const now = Date.now();
    const cached = searchIndexCache.get(server);
    if (cached && cached.expiresAt > now) return cached.documents;

    const stacks = await Stack.getStackList(server, false);
    const documents = await Promise.all([ ...stacks.entries() ].map(async ([ stackName, stack ]) => {
        try {
            const data = await stack.toJSON("") as { composeYAML?: string; composeENV?: string; composeOverrideYAML?: string };
            return {
                stackName,
                status: stack.status,
                compose: data.composeYAML ?? "",
                override: data.composeOverrideYAML ?? "",
                envKeys: extractEnvKeys(data.composeENV ?? ""),
            };
        } catch {
            return { stackName, status: stack.status, compose: "", override: "", envKeys: [] };
        }
    }));

    searchIndexCache.set(server, { expiresAt: now + SEARCH_INDEX_TTL_MS, documents });
    return documents;
}

function backupMatches(history: BackupResult, needle: string): boolean {
    const destinations = history.destinations ?? [];
    const haystack = [
        history.snapshotId,
        history.trigger,
        history.timestamp,
        history.success ? "success ok succeeded" : "failed error",
        history.error,
        ...(history.warnings ?? []),
        ...destinations.flatMap(destination => [
            destination.label,
            destination.type,
            destination.snapshotId,
            destination.error,
            ...(destination.warnings ?? []),
        ]),
    ].filter((value): value is string => typeof value === "string").join("\n").toLocaleLowerCase();
    return haystack.includes(needle);
}

function backupExcerpt(history: BackupResult): string {
    const destinations = (history.destinations ?? []).map(destination => destination.label).filter(Boolean).join(", ");
    return [ history.timestamp, history.trigger, destinations || history.snapshotId, history.success ? "OK" : "Error" ]
        .filter(Boolean)
        .join(" · ");
}

export async function runGlobalSearch(server: DockgeServer, queryInput: unknown, limitInput: unknown = 50): Promise<GlobalSearchResponse> {
    const query = normalizeGlobalSearchQuery(queryInput);
    const needle = query.toLocaleLowerCase();
    const parsedLimit = typeof limitInput === "number" && Number.isInteger(limitInput) ? limitInput : 50;
    const limit = Math.max(1, Math.min(parsedLimit, MAX_RESULT_LIMIT));
    const results: GlobalSearchResult[] = [];
    let truncated = false;

    const push = (result: GlobalSearchResult) => {
        if (results.length >= limit) {
            truncated = true;
            return false;
        }
        results.push(result);
        return true;
    };

    const documents = await getStackSearchDocuments(server);
    for (const document of documents) {
        if (results.length >= limit) {
            truncated = true;
            break;
        }
        const { stackName, status } = document;

        if (stackName.toLocaleLowerCase().includes(needle)) {
            push({ id: `stack:${stackName}`, type: "stack", title: stackName, stackName, status });
        }

        for (const sourceDocument of [
            { source: "compose" as const, content: document.compose },
            { source: "override" as const, content: document.override },
        ]) {
            for (const match of searchConfigLines(sourceDocument.content, query)) {
                if (!push({
                    id: `${sourceDocument.source}:${stackName}:${match.line}`,
                    type: "compose",
                    title: stackName,
                    stackName,
                    source: sourceDocument.source,
                    line: match.line,
                    excerpt: match.excerpt,
                    status,
                })) break;
            }
        }

        for (const key of document.envKeys) {
            if (!key.toLocaleLowerCase().includes(needle)) continue;
            if (!push({
                id: `env:${stackName}:${key}`,
                type: "env",
                title: key,
                stackName,
                source: "env",
                excerpt: stackName,
                status,
            })) break;
        }
    }

    if (results.length < limit) {
        const history = BackupManager.getInstance().getHistory();
        for (let index = 0; index < history.length; index++) {
            const item = history[index];
            if (!backupMatches(item, needle)) continue;
            if (!push({
                id: `backup:${item.timestamp}:${item.snapshotId ?? index}`,
                type: "backup",
                title: item.snapshotId ? item.snapshotId.slice(0, 12) : item.timestamp,
                excerpt: backupExcerpt(item),
                timestamp: item.timestamp,
            })) break;
        }
    }

    return { results, truncated };
}
