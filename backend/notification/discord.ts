/**
 * DiscordNotifier — Envoi de notifications via webhook Discord.
 * Fichier : backend/notification/discord.ts
 */

import axios from "axios";

interface EmbedField {
    name: string;
    value: string;
    inline?: boolean;
}

interface EmbedOptions {
    title: string;
    description?: string;
    color?: number;
    fields?: EmbedField[];
    footer?: string;
    thumbnail?: string;
    url?: string;           // lien cliquable sur le titre de l'embed
}

export class DiscordNotifier {
    private urls: string[];

    /**
     * Accepte un ou plusieurs webhooks.
     * Passer un string unique reste compatible avec l'ancien code.
     */
    constructor(webhooks: string | string[]) {
        this.urls = (Array.isArray(webhooks) ? webhooks : [webhooks]).filter(Boolean);
    }

    private async sendEmbedToUrl(url: string, options: EmbedOptions): Promise<boolean> {
        // Validation basique : rejette silencieusement les URLs manifestement invalides
        try { new URL(url); } catch {
            console.error(`[DiscordNotifier] URL invalide ignorée : ${url.slice(0, 80)}…`);
            return false;
        }
        if (!url.startsWith("https://discord.com/api/webhooks/")) {
            console.error(`[DiscordNotifier] URL non-Discord ignorée : ${url.slice(0, 80)}…`);
            return false;
        }

        const embed: Record<string, unknown> = {
            title: options.title,
            color: options.color ?? 0x5865f2,
            timestamp: new Date().toISOString(),
        };

        // embed.url (titre cliquable) rejeté par Discord pour les IPs privées —
        // le lien est inclus dans la description à la place
        if (options.description) embed.description = options.description;
        if (options.fields && options.fields.length > 0) embed.fields = options.fields;
        if (options.footer)      embed.footer      = { text: options.footer };
        if (options.thumbnail)   embed.thumbnail   = { url: options.thumbnail };

        const payload = {
            username:   "Dockge Enhanced",
            avatar_url: "https://raw.githubusercontent.com/Aerya/dockge-enhanced/main/frontend/public/icon-192x192.png",
            embeds: [embed],
        };

        try {
            await axios.post(url, payload, {
                headers: { "Content-Type": "application/json" },
                timeout: 10000,
            });
            return true;
        } catch (e: unknown) {
            if (axios.isAxiosError(e)) {
                console.error(`[DiscordNotifier] Erreur HTTP ${e.response?.status} (${url}):`, e.response?.data);
            } else {
                console.error(`[DiscordNotifier] Erreur réseau (${url}):`, e);
            }
            return false;
        }
    }

    /** Envoie l'embed sur tous les webhooks configurés en parallèle */
    async sendEmbed(options: EmbedOptions): Promise<void> {
        if (this.urls.length === 0) {
            console.warn("[DiscordNotifier] Aucun webhook configuré, notification ignorée.");
            return;
        }
        const results = await Promise.all(this.urls.map(url => this.sendEmbedToUrl(url, options)));
        const sent = results.filter(Boolean).length;
        const failed = this.urls.length - sent;
        if (sent > 0) console.log(`[DiscordNotifier] Notification envoyée (${sent}/${this.urls.length} webhook(s)) : ${options.title}`);
        if (failed > 0 && sent === 0) console.error(`[DiscordNotifier] Échec total — aucun webhook n'a reçu : ${options.title}`);
    }

    /** Envoie un message texte simple sur tous les webhooks */
    async sendMessage(content: string): Promise<void> {
        if (this.urls.length === 0) return;
        await Promise.all(this.urls.map(url =>
            axios.post(url, { username: "Dockge Enhanced", content }, { timeout: 10000 })
                .catch(e => console.error(`[DiscordNotifier] Erreur envoi message (${url}):`, e))
        ));
    }

    /** Teste le premier webhook de la liste */
    async testWebhook(): Promise<boolean> {
        try {
            await this.sendEmbed({
                title: "✅ Test de notification Dockge Enhanced",
                description: "Le webhook Discord est correctement configuré !",
                color: 0x22c55e,
                footer: "Dockge Enhanced",
            });
            return true;
        } catch {
            return false;
        }
    }
}
