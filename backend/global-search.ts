import type { DockgeServer } from "./dockge-server";
import { Stack } from "./stack";
import { BackupManager, type BackupResult, type BackupSearchDocument } from "./watchers/backup-manager";
import { imageStatusStore } from "./watchers/image-watcher";
import { TrivyScanner } from "./watchers/trivy-scanner";
import { statusNameShort } from "../common/util-common";
import { ValidationError } from "./util-server";

export type GlobalSearchResultType = "stack" | "compose" | "env" | "backup";
export type GlobalSearchDiagnostic = "update" | "stopped" | "inactive" | "vulnerable" | "critical" | "backup-failed";

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
    snapshotId?: string;
    historical?: boolean;
    envValueMatch?: boolean;
    diagnostic?: GlobalSearchDiagnostic;
    diagnosticCount?: number;
    score?: number;
}

export interface GlobalSearchResponse {
    protocol: 2;
    results: GlobalSearchResult[];
    truncated: boolean;
    snapshotSearchTruncated?: boolean;
}

export interface GlobalSearchV2Request {
    query: unknown;
    limit?: unknown;
    includeEnvValues?: unknown;
    searchSnapshots?: unknown;
}

type SearchTypeFilter = GlobalSearchResultType | "config";
type DiagnosticFilter = "update" | "stopped" | "inactive" | "vulnerable" | "critical" | "backup-failed";

export interface ParsedGlobalSearchQuery {
    raw: string;
    terms: string[];
    type?: SearchTypeFilter;
    stack?: string;
    image?: string;
    port?: string;
    diagnostics: DiagnosticFilter[];
}

export interface EnvEntry {
    key: string;
    value: string;
    line: number;
}

const MAX_QUERY_LENGTH = 180;
const MAX_RESULT_LIMIT = 100;
const MAX_MATCHES_PER_DOCUMENT = 5;
const SENSITIVE_KEY = /(?:password|passwd|secret|token|api[_-]?key|private[_-]?key|credential|authorization|cookie)/i;
const SEARCH_INDEX_TTL_MS = 5_000;
const ALLOWED_DIAGNOSTICS = new Set<DiagnosticFilter>([ "update", "stopped", "inactive", "vulnerable", "critical", "backup-failed" ]);
const ALLOWED_TYPES = new Set<SearchTypeFilter>([ "stack", "compose", "env", "backup", "config" ]);

interface StackSearchDocument {
    stackName: string;
    status: number;
    compose: string;
    override: string;
    envEntries: EnvEntry[];
}

interface ScoredResult {
    result: GlobalSearchResult;
    score: number;
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

function queryTokens(query: string): string[] {
    const tokens: string[] = [];
    const re = /"([^"]+)"|'([^']+)'|(\S+)/g;
    let match: RegExpExecArray | null;
    while ((match = re.exec(query))) {
        tokens.push(match[1] ?? match[2] ?? match[3]);
    }
    return tokens;
}

export function parseGlobalSearchQuery(value: unknown): ParsedGlobalSearchQuery {
    const raw = normalizeGlobalSearchQuery(value);
    const parsed: ParsedGlobalSearchQuery = { raw, terms: [], diagnostics: [] };

    for (const token of queryTokens(raw)) {
        const operator = token.match(/^(type|stack|image|port|is):(.+)$/i);
        if (!operator) {
            parsed.terms.push(token);
            continue;
        }
        const name = operator[1].toLocaleLowerCase();
        const operand = operator[2].trim();
        if (!operand) continue;
        if (name === "type") {
            const normalized = operand.toLocaleLowerCase() === "variables" ? "env" : operand.toLocaleLowerCase();
            if (ALLOWED_TYPES.has(normalized as SearchTypeFilter)) parsed.type = normalized as SearchTypeFilter;
            else parsed.terms.push(token);
        } else if (name === "stack") {
            parsed.stack = operand;
        } else if (name === "image") {
            parsed.image = operand;
        } else if (name === "port") {
            parsed.port = operand;
        } else if (name === "is") {
            const diagnostic = operand.toLocaleLowerCase() as DiagnosticFilter;
            if (ALLOWED_DIAGNOSTICS.has(diagnostic) && !parsed.diagnostics.includes(diagnostic)) parsed.diagnostics.push(diagnostic);
            else parsed.terms.push(token);
        }
    }
    return parsed;
}

export function extractEnvEntries(content: string): EnvEntry[] {
    const entries: EnvEntry[] = [];
    const seen = new Set<string>();
    const lines = content.split(/\r?\n/);
    for (let index = 0; index < lines.length; index++) {
        const line = lines[index].trim();
        if (!line || line.startsWith("#")) continue;
        const separator = line.indexOf("=");
        if (separator <= 0) continue;
        const key = line.slice(0, separator).trim();
        if (!/^[A-Za-z_][A-Za-z0-9_.-]*$/.test(key) || seen.has(key)) continue;
        seen.add(key);
        entries.push({ key, value: line.slice(separator + 1), line: index + 1 });
    }
    return entries.sort((a, b) => a.key.localeCompare(b.key));
}

export function extractEnvKeys(content: string): string[] {
    return extractEnvEntries(content).map(entry => entry.key);
}

export function isSensitiveConfigLine(line: string): boolean {
    const trimmed = line.trim();
    const separator = trimmed.search(/[:=]/);
    if (separator <= 0) return false;
    return SENSITIVE_KEY.test(trimmed.slice(0, separator));
}

function searchableConfigLine(line: string): { search: string; excerpt: string } | null {
    if (isSensitiveConfigLine(line)) return null;

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

function normalized(value: string): string {
    return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase();
}

export function boundedEditDistance(aInput: string, bInput: string, maxDistance = 2): number {
    const a = normalized(aInput);
    const b = normalized(bInput);
    if (Math.abs(a.length - b.length) > maxDistance) return maxDistance + 1;
    const previous = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
        const current = [ i ];
        let rowMin = current[0];
        for (let j = 1; j <= b.length; j++) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1;
            current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + cost);
            rowMin = Math.min(rowMin, current[j]);
        }
        if (rowMin > maxDistance) return maxDistance + 1;
        previous.splice(0, previous.length, ...current);
    }
    return previous[b.length];
}

export function fuzzyScore(haystackInput: string, needleInput: string): number {
    const haystack = normalized(haystackInput);
    const needle = normalized(needleInput);
    if (!needle) return 1;
    if (haystack === needle) return 1000;
    if (haystack.startsWith(needle)) return 900 - Math.min(100, haystack.length - needle.length);
    const includeAt = haystack.indexOf(needle);
    if (includeAt >= 0) return 800 - Math.min(150, includeAt);

    const words = haystack.split(/[^a-z0-9_]+/).filter(Boolean);
    const threshold = needle.length >= 7 ? 2 : 1;
    let best = 0;
    for (const word of words) {
        const distance = boundedEditDistance(word, needle, threshold);
        if (distance <= threshold) best = Math.max(best, 650 - distance * 90 - Math.abs(word.length - needle.length) * 10);
    }
    return best;
}

function scoreTerms(haystack: string, terms: string[]): number {
    if (terms.length === 0) return 1;
    let total = 0;
    for (const term of terms) {
        const score = fuzzyScore(haystack, term);
        if (score <= 0) return 0;
        total += score;
    }
    return total;
}

export function searchConfigLines(content: string, query: string): Array<{ line: number; excerpt: string }> {
    return searchConfigLinesV2(content, [ query ]).map(({ line, excerpt }) => ({ line, excerpt }));
}

export function searchConfigLinesV2(content: string, terms: string[]): Array<{ line: number; excerpt: string; score: number }> {
    const matches: Array<{ line: number; excerpt: string; score: number }> = [];
    const lines = content.split(/\r?\n/);
    for (let index = 0; index < lines.length; index++) {
        const line = lines[index];
        if (!line.trim()) continue;
        const safeLine = searchableConfigLine(line);
        if (!safeLine) continue;
        const score = scoreTerms(safeLine.search, terms);
        if (score <= 0) continue;
        matches.push({ line: index + 1, excerpt: cleanExcerpt(safeLine.excerpt), score });
    }
    return matches.sort((a, b) => b.score - a.score).slice(0, MAX_MATCHES_PER_DOCUMENT);
}

export function searchImageLines(content: string, image: string): Array<{ line: number; excerpt: string; score: number }> {
    const matches: Array<{ line: number; excerpt: string; score: number }> = [];
    for (const [ index, line ] of content.split(/\r?\n/).entries()) {
        if (isSensitiveConfigLine(line)) continue;
        const match = line.match(/^\s*image\s*:\s*(.+?)\s*$/i);
        if (!match) continue;
        const score = fuzzyScore(match[1].replace(/^['"]|['"]$/g, ""), image);
        if (score > 0) matches.push({ line: index + 1, excerpt: cleanExcerpt(line), score: score + 100 });
    }
    return matches.sort((a, b) => b.score - a.score).slice(0, MAX_MATCHES_PER_DOCUMENT);
}

export function searchPortLines(content: string, port: string): Array<{ line: number; excerpt: string; score: number }> {
    const matches: Array<{ line: number; excerpt: string; score: number }> = [];
    const lines = content.split(/\r?\n/);
    let portsIndent: number | null = null;
    for (let index = 0; index < lines.length; index++) {
        const line = lines[index];
        if (!line.trim() || line.trim().startsWith("#")) continue;
        const indent = line.match(/^\s*/)?.[0].length ?? 0;
        if (/^\s*ports\s*:/i.test(line)) {
            portsIndent = indent;
            const inlineScore = fuzzyScore(line, port);
            if (inlineScore > 0) matches.push({ line: index + 1, excerpt: cleanExcerpt(line), score: inlineScore + 100 });
            continue;
        }
        if (portsIndent !== null && indent <= portsIndent && !/^\s*-/.test(line)) portsIndent = null;
        if (portsIndent === null || indent <= portsIndent) continue;
        const score = fuzzyScore(line, port);
        if (score > 0) matches.push({ line: index + 1, excerpt: cleanExcerpt(line), score: score + 100 });
    }
    return matches.sort((a, b) => b.score - a.score).slice(0, MAX_MATCHES_PER_DOCUMENT);
}

async function getStackSearchDocuments(server: DockgeServer): Promise<StackSearchDocument[]> {
    const now = Date.now();
    const cached = searchIndexCache.get(server);
    if (cached && cached.expiresAt > now) return cached.documents;

    const stacks = await Stack.getStackList(server, false);
    const documents = await Promise.all([ ...stacks.entries() ].map(async ([ stackName, stack ]) => {
        try {
            const data = await stack.toJSON("") as { composeYAML?: string; composeENV?: string; composeOverrideYAML?: string; isExternal?: boolean };
            return {
                stackName,
                status: stack.status,
                compose: data.composeYAML ?? "",
                override: data.isExternal ? "" : (data.composeOverrideYAML ?? ""),
                envEntries: extractEnvEntries(data.composeENV ?? ""),
            };
        } catch {
            return { stackName, status: stack.status, compose: "", override: "", envEntries: [] };
        }
    }));

    searchIndexCache.set(server, { expiresAt: now + SEARCH_INDEX_TTL_MS, documents });
    return documents;
}

function backupHaystack(history: BackupResult): string {
    const destinations = history.destinations ?? [];
    return [
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
    ].filter((value): value is string => typeof value === "string").join("\n");
}

function backupExcerpt(history: BackupResult): string {
    const destinations = (history.destinations ?? []).map(destination => destination.label).filter(Boolean).join(", ");
    return [ history.timestamp, history.trigger, destinations || history.snapshotId, history.success ? "OK" : "Error" ]
        .filter(Boolean)
        .join(" · ");
}

function matchesStackFilter(stackName: string, stackFilter?: string): boolean {
    return !stackFilter || fuzzyScore(stackName, stackFilter) > 0;
}

function stackDiagnostic(document: StackSearchDocument, parsed: ParsedGlobalSearchQuery): { ok: boolean; diagnostic?: GlobalSearchDiagnostic; count?: number; bonus: number } {
    const stackStatus = statusNameShort(document.status);
    const updates = [ ...imageStatusStore.values() ].filter(item => item.stack === document.stackName && item.hasUpdate && !item.error && !item.ignored).length;
    const trivyResults = TrivyScanner.getInstance().getStatus().lastResults.filter(item => item.stack === document.stackName);
    const vulnerabilityCount = trivyResults.reduce((total, item) =>
        total + Object.values(item.counts ?? {}).reduce<number>((sum, value) => sum + Number(value || 0), 0), 0);
    const criticalCount = trivyResults.reduce((total, item) => total + Number(item.counts?.CRITICAL ?? 0), 0);

    let diagnostic: GlobalSearchDiagnostic | undefined;
    let count: number | undefined;
    let bonus = 0;
    for (const state of parsed.diagnostics.filter(item => item !== "backup-failed")) {
        if (state === "update") {
            if (updates <= 0) return { ok: false, bonus: 0 };
            diagnostic = "update"; count = updates; bonus += 220;
        } else if (state === "stopped") {
            if (stackStatus !== "exited") return { ok: false, bonus: 0 };
            diagnostic = "stopped"; bonus += 220;
        } else if (state === "inactive") {
            if (stackStatus !== "inactive") return { ok: false, bonus: 0 };
            diagnostic = "inactive"; bonus += 220;
        } else if (state === "vulnerable") {
            if (vulnerabilityCount <= 0) return { ok: false, bonus: 0 };
            diagnostic = "vulnerable"; count = vulnerabilityCount; bonus += 220;
        } else if (state === "critical") {
            if (criticalCount <= 0) return { ok: false, bonus: 0 };
            diagnostic = "critical"; count = criticalCount; bonus += 260;
        }
    }
    return { ok: true, diagnostic, count, bonus };
}

function envResultScore(entry: EnvEntry, terms: string[], includeValues: boolean): { score: number; valueMatch: boolean } {
    if (terms.length === 0) return { score: 1, valueMatch: false };
    let score = 0;
    let valueMatch = false;
    for (const term of terms) {
        const keyScore = fuzzyScore(entry.key, term);
        if (keyScore > 0) {
            score += keyScore;
            continue;
        }
        if (includeValues && normalized(entry.value).includes(normalized(term))) {
            score += 350;
            valueMatch = true;
            continue;
        }
        return { score: 0, valueMatch: false };
    }
    return { score, valueMatch };
}

function searchSnapshotDocument(document: BackupSearchDocument, parsed: ParsedGlobalSearchQuery, includeEnvValues: boolean): ScoredResult[] {
    if (!matchesStackFilter(document.stackName, parsed.stack)) return [];
    if (parsed.terms.length === 0 && !parsed.image && !parsed.port) return [];
    const results: ScoredResult[] = [];
    if (document.source === "env") {
        if (parsed.type && parsed.type !== "env" && parsed.type !== "backup") return [];
        for (const entry of extractEnvEntries(document.content)) {
            const match = envResultScore(entry, parsed.terms, includeEnvValues);
            if (match.score <= 0) continue;
            results.push({
                score: match.score + 80,
                result: {
                    id: `backup-config:${document.snapshotId}:${document.stackName}:env:${entry.line}`,
                    type: "backup",
                    title: entry.key,
                    stackName: document.stackName,
                    source: "env",
                    line: entry.line,
                    excerpt: document.snapshotId.slice(0, 12),
                    timestamp: document.timestamp,
                    snapshotId: document.snapshotId,
                    historical: true,
                    envValueMatch: match.valueMatch,
                },
            });
        }
        return results;
    }

    if (parsed.type && parsed.type !== "compose" && parsed.type !== "backup") return [];
    let matches = parsed.image
        ? searchImageLines(document.content, parsed.image)
        : parsed.port
            ? searchPortLines(document.content, parsed.port)
            : searchConfigLinesV2(document.content, parsed.terms);
    matches = matches.slice(0, MAX_MATCHES_PER_DOCUMENT);
    for (const match of matches) {
        results.push({
            score: match.score + 80,
            result: {
                id: `backup-config:${document.snapshotId}:${document.stackName}:${document.source}:${match.line}`,
                type: "backup",
                title: document.stackName,
                stackName: document.stackName,
                source: document.source,
                line: match.line,
                excerpt: match.excerpt,
                timestamp: document.timestamp,
                snapshotId: document.snapshotId,
                historical: true,
            },
        });
    }
    return results;
}

export async function runGlobalSearchV2(server: DockgeServer, requestInput: GlobalSearchV2Request): Promise<GlobalSearchResponse> {
    const parsed = parseGlobalSearchQuery(requestInput?.query);
    const parsedLimit = typeof requestInput?.limit === "number" && Number.isInteger(requestInput.limit) ? requestInput.limit : 50;
    const limit = Math.max(1, Math.min(parsedLimit, MAX_RESULT_LIMIT));
    const includeEnvValues = requestInput?.includeEnvValues === true;
    const searchSnapshots = requestInput?.searchSnapshots === true;
    const scored: ScoredResult[] = [];

    const documents = await getStackSearchDocuments(server);
    const wantsOnlyBackups = parsed.type === "backup" || parsed.diagnostics.includes("backup-failed");

    if (!wantsOnlyBackups && parsed.type !== "config") {
        for (const document of documents) {
            if (!matchesStackFilter(document.stackName, parsed.stack)) continue;
            const diagnostic = stackDiagnostic(document, parsed);
            if (!diagnostic.ok) continue;

            const stackScore = scoreTerms(document.stackName, parsed.terms);
            if ((!parsed.type || parsed.type === "stack") && !parsed.image && !parsed.port && (stackScore > 0 || parsed.diagnostics.length > 0)) {
                scored.push({
                    score: stackScore + diagnostic.bonus + (parsed.stack ? 100 : 0),
                    result: {
                        id: `stack:${document.stackName}`,
                        type: "stack",
                        title: document.stackName,
                        stackName: document.stackName,
                        status: document.status,
                        diagnostic: diagnostic.diagnostic,
                        diagnosticCount: diagnostic.count,
                    },
                });
            }

            if ((!parsed.type || parsed.type === "compose") && (parsed.terms.length > 0 || parsed.image || parsed.port)) {
                for (const sourceDocument of [
                    { source: "compose" as const, content: document.compose },
                    { source: "override" as const, content: document.override },
                ]) {
                    const matches = parsed.image
                        ? searchImageLines(sourceDocument.content, parsed.image)
                        : parsed.port
                            ? searchPortLines(sourceDocument.content, parsed.port)
                            : searchConfigLinesV2(sourceDocument.content, parsed.terms);
                    for (const match of matches) {
                        const extraScore = (parsed.image || parsed.port) && parsed.terms.length > 0
                            ? scoreTerms(`${document.stackName} ${match.excerpt}`, parsed.terms)
                            : 0;
                        if ((parsed.image || parsed.port) && parsed.terms.length > 0 && extraScore <= 0) continue;
                        scored.push({
                            score: match.score + extraScore + (parsed.stack ? 100 : 0),
                            result: {
                                id: `${sourceDocument.source}:${document.stackName}:${match.line}`,
                                type: "compose",
                                title: document.stackName,
                                stackName: document.stackName,
                                source: sourceDocument.source,
                                line: match.line,
                                excerpt: match.excerpt,
                                status: document.status,
                            },
                        });
                    }
                }
            }

            if ((!parsed.type || parsed.type === "env") && !parsed.image && !parsed.port && parsed.terms.length > 0) {
                for (const entry of document.envEntries) {
                    const match = envResultScore(entry, parsed.terms, includeEnvValues);
                    if (match.score <= 0) continue;
                    scored.push({
                        score: match.score + (parsed.stack ? 100 : 0),
                        result: {
                            id: `env:${document.stackName}:${entry.key}`,
                            type: "env",
                            title: entry.key,
                            stackName: document.stackName,
                            source: "env",
                            line: entry.line,
                            status: document.status,
                            envValueMatch: match.valueMatch,
                        },
                    });
                }
            }
        }
    }

    const wantsBackupMetadata = parsed.type === "backup"
        || parsed.diagnostics.includes("backup-failed")
        || (!parsed.type && !parsed.stack && !parsed.image && !parsed.port && parsed.terms.length > 0);
    if (wantsBackupMetadata) {
        const history = BackupManager.getInstance().getHistory();
        for (let index = 0; index < history.length; index++) {
            const item = history[index];
            if (parsed.diagnostics.includes("backup-failed") && item.success) continue;
            const score = scoreTerms(backupHaystack(item), parsed.terms);
            if (score <= 0 && !parsed.diagnostics.includes("backup-failed")) continue;
            scored.push({
                score: score + (item.success ? 0 : 80),
                result: {
                    id: `backup:${item.timestamp}:${item.snapshotId ?? index}`,
                    type: "backup",
                    title: item.snapshotId ? item.snapshotId.slice(0, 12) : item.timestamp,
                    excerpt: backupExcerpt(item),
                    timestamp: item.timestamp,
                    snapshotId: item.snapshotId,
                    diagnostic: item.success ? undefined : "backup-failed",
                },
            });
        }
    }

    let snapshotSearchTruncated = false;
    if (searchSnapshots && parsed.type !== "stack" && parsed.type !== "config" && !parsed.diagnostics.length) {
        const snapshotDocuments = await BackupManager.getInstance().getRecentConfigurationSearchDocuments(5, 80, parsed.stack ?? "");
        snapshotSearchTruncated = snapshotDocuments.truncated;
        for (const document of snapshotDocuments.documents) {
            scored.push(...searchSnapshotDocument(document, parsed, includeEnvValues));
        }
    }

    scored.sort((a, b) => b.score - a.score || a.result.title.localeCompare(b.result.title));
    const truncated = scored.length > limit;
    const results = scored.slice(0, limit).map(({ result, score }) => ({ ...result, score }));
    return { protocol: 2, results, truncated, ...(searchSnapshots ? { snapshotSearchTruncated } : {}) };
}

export async function runGlobalSearch(server: DockgeServer, queryInput: unknown, limitInput: unknown = 50): Promise<GlobalSearchResponse> {
    return runGlobalSearchV2(server, { query: queryInput, limit: limitInput });
}
