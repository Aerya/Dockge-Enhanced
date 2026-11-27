import { createHash } from "node:crypto";
import { Settings } from "../settings";
import { ImageWatcher } from "../watchers/image-watcher";
import { DiscordNotifier } from "../notification/discord";
import { AppriseNotifier } from "../notification/apprise";
import type { HostSecurity } from "./security";
import type { HostOperationEvent } from "./operations";
export const HOST_EVENTS = [ "updates", "security", "fix", "reboot", "collector", "securityData", "operationStart", "operationSuccess", "operationFailure", "schedule" ] as const;
export type HostEvent = typeof HOST_EVENTS[number];
export type HostNotificationEvents = Record<HostEvent, boolean>;
export const DEFAULT_HOST_EVENTS = Object.fromEntries(HOST_EVENTS.map(k => [ k, true ])) as HostNotificationEvents;
export function hostAlertKey(state: string, reboot: string, security: HostSecurity) {
    return createHash("sha256").update(JSON.stringify([ state, reboot, security.state,
        security.findings.filter(v => [ "HIGH", "CRITICAL" ].includes(v.severity)).map(v => `${v.id}:${v.pkg}:${v.fix}`).sort() ])).digest("hex");
}
const labels: Record<string, string[]> = {
    fr: [ "Mises à jour des hôtes", "Mises à jour disponibles", "Vulnérabilités détectées", "Correctifs disponibles", "Redémarrage nécessaire", "Collecteur indisponible ou ancien", "Données de sécurité indisponibles ou anciennes", "Installation démarrée", "Installation terminée", "Installation échouée", "Planification modifiée", "Manuel", "Automatique", "Paquets" ],
    en: [ "Host Updates", "Updates available", "Vulnerabilities detected", "Fixes available", "Reboot required", "Collector unavailable or stale", "Security data unavailable or stale", "Installation started", "Installation completed", "Installation failed", "Schedule changed", "Manual", "Automatic", "Packages" ],
    de: [ "Host-Updates", "Updates verfügbar", "Schwachstellen erkannt", "Korrekturen verfügbar", "Neustart erforderlich", "Collector nicht verfügbar oder veraltet", "Sicherheitsdaten fehlen oder sind veraltet", "Installation gestartet", "Installation abgeschlossen", "Installation fehlgeschlagen", "Zeitplan geändert", "Manuell", "Automatisch", "Pakete" ],
    es: [ "Actualizaciones de hosts", "Actualizaciones disponibles", "Vulnerabilidades detectadas", "Correcciones disponibles", "Reinicio necesario", "Recopilador no disponible o antiguo", "Datos de seguridad no disponibles o antiguos", "Instalación iniciada", "Instalación completada", "Instalación fallida", "Programación modificada", "Manual", "Automática", "Paquetes" ],
    "zh-CN": [ "主机更新", "有可用更新", "检测到漏洞", "有可用修复", "需要重启", "采集器不可用或过期", "安全数据不可用或过期", "安装已开始", "安装已完成", "安装失败", "计划已修改", "手动", "自动", "软件包" ],
};
export function operationNotification(event: HostOperationEvent): HostEvent | null {
    return ({ running: "operationStart",
        complete: "operationSuccess",
        failed: "operationFailure",
        scheduled: "schedule" } as Record<string, HostEvent>)[event.state] ?? null;
}
/** Operations are persisted in SQLite and retried independently of the UI; no hourly suppression. */
export async function sendHostNotification(kind: HostEvent, host: string, detail: string, operation?: HostOperationEvent): Promise<boolean> {
    const config = ImageWatcher.getInstance().settings;
    if (!config.discordWebhooks.length && !config.appriseServerUrl) {
        return false;
    }
    const locale = String(await Settings.get("uiLocale") ?? "en");
    const lang = locale.startsWith("zh") ? "zh-CN" : locale.split("-")[0];
    const words = labels[lang] ?? labels.en;
    const title = `${words[0]} · ${words[HOST_EVENTS.indexOf(kind) + 1]}`;
    const body = `${host}\n${detail}${operation ? `\n${words[operation.automatic ? 12 : 11]} · ${operation.scope} · ${words[13]}: ${operation.count}\n${operation.id}` : ""}\n/watcher/hosts`;
    const results = await Promise.allSettled([
        new DiscordNotifier(config.discordWebhooks).sendEmbed({ title,
            description: body }),
        new AppriseNotifier(config.appriseServerUrl, config.appriseUrls).send({ title,
            body,
            type: kind === "operationSuccess" ? "success" : "warning" }),
    ]);
    return results.some(r => r.status === "fulfilled" && r.value);
}
export async function notifyDetection(kind: HostEvent, host: string, values: string[]) {
    const key = createHash("sha256").update(JSON.stringify(values.slice().sort())).digest("hex");
    const previous = await Settings.get(`hostAlert:${kind}`);
    if (!values.length) {
        if (previous?.key !== key) {
            await Settings.set(`hostAlert:${kind}`, { key,
                at: 0 });
        }
        return;
    }
    if (previous?.key === key || (previous?.at && Date.now() - previous.at < 3600000)) {
        return;
    }
    if (await sendHostNotification(kind, host, `${values.length}\n${values.slice(0, 10).join("\n")}`)) {
        await Settings.set(`hostAlert:${kind}`, { key,
            at: Date.now() });
    }
}
