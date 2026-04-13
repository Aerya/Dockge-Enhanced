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

export type AppriseNotifType = "info" | "success" | "warning" | "failure";

export interface AppriseOptions {
    title: string;
    body:  string;
    type?: AppriseNotifType;
}

export class AppriseNotifier {
    private serverUrl: string;
    private urls:      string[];

    /**
     * @param serverUrl  URL de base du serveur Apprise (ex: "http://apprise:8000")
     * @param urls       URLs Apprise (format ntfy://, tgram://, etc.) — optionnel
     */
    constructor(serverUrl: string, urls: string[] = []) {
        this.serverUrl = serverUrl.replace(/\/$/, "");
        this.urls      = urls.filter(Boolean);
    }

    /** Renvoie true si le notifier est configuré (URL serveur renseignée) */
    get isConfigured(): boolean {
        return this.serverUrl.length > 0;
    }

    /** Envoie une notification via l'API Apprise */
    async send(options: AppriseOptions): Promise<boolean> {
        if (!this.isConfigured) return false;

        const endpoint = `${this.serverUrl}/notify/`;

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
                });
                // Apprise renvoie 200 pour succès, 204 si aucun plugin configuré
                if (res.status === 200 || res.status === 204) {
                    console.log(`[AppriseNotifier] Notification envoyée : ${options.title}`);
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
            return await this.send({
                title: "✅ Test de notification Dockge Enhanced",
                body:  "Apprise est correctement configuré et connecté !",
                type:  "success",
            });
        } catch {
            return false;
        }
    }
}
