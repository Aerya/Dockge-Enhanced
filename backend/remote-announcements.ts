import axios from "axios";
import * as fs from "fs/promises";
import * as path from "path";
import { compareVersions } from "compare-versions";
import packageJSON from "../package.json";

const DEFAULT_ANNOUNCEMENTS_URL = "https://raw.githubusercontent.com/Aerya/Dockge-Enhanced/main/remote-announcements.json";
const ANNOUNCEMENTS_URL = process.env.DOCKGE_REMOTE_ANNOUNCEMENTS_URL?.trim() || DEFAULT_ANNOUNCEMENTS_URL;
const DATA_DIR = process.env.DOCKGE_DATA_DIR ?? "/opt/dockge/data";
const STATE_PATH = path.join(DATA_DIR, "remote-announcements-state.json");
const CACHE_MS = 15 * 60 * 1000;
const FAILURE_CACHE_MS = 60 * 1000;
const MAX_DOCUMENT_BYTES = 128 * 1024;
const MAX_ANNOUNCEMENTS = 20;
const MAX_ACKNOWLEDGED_IDS = 200;

type Severity = "info" | "warning" | "critical";
type LocalizedText = Record<string, string>;

export interface BuildTarget {
    revision?: string;
    created?: string;
}

interface AnnouncementTarget {
    minVersion?: string;
    maxVersion?: string;
    revisions?: string[];
    excludeRevisions?: string[];
    createdAfter?: string;
    createdBefore?: string;
}

interface RemoteAnnouncement {
    id: string;
    enabled: boolean;
    severity: Severity;
    title: LocalizedText;
    message: LocalizedText;
    url?: string;
    dismissible: boolean;
    target?: AnnouncementTarget;
}

export interface RemoteAnnouncementView {
    id: string;
    severity: Severity;
    title: string;
    message: string;
    url: string | null;
    dismissible: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === "object" && !Array.isArray(value);
}

function normalizeLocalizedText(value: unknown, maxLength: number): LocalizedText | null {
    if (!isRecord(value)) return null;
    const result: LocalizedText = {};
    for (const [locale, text] of Object.entries(value)) {
        if (!/^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})?$/.test(locale)) continue;
        if (typeof text !== "string") continue;
        const normalized = text.trim();
        if (!normalized || normalized.length > maxLength) continue;
        result[locale] = normalized;
    }
    return Object.keys(result).length > 0 ? result : null;
}

function normalizeVersion(value: unknown): string | undefined {
    if (typeof value !== "string" || !value.trim()) return undefined;
    const version = value.trim();
    try {
        compareVersions(version, version);
        return version;
    } catch {
        return undefined;
    }
}

function normalizeIsoDate(value: unknown): string | undefined {
    if (typeof value !== "string" || !value.trim()) return undefined;
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? new Date(parsed).toISOString() : undefined;
}

function normalizeRevisionList(value: unknown): string[] | undefined {
    if (!Array.isArray(value)) return undefined;
    const revisions = value
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim().toLowerCase())
        .filter((item) => /^[a-f0-9]{7,40}$/.test(item))
        .slice(0, 100);
    return revisions.length > 0 ? [...new Set(revisions)] : undefined;
}

function normalizeTarget(value: unknown): AnnouncementTarget | undefined {
    if (!isRecord(value)) return undefined;
    const target: AnnouncementTarget = {};
    const minVersion = normalizeVersion(value.minVersion);
    const maxVersion = normalizeVersion(value.maxVersion);
    const revisions = normalizeRevisionList(value.revisions);
    const excludeRevisions = normalizeRevisionList(value.excludeRevisions);
    const createdAfter = normalizeIsoDate(value.createdAfter);
    const createdBefore = normalizeIsoDate(value.createdBefore);
    if (minVersion) target.minVersion = minVersion;
    if (maxVersion) target.maxVersion = maxVersion;
    if (revisions) target.revisions = revisions;
    if (excludeRevisions) target.excludeRevisions = excludeRevisions;
    if (createdAfter) target.createdAfter = createdAfter;
    if (createdBefore) target.createdBefore = createdBefore;
    return Object.keys(target).length > 0 ? target : undefined;
}

function normalizeUrl(value: unknown): string | undefined {
    if (typeof value !== "string" || !value.trim()) return undefined;
    try {
        const url = new URL(value.trim());
        if (url.protocol !== "https:" || url.hostname !== "github.com") return undefined;
        if (!url.pathname.toLowerCase().startsWith("/aerya/dockge-enhanced")) return undefined;
        return url.toString();
    } catch {
        return undefined;
    }
}

export function parseRemoteAnnouncementDocument(value: unknown): RemoteAnnouncement[] {
    if (!isRecord(value) || value.version !== 1 || !Array.isArray(value.announcements)) return [];
    const result: RemoteAnnouncement[] = [];
    const seen = new Set<string>();
    for (const raw of value.announcements.slice(0, MAX_ANNOUNCEMENTS)) {
        if (!isRecord(raw)) continue;
        const id = typeof raw.id === "string" ? raw.id.trim() : "";
        if (!/^[A-Za-z0-9][A-Za-z0-9._-]{2,79}$/.test(id) || seen.has(id)) continue;
        const severity = raw.severity;
        if (severity !== "info" && severity !== "warning" && severity !== "critical") continue;
        const title = normalizeLocalizedText(raw.title, 160);
        const message = normalizeLocalizedText(raw.message, 1200);
        if (!title || !message) continue;
        const target = normalizeTarget(raw.target);
        result.push({
            id,
            enabled: raw.enabled === true,
            severity,
            title,
            message,
            url: normalizeUrl(raw.url),
            dismissible: raw.dismissible !== false,
            ...(target ? { target } : {}),
        });
        seen.add(id);
    }
    return result;
}

function revisionMatches(actual: string, expected: string): boolean {
    const normalizedActual = actual.trim().toLowerCase();
    const normalizedExpected = expected.trim().toLowerCase();
    return normalizedActual === normalizedExpected
        || normalizedActual.startsWith(normalizedExpected)
        || normalizedExpected.startsWith(normalizedActual);
}

export function announcementMatchesBuild(
    announcement: RemoteAnnouncement,
    version = packageJSON.version,
    build: BuildTarget = {}
): boolean {
    if (!announcement.enabled) return false;
    const target = announcement.target;
    if (!target) return true;
    try {
        if (target.minVersion && compareVersions(version, target.minVersion) < 0) return false;
        if (target.maxVersion && compareVersions(version, target.maxVersion) > 0) return false;
    } catch {
        return false;
    }

    const revision = build.revision?.trim() ?? "";
    if (target.revisions) {
        if (!revision || !target.revisions.some((candidate) => revisionMatches(revision, candidate))) return false;
    }
    if (target.excludeRevisions && revision && target.excludeRevisions.some((candidate) => revisionMatches(revision, candidate))) {
        return false;
    }

    if (target.createdAfter || target.createdBefore) {
        const created = build.created ? Date.parse(build.created) : Number.NaN;
        if (!Number.isFinite(created)) return false;
        if (target.createdAfter && created < Date.parse(target.createdAfter)) return false;
        if (target.createdBefore && created > Date.parse(target.createdBefore)) return false;
    }
    return true;
}

export function selectAnnouncementText(text: LocalizedText, locale: string): string {
    const raw = locale.trim();
    const base = raw.split("-")[0];
    return text[raw]
        ?? text[base]
        ?? text.en
        ?? text.fr
        ?? Object.values(text)[0]
        ?? "";
}

export class RemoteAnnouncementManager {
    private static _instance: RemoteAnnouncementManager;
    private cache: RemoteAnnouncement[] = [];
    private cacheUntil = 0;
    private checkedAt: string | null = null;
    private acknowledged: Set<string> | null = null;
    private inFlight: Promise<void> | null = null;

    static getInstance(): RemoteAnnouncementManager {
        if (!this._instance) this._instance = new RemoteAnnouncementManager();
        return this._instance;
    }

    private async loadAcknowledged(): Promise<Set<string>> {
        if (this.acknowledged) return this.acknowledged;
        try {
            const raw = JSON.parse(await fs.readFile(STATE_PATH, "utf8")) as Record<string, unknown>;
            const ids = Array.isArray(raw.acknowledged)
                ? raw.acknowledged.filter((item): item is string => typeof item === "string" && /^[A-Za-z0-9][A-Za-z0-9._-]{2,79}$/.test(item))
                : [];
            this.acknowledged = new Set(ids.slice(-MAX_ACKNOWLEDGED_IDS));
        } catch {
            this.acknowledged = new Set();
        }
        return this.acknowledged;
    }

    private async saveAcknowledged(): Promise<void> {
        const ids = [...(this.acknowledged ?? new Set<string>())].slice(-MAX_ACKNOWLEDGED_IDS);
        await fs.mkdir(DATA_DIR, { recursive: true });
        const tmp = `${STATE_PATH}.${process.pid}.tmp`;
        await fs.writeFile(tmp, JSON.stringify({ version: 1, acknowledged: ids }), { encoding: "utf8", mode: 0o600 });
        await fs.rename(tmp, STATE_PATH);
    }

    private async refresh(): Promise<void> {
        if (Date.now() < this.cacheUntil) return;
        if (this.inFlight) return this.inFlight;
        this.inFlight = (async () => {
            try {
                const source = new URL(ANNOUNCEMENTS_URL);
                if (source.protocol !== "https:") throw new Error("Remote announcements URL must use HTTPS");
                const response = await axios.get(source.toString(), {
                    timeout: 5000,
                    responseType: "json",
                    maxContentLength: MAX_DOCUMENT_BYTES,
                    headers: { Accept: "application/json" },
                });
                this.cache = parseRemoteAnnouncementDocument(response.data);
                this.checkedAt = new Date().toISOString();
                this.cacheUntil = Date.now() + CACHE_MS;
            } catch {
                this.cache = [];
                this.checkedAt = new Date().toISOString();
                this.cacheUntil = Date.now() + FAILURE_CACHE_MS;
            } finally {
                this.inFlight = null;
            }
        })();
        return this.inFlight;
    }

    async getVisibleAnnouncements(locale: string, build: BuildTarget = {}): Promise<{
        announcements: RemoteAnnouncementView[];
        checkedAt: string | null;
    }> {
        await Promise.all([this.refresh(), this.loadAcknowledged()]);
        const acknowledged = this.acknowledged ?? new Set<string>();
        const announcements = this.cache
            .filter((announcement) => !acknowledged.has(announcement.id))
            .filter((announcement) => announcementMatchesBuild(announcement, packageJSON.version, build))
            .map((announcement) => ({
                id: announcement.id,
                severity: announcement.severity,
                title: selectAnnouncementText(announcement.title, locale),
                message: selectAnnouncementText(announcement.message, locale),
                url: announcement.url ?? null,
                dismissible: announcement.dismissible,
            }));
        return { announcements, checkedAt: this.checkedAt };
    }

    async acknowledge(id: string): Promise<void> {
        if (!/^[A-Za-z0-9][A-Za-z0-9._-]{2,79}$/.test(id)) {
            throw new Error("Invalid announcement id");
        }
        const acknowledged = await this.loadAcknowledged();
        acknowledged.delete(id);
        acknowledged.add(id);
        await this.saveAcknowledged();
    }
}

