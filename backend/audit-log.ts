import { Request } from "express";
import { R } from "redbean-node";
import { log } from "./log";
import { Settings } from "./settings";
import { DockgeSocket } from "./util-server";

export type AuditStatus = "success" | "failure";

export interface AuditUser {
    userId?: number | null;
    username?: string | null;
}

export interface AuditLogInput {
    action: string;
    category: string;
    targetType?: string | null;
    target?: string | null;
    status?: AuditStatus;
    message?: string | null;
    metadata?: unknown;
    userId?: number | null;
    username?: string | null;
    ip?: string | null;
    endpoint?: string | null;
}

export interface AuditLogQuery {
    q?: string;
    action?: string;
    category?: string;
    status?: string;
    from?: string;
    to?: string;
    limit?: number;
    offset?: number;
}

export interface AuditLogSettings {
    retentionDays: number | null;
}

const RETENTION_SETTING_KEY = "adminAuditLogRetentionDays";
const DEFAULT_RETENTION_DAYS = 180;
const MAX_RETENTION_DAYS = 3650;

export function setAuditUser(req: Request, user: AuditUser) {
    (req as Request & { auditUser?: AuditUser }).auditUser = user;
}

export function getAuditUser(req: Request): AuditUser {
    return (req as Request & { auditUser?: AuditUser }).auditUser ?? {};
}

function cleanText(value: unknown, maxLength: number): string | null {
    if (value === undefined || value === null) {
        return null;
    }
    const text = String(value).trim();
    if (!text) {
        return null;
    }
    return text.length > maxLength ? text.slice(0, maxLength) : text;
}

function serializeMetadata(metadata: unknown): string | null {
    if (metadata === undefined || metadata === null) {
        return null;
    }
    try {
        return JSON.stringify(metadata);
    } catch {
        return JSON.stringify({ value: String(metadata) });
    }
}

function normalizeRetention(value: unknown): number | null {
    if (value === null || value === "unlimited") {
        return null;
    }
    const days = Number(value);
    if (!Number.isFinite(days) || days < 1 || days > MAX_RETENTION_DAYS) {
        throw new Error(`retentionDays must be between 1 and ${MAX_RETENTION_DAYS}, or null for unlimited`);
    }
    return Math.floor(days);
}

export class AuditLogger {
    private static instance?: AuditLogger;
    private userCache = new Map<number, string | null>();

    static getInstance(): AuditLogger {
        if (!AuditLogger.instance) {
            AuditLogger.instance = new AuditLogger();
        }
        return AuditLogger.instance;
    }

    async log(entry: AuditLogInput): Promise<void> {
        try {
            const bean = R.dispense("admin_audit_log");
            bean.timestamp = new Date().toISOString();
            bean.user_id = entry.userId ?? null;
            bean.username = cleanText(entry.username, 255);
            bean.action = cleanText(entry.action, 120) ?? "unknown";
            bean.category = cleanText(entry.category, 80) ?? "admin";
            bean.target_type = cleanText(entry.targetType, 80);
            bean.target = cleanText(entry.target, 500);
            bean.status = entry.status ?? "success";
            bean.message = cleanText(entry.message, 2000);
            bean.metadata = serializeMetadata(entry.metadata);
            bean.ip = cleanText(entry.ip, 100);
            bean.endpoint = cleanText(entry.endpoint, 255);
            await R.store(bean);
            await this.applyRetention();
        } catch (e) {
            log.warn("audit", `Unable to write admin audit log: ${e}`);
        }
    }

    async logFromRequest(req: Request, entry: AuditLogInput): Promise<void> {
        const user = getAuditUser(req);
        await this.log({
            ...entry,
            userId: entry.userId ?? user.userId ?? null,
            username: entry.username ?? user.username ?? null,
            ip: entry.ip ?? req.ip ?? null,
            endpoint: entry.endpoint ?? `${req.method} ${req.originalUrl || req.url}`,
        });
    }

    async logFromSocket(socket: DockgeSocket, entry: AuditLogInput): Promise<void> {
        const userId = typeof socket.userID === "number" ? socket.userID : null;
        await this.log({
            ...entry,
            userId: entry.userId ?? userId,
            username: entry.username ?? await this.getUsername(userId),
            ip: entry.ip ?? socket.handshake?.address ?? null,
            endpoint: entry.endpoint ?? socket.endpoint ?? null,
        });
    }

    async getSettings(): Promise<AuditLogSettings> {
        const raw = await Settings.get(RETENTION_SETTING_KEY);
        if (raw === undefined || raw === null || raw === "") {
            return { retentionDays: DEFAULT_RETENTION_DAYS };
        }
        return { retentionDays: raw === "unlimited" ? null : normalizeRetention(raw) };
    }

    async saveSettings(settings: AuditLogSettings): Promise<AuditLogSettings> {
        const retentionDays = normalizeRetention(settings.retentionDays);
        await Settings.set(RETENTION_SETTING_KEY, retentionDays === null ? "unlimited" : retentionDays, "audit");
        await this.applyRetention();
        return { retentionDays };
    }

    async list(query: AuditLogQuery) {
        const limit = Math.min(Math.max(Number(query.limit) || 100, 1), 500);
        const offset = Math.max(Number(query.offset) || 0, 0);
        const base = R.knex("admin_audit_log");
        this.applyFilters(base, query);

        const countRows = await base.clone().count({ total: "id" });
        const total = Number((countRows[0] as any)?.total ?? 0);
        const entries = await base
            .clone()
            .select("*")
            .orderBy("timestamp", "desc")
            .limit(limit)
            .offset(offset);

        return {
            entries: entries.map((entry: any) => ({
                id: entry.id,
                timestamp: entry.timestamp,
                userId: entry.user_id,
                username: entry.username,
                action: entry.action,
                category: entry.category,
                targetType: entry.target_type,
                target: entry.target,
                status: entry.status,
                message: entry.message,
                metadata: this.parseMetadata(entry.metadata),
                ip: entry.ip,
                endpoint: entry.endpoint,
            })),
            total,
            limit,
            offset,
        };
    }

    async getFacets() {
        const [actions, categories] = await Promise.all([
            R.knex("admin_audit_log").distinct("action").whereNotNull("action").orderBy("action", "asc"),
            R.knex("admin_audit_log").distinct("category").whereNotNull("category").orderBy("category", "asc"),
        ]);
        return {
            actions: actions.map((row: any) => row.action).filter(Boolean),
            categories: categories.map((row: any) => row.category).filter(Boolean),
        };
    }

    async applyRetention(): Promise<void> {
        const settings = await this.getSettings();
        if (settings.retentionDays === null) {
            return;
        }
        const cutoff = new Date(Date.now() - settings.retentionDays * 24 * 60 * 60 * 1000).toISOString();
        await R.knex("admin_audit_log").where("timestamp", "<", cutoff).delete();
    }

    private applyFilters(queryBuilder: any, query: AuditLogQuery) {
        if (query.action) {
            queryBuilder.where("action", query.action);
        }
        if (query.category) {
            queryBuilder.where("category", query.category);
        }
        if (query.status) {
            queryBuilder.where("status", query.status);
        }
        if (query.from) {
            queryBuilder.where("timestamp", ">=", `${query.from}T00:00:00.000Z`);
        }
        if (query.to) {
            queryBuilder.where("timestamp", "<=", `${query.to}T23:59:59.999Z`);
        }
        if (query.q) {
            const like = `%${String(query.q).toLowerCase()}%`;
            queryBuilder.andWhere((builder: any) => {
                for (const column of ["username", "action", "category", "target_type", "target", "message", "metadata", "endpoint"]) {
                    builder.orWhereRaw(`LOWER(COALESCE(${column}, '')) LIKE ?`, [ like ]);
                }
            });
        }
    }

    private parseMetadata(value: string | null) {
        if (!value) {
            return null;
        }
        try {
            return JSON.parse(value);
        } catch {
            return value;
        }
    }

    private async getUsername(userId: number | null): Promise<string | null> {
        if (!userId) {
            return null;
        }
        if (this.userCache.has(userId)) {
            return this.userCache.get(userId) ?? null;
        }
        const username = await R.getCell("SELECT username FROM user WHERE id = ?", [ userId ]);
        this.userCache.set(userId, username ?? null);
        return username ?? null;
    }
}
