import { Settings } from "../settings";

export type NotificationLang = "fr" | "en" | "es" | "zh-CN";

export async function getNotificationLang(): Promise<NotificationLang> {
    const locale = await Settings.get("uiLocale");
    if (typeof locale !== "string") return "en";
    const normalized = locale.toLowerCase();
    if (normalized.startsWith("fr")) return "fr";
    if (normalized.startsWith("es")) return "es";
    if (normalized.startsWith("zh")) return "zh-CN";
    return "en";
}

export function getNotificationLocale(lang: NotificationLang): string {
    switch (lang) {
        case "fr": return "fr-FR";
        case "es": return "es-ES";
        case "zh-CN": return "zh-CN";
        default: return "en-GB";
    }
}

export function notificationText(
    lang: NotificationLang,
    fr: string,
    en: string,
    es: string,
    zhCN: string,
): string {
    switch (lang) {
        case "fr": return fr;
        case "es": return es;
        case "zh-CN": return zhCN;
        default: return en;
    }
}
