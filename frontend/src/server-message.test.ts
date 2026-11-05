import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createI18n } from "vue-i18n";
import { localizeServerMessage, localizeServerResponse } from "./server-message";

for (const lang of [ "fr", "en", "de", "es", "zh-CN" ]) {
    const text = readFileSync(new URL(`./lang/${lang}.json`, import.meta.url), "utf8");
    const dictionary: Record<string, string> = JSON.parse(text);
    const i18n = createI18n({ legacy: false,
        locale: lang,
        messages: { [lang]: dictionary } });
    const translate = (key: string, values: Record<string, string | number> = {}) => i18n.global.te(key) ? i18n.global.t(key, values) : key;
    test(`${lang}: messages from local and older linked instances are localized without changing payloads`, () => {
        for (const message of [ "Chemin invalide", "Fenêtre de rollback expirée (24h dépassées)", "Webhook fonctionnel !", "Un backup Restic est déjà en cours", "Aucun fichier sélectionné" ]) {
            assert.ok(dictionary[message]);
            const response = { ok: false,
                message,
                data: { path: message,
                    count: 4 } };
            const result = localizeServerResponse(response, translate);
            assert.equal(result.message, dictionary[message]);
            if (lang !== "fr") {
                assert.notEqual(result.message, message);
            }
            assert.equal(result.data, response.data);
            assert.equal(response.message, message, "do not mutate persisted/API data");
        }
        assert.equal(localizeServerMessage("Réseau utilisé par 3 conteneur(s)", translate), translate("serverMessage.networkUsed", { count: 3 }));
        assert.equal(localizeServerMessage("key et digest requis", translate), translate("serverMessage.required", { fields: "key et digest",
            detail: "" }));
        for (const raw of [ "Error response from daemon: network abc not found", "/backup/Chemin invalide", "Fichier utilisateur : Chemin invalide", "" ]) {
            assert.equal(localizeServerMessage(raw, translate), raw);
        }
        assert.deepEqual(localizeServerResponse({ msg: { key: "access.denied" } }, translate), { msg: { key: "access.denied" } });
        const keys = [ ...text.matchAll(/^ {4}("(?:[^"\\]|\\.)*"):/gm) ].map(match => JSON.parse(match[1]) as string);
        assert.equal(new Set(keys).size, keys.length, "no duplicate translation keys");
    });
}
