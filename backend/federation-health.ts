import * as fs from "fs/promises";
import * as path from "path";
import { DiscordNotifier } from "./notification/discord";
import { AppriseNotifier } from "./notification/apprise";
import { notificationText, type NotificationLang } from "./notification/notification-lang";
import { log } from "./log";

const DATA_DIR = process.env.DOCKGE_DATA_DIR ?? "/opt/dockge/data";
const WATCHER_SETTINGS_PATH = path.join(DATA_DIR, "watcher-settings.json");

export const FEDERATION_RECONNECT_ATTEMPTS = 5;
export const FEDERATION_RECONNECT_DELAY_MS = 1_000;
export const FEDERATION_RECONNECT_DELAY_MAX_MS = 30_000;
export const FEDERATION_RECONNECT_RANDOMIZATION = 0.5;
export const FEDERATION_FAILURE_THRESHOLD = 6;
export const FEDERATION_CIRCUIT_OPEN_MS = 5 * 60_000;
export const FEDERATION_INGRESS_WINDOW_MS = 5 * 60_000;
export const FEDERATION_INGRESS_MAX_ATTEMPTS = 60;
export const FEDERATION_INGRESS_BLOCK_MS = 5 * 60_000;
export const FEDERATION_MAX_CONCURRENT_INBOUND = 32;

const NOTIFICATION_COOLDOWN_MS = 30 * 60_000;
const MAX_DETAIL_LENGTH = 500;

export type FederationIncidentKind =
    | "reconnect-circuit-open"
    | "authentication-failed"
    | "inbound-storm"
    | "database-contention";

export interface FederationIncident {
    kind: FederationIncidentKind;
    endpoint: string;
    attempts?: number;
    detail?: string;
}

interface IngressState {
    attempts: number[];
    blockedUntil: number;
}

export interface IngressDecision {
    allowed: boolean;
    tripped: boolean;
    attempts: number;
    retryAfterMs: number;
}

export class FederationIngressGuard {
    private readonly states = new Map<string, IngressState>();

    constructor(
        private readonly windowMs = FEDERATION_INGRESS_WINDOW_MS,
        private readonly maxAttempts = FEDERATION_INGRESS_MAX_ATTEMPTS,
        private readonly blockMs = FEDERATION_INGRESS_BLOCK_MS,
    ) {}

    registerAttempt(key: string, now = Date.now()): IngressDecision {
        const state = this.states.get(key) ?? { attempts: [], blockedUntil: 0 };

        if (state.blockedUntil > now) {
            return {
                allowed: false,
                tripped: false,
                attempts: state.attempts.length,
                retryAfterMs: state.blockedUntil - now,
            };
        }

        if (state.blockedUntil > 0) {
            state.blockedUntil = 0;
            state.attempts = [];
        }

        const cutoff = now - this.windowMs;
        state.attempts = state.attempts.filter((timestamp) => timestamp >= cutoff);
        state.attempts.push(now);

        if (state.attempts.length > this.maxAttempts) {
            state.blockedUntil = now + this.blockMs;
            this.states.set(key, state);
            return {
                allowed: false,
                tripped: true,
                attempts: state.attempts.length,
                retryAfterMs: this.blockMs,
            };
        }

        this.states.set(key, state);
        return { allowed: true, tripped: false, attempts: state.attempts.length, retryAfterMs: 0 };
    }
}

export function federationCircuitRetryDelayMs(baseMs = FEDERATION_CIRCUIT_OPEN_MS, random = Math.random()): number {
    const boundedRandom = Math.max(0, Math.min(1, random));
    return baseMs + Math.floor(boundedRandom * 10_000);
}

export function isKnexPoolTimeout(error: unknown): boolean {
    const text = error instanceof Error ? `${error.name}: ${error.message}` : String(error ?? "");
    return /KnexTimeoutError|Timeout acquiring a connection|pool is probably full/i.test(text);
}

export function safeFederationErrorMessage(value: unknown): string {
    return String(value ?? "")
        .replace(/([?&](?:token|password|secret|authorization)=)[^&\s]+/gi, "$1[redacted]")
        .replace(/((?:token|password|secret|authorization)\s*[:=]\s*)[^\s,;]+/gi, "$1[redacted]")
        .replace(/(https?:\/\/[^/\s:@]+:)[^@\s/]+@/gi, "$1[redacted]@")
        .slice(0, MAX_DETAIL_LENGTH);
}

interface NotificationConfig {
    discordWebhooks: string[];
    appriseServerUrl: string;
    appriseUrls: string[];
    lang: NotificationLang;
}

const lastNotifications = new Map<string, number>();

function normalizeLang(value: unknown): NotificationLang {
    if (typeof value !== "string") return "en";
    const normalized = value.toLowerCase();
    if (normalized.startsWith("fr")) return "fr";
    if (normalized.startsWith("es")) return "es";
    if (normalized.startsWith("zh")) return "zh-CN";
    return "en";
}

async function loadNotificationConfig(): Promise<NotificationConfig> {
    try {
        const raw = await fs.readFile(WATCHER_SETTINGS_PATH, "utf8");
        const data = JSON.parse(raw) as Record<string, unknown>;
        const legacyWebhook = typeof data.discordWebhook === "string" && data.discordWebhook
            ? [ data.discordWebhook ]
            : [];
        const discordWebhooks = Array.isArray(data.discordWebhooks)
            ? data.discordWebhooks.filter((value): value is string => typeof value === "string" && value.trim() !== "")
            : legacyWebhook;
        const appriseUrls = Array.isArray(data.appriseUrls)
            ? data.appriseUrls.filter((value): value is string => typeof value === "string" && value.trim() !== "")
            : [];

        return {
            discordWebhooks,
            appriseServerUrl: typeof data.appriseServerUrl === "string" ? data.appriseServerUrl.trim() : "",
            appriseUrls,
            lang: normalizeLang(data.notificationLang),
        };
    } catch {
        return { discordWebhooks: [], appriseServerUrl: "", appriseUrls: [], lang: "en" };
    }
}

function incidentTitle(lang: NotificationLang, kind: FederationIncidentKind): string {
    switch (kind) {
        case "database-contention":
            return notificationText(lang,
                "🚨 Dockge Enhanced — contention SQLite détectée",
                "🚨 Dockge Enhanced — SQLite contention detected",
                "🚨 Dockge Enhanced — contención SQLite detectada",
                "🚨 Dockge Enhanced — 检测到 SQLite 争用");
        case "inbound-storm":
            return notificationText(lang,
                "⚠️ Dockge Enhanced — tempête de fédération bloquée",
                "⚠️ Dockge Enhanced — federation storm blocked",
                "⚠️ Dockge Enhanced — tormenta de federación bloqueada",
                "⚠️ Dockge Enhanced — 已阻止联邦连接风暴");
        case "authentication-failed":
            return notificationText(lang,
                "⚠️ Dockge Enhanced — authentification fédérée en échec",
                "⚠️ Dockge Enhanced — federation authentication failed",
                "⚠️ Dockge Enhanced — fallo de autenticación federada",
                "⚠️ Dockge Enhanced — 联邦认证失败");
        default:
            return notificationText(lang,
                "⚠️ Dockge Enhanced — coupe-circuit de fédération activé",
                "⚠️ Dockge Enhanced — federation circuit breaker opened",
                "⚠️ Dockge Enhanced — disyuntor de federación activado",
                "⚠️ Dockge Enhanced — 联邦断路器已启用");
    }
}

function incidentBody(lang: NotificationLang, incident: FederationIncident): string {
    const endpoint = incident.endpoint || "local";
    const detail = safeFederationErrorMessage(incident.detail ?? "");
    const attempts = incident.attempts ?? 0;

    switch (incident.kind) {
        case "database-contention":
            return notificationText(lang,
                `Une saturation du pool SQLite/Knex a été détectée. Les garde-fous de fédération restent actifs.\n\nEndpoint : ${endpoint}\nErreur : ${detail || "KnexTimeoutError"}`,
                `SQLite/Knex pool contention was detected. Federation safeguards remain active.\n\nEndpoint: ${endpoint}\nError: ${detail || "KnexTimeoutError"}`,
                `Se detectó saturación del pool SQLite/Knex. Las protecciones de federación siguen activas.\n\nEndpoint: ${endpoint}\nError: ${detail || "KnexTimeoutError"}`,
                `检测到 SQLite/Knex 连接池争用。联邦保护机制仍保持启用。\n\n端点：${endpoint}\n错误：${detail || "KnexTimeoutError"}`);
        case "inbound-storm":
            return notificationText(lang,
                `Trop de handshakes fédérés ont été reçus. Les nouvelles connexions sont temporairement rejetées avant authentification afin de protéger SQLite.\n\nEndpoint : ${endpoint}\nTentatives : ${attempts}`,
                `Too many federation handshakes were received. New connections are temporarily rejected before authentication to protect SQLite.\n\nEndpoint: ${endpoint}\nAttempts: ${attempts}`,
                `Se recibieron demasiados handshakes de federación. Las nuevas conexiones se rechazan temporalmente antes de la autenticación para proteger SQLite.\n\nEndpoint: ${endpoint}\nIntentos: ${attempts}`,
                `收到过多联邦握手。为保护 SQLite，新连接会在认证前被暂时拒绝。\n\n端点：${endpoint}\n尝试次数：${attempts}`);
        case "authentication-failed":
            return notificationText(lang,
                `L'authentification d'une instance liée a échoué. Le lien reste hors ligne jusqu'à une nouvelle connexion ou une mise à jour des identifiants.\n\nEndpoint : ${endpoint}\nErreur : ${detail || "authentication failed"}`,
                `Authentication to a linked instance failed. The link stays offline until a new connection or credential update.\n\nEndpoint: ${endpoint}\nError: ${detail || "authentication failed"}`,
                `Falló la autenticación con una instancia vinculada. El enlace permanece fuera de línea hasta una nueva conexión o actualización de credenciales.\n\nEndpoint: ${endpoint}\nError: ${detail || "authentication failed"}`,
                `关联实例认证失败。在下一次连接或凭据更新前，该连接保持离线。\n\n端点：${endpoint}\n错误：${detail || "authentication failed"}`);
        default:
            return notificationText(lang,
                `Les reconnexions vers une instance liée ont dépassé la limite. Le lien est placé hors ligne pendant environ 5 minutes avant une nouvelle tentative contrôlée avec jitter.\n\nEndpoint : ${endpoint}\nÉchecs : ${attempts}\nDernière erreur : ${detail || "connection error"}`,
                `Reconnects to a linked instance exceeded the limit. The link is held offline for about 5 minutes before a controlled retry with jitter.\n\nEndpoint: ${endpoint}\nFailures: ${attempts}\nLast error: ${detail || "connection error"}`,
                `Las reconexiones a una instancia vinculada superaron el límite. El enlace queda fuera de línea unos 5 minutos antes de un nuevo intento controlado con jitter.\n\nEndpoint: ${endpoint}\nFallos: ${attempts}\nÚltimo error: ${detail || "connection error"}`,
                `到关联实例的重连次数已超过限制。连接将离线约 5 分钟，然后通过带随机抖动的受控方式重试。\n\n端点：${endpoint}\n失败次数：${attempts}\n最近错误：${detail || "connection error"}`);
    }
}

export async function notifyFederationIncident(incident: FederationIncident): Promise<void> {
    try {
        const config = await loadNotificationConfig();
        if (config.discordWebhooks.length === 0 && !config.appriseServerUrl) return;

        const key = `${incident.kind}:${incident.endpoint || "local"}`;
        const now = Date.now();
        if (now - (lastNotifications.get(key) ?? 0) < NOTIFICATION_COOLDOWN_MS) return;
        lastNotifications.set(key, now);

        const title = incidentTitle(config.lang, incident.kind);
        const body = incidentBody(config.lang, incident);
        const tasks: Promise<unknown>[] = [];

        if (config.discordWebhooks.length > 0) {
            tasks.push(new DiscordNotifier(config.discordWebhooks).sendEmbed({
                title,
                description: body,
                color: incident.kind === "database-contention" ? 0xef4444 : 0xf59e0b,
                footer: "Dockge Enhanced · Federation guard",
            }));
        }
        if (config.appriseServerUrl) {
            tasks.push(new AppriseNotifier(config.appriseServerUrl, config.appriseUrls).send({
                title,
                body,
                type: incident.kind === "database-contention" ? "failure" : "warning",
            }));
        }
        await Promise.allSettled(tasks);
    } catch (error) {
        log.warn("federation", `Federation notification failed: ${safeFederationErrorMessage(error)}`);
    }
}
