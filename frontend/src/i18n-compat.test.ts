import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createSSRApp, h } from "vue";
import { renderToString } from "@vue/server-renderer";
import { createI18n } from "vue-i18n";

for (const locale of [ "en", "fr", "de", "es", "zh-CN" ]) {
    test(`rendu réel des compteurs et pluriels en ${locale}`, async () => {
        const messages = JSON.parse(readFileSync(new URL(`./lang/${locale}.json`, import.meta.url), "utf8")) as Record<string, string>;
        const i18n = createI18n({ legacy: true,
            locale,
            messages: { [locale]: messages } });
        for (const key of [ "port", "container", "home.stackState.active" ]) {
            const forms = messages[key].split("|").map(value => value.trim());
            for (const count of [ 0, 1, 2 ]) {
                const app = createSSRApp({
                    render() {
                        return h("span", this.$t(key, count));
                    },
                });
                app.use(i18n);
                const expected = forms.length === 1 ? forms[0] : forms[count === 1 ? 0 : 1];
                assert.equal(await renderToString(app), `<span>${expected}</span>`, `${key}: ${count}`);
            }
        }
    });
}
