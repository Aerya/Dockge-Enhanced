/**
 * AppriseNotifier — Envoi de notifications via l'API HTTP d'Apprise.
 * https://github.com/caronc/apprise-api
 *
 * Fichier : backend/notification/apprise.ts
 *
 * Déployer Apprise en Docker (exemple) :
 *   docker run -p 8000:8000 caronc/apprise:latest
 *
 * Mode stateless : passer les URLs Apprise directement dans la requête
 * (ntfy://ntfy.sh/topic, tgram://token/chatid, slack://..., etc.)
 * Si aucune URL n'est fournie, Apprise utilise ses services par défaut.
 */

import axios from "axios";
import { getNotificationLang, notificationText } from "./notification-lang";
import { log } from "../log";

export type AppriseNotifType = "info" | "success" | "warning" | "failure";

export interface AppriseOptions {
    title: string;
    body:  string;
    type?: AppriseNotifType;
}

export function buildAppriseEndpoint(serverUrl: string): string {
    const parsed = new URL(serverUrl.trim());
    if (![ "http:", "https:" ].includes(parsed.protocol) || parsed.username || parsed.password || parsed.search || parsed.hash) {
        throw new Error("URL du serveur Apprise invalide");
    }
    const host = parsed.host.toLowerCase();
    const dnsOrIpv4 = /^(?:localhost|[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?)(?::[0-9]{1,5})?$/;
    const ipv6 = /^\[[0-9a-f:]+\](?::[0-9]{1,5})?$/;
    if ((!dnsOrIpv4.test(host) && !ipv6.test(host)) || host.includes("..")) {
        throw new Error("URL du serveur Apprise invalide");
    }
    const safeProtocol = parsed.protocol === "https:" ? "https:" : "http:";
    const basePath = parsed.pathname.split("/").filter(Boolean).map(segment => {
        const decoded = decodeURIComponent(segment);
        if (decoded === "." || decoded === ".." || decoded.includes("/")) throw new Error("URL du serveur Apprise invalide");
        return encodeURIComponent(decoded);
    });
    return `${safeProtocol}//${host}/${[ ...basePath, "notify" ].join("/")}/`;
}

export class AppriseNotifier {
    private serverUrl: string;
    private urls:      string[];

    /**
     * @param serverUrl  URL de base du serveur Apprise (ex: "http://apprise:8000")
     * @param urls       URLs Apprise (format ntfy://, tgram://, etc.) — optionnel
     */
    constructor(serverUrl: string, urls: string[] = []) {
        this.serverUrl = serverUrl.trim();
        this.urls      = urls.filter(Boolean);
    }

    /** Renvoie true si le notifier est configuré (URL serveur renseignée) */
    get isConfigured(): boolean {
        return this.serverUrl.length > 0;
    }

    /** Envoie une notification via l'API Apprise */
    async send(options: AppriseOptions): Promise<boolean> {
        if (!this.isConfigured) return false;

        const endpoint = buildAppriseEndpoint(this.serverUrl);

        const payload: Record<string, unknown> = {
            title:  options.title,
            body:   options.body,
            type:   options.type ?? "info",
            format: "markdown",
        };

        // Passe les URLs directement si configurées (mode stateless)
        if (this.urls.length > 0) {
            payload.urls = this.urls.join(",");
        }

        const MAX_RETRIES = 2;
        for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
            try {
                const res = await axios.post(endpoint, payload, {
                    headers: { "Content-Type": "application/json" },
                    timeout: 15000,
                    maxRedirects: 0,
                });
                // Apprise renvoie 200 pour succès, 204 si aucun plugin configuré
                if (res.status === 200 || res.status === 204) {
                    log.info("apprise", `Notification envoyée — title=${options.title}`);
                    return true;
                }
                console.warn(`[AppriseNotifier] Réponse inattendue : HTTP ${res.status}`);
                return false;
            } catch (e: unknown) {
                if (axios.isAxiosError(e)) {
                    const status = e.response?.status;
                    // Erreur serveur transitoire — backoff et retry
                    if (status && status >= 500 && attempt < MAX_RETRIES) {
                        await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
                        continue;
                    }
                    console.error(`[AppriseNotifier] Erreur HTTP ${status}:`, e.response?.data ?? e.message);
                } else {
                    if (attempt < MAX_RETRIES) {
                        await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
                        continue;
                    }
                    console.error("[AppriseNotifier] Erreur réseau :", e);
                }
                return false;
            }
        }
        return false;
    }

    /** Teste la connexion au serveur Apprise */
    async test(): Promise<boolean> {
        try {
            const lang = await getNotificationLang();
            return await this.send({
                title: notificationText(
                    lang,
                    "✅ Test de notification Dockge Enhanced",
                    "✅ Dockge Enhanced notification test",
                    "✅ Prueba de notificación de Dockge Enhanced",
                    "✅ Dockge Enhanced 通知测试",
                ),
                body: notificationText(
                    lang,
                    "Apprise est correctement configuré et connecté !",
                    "Apprise is configured and connected correctly!",
                    "¡Apprise está configurado y conectado correctamente!",
                    "Apprise 配置并连接正确！",
                ),
                type: "success",
            });
        } catch {
            return false;
        }
    }
}
