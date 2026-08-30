import { Settings } from "../settings";

export type NotificationLang = "fr" | "en";

/**
 * Langue des notifications (Discord / Apprise).
 *
 * Elle suit la langue de l'interface : le frontend pousse la locale
 * courante via l'événement socket "setUILocale" (au démarrage et à
 * chaque changement de langue). Les chaînes de notification n'existent
 * qu'en fr/en — tout ce qui n'est pas français retombe sur l'anglais.
 *
 * @returns "fr" si l'interface est en français, "en" sinon
 */
export async function getNotificationLang(): Promise<NotificationLang> {
    const locale = await Settings.get("uiLocale");
    return typeof locale === "string" && locale.startsWith("fr") ? "fr" : "en";
}
