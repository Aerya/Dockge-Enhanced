import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { RELEASE_NEWS } from "./release-news.js";

type Messages = Record<string, string | Record<string, string>>;

function loadMessages(locale: string): Messages {
    return JSON.parse(readFileSync(new URL(`./lang/${locale}.json`, import.meta.url), "utf8")) as Messages;
}

function markers(value: string): string[] {
    return (value.match(/\{[^{}]+\}|%[sd]/g) ?? []).sort();
}

test("la traduction allemande couvre les clés et variables de l’anglais", () => {
    const english = loadMessages("en");
    const german = loadMessages("de");

    for (const [key, value] of Object.entries(english)) {
        assert.ok(Object.hasOwn(german, key), `Clé allemande manquante : ${key}`);
        const translation = german[key];
        assert.equal(typeof translation, typeof value, `Type incorrect : ${key}`);

        if (typeof value === "string" && typeof translation === "string") {
            assert.deepEqual(markers(translation), markers(value), `Variables modifiées : ${key}`);
        } else if (typeof value === "object" && value && typeof translation === "object" && translation) {
            assert.deepEqual(Object.keys(translation).sort(), Object.keys(value).sort(), `Sous-clés manquantes : ${key}`);
        }
    }
});

test("toutes les nouveautés ont un texte allemand", () => {
    const german = loadMessages("de");
    for (const release of RELEASE_NEWS) {
        for (const key of release.items) {
            assert.equal(typeof german[key], "string", `Nouveauté non traduite : ${key}`);
            assert.ok((german[key] as string).trim(), `Nouveauté vide : ${key}`);
        }
    }
});
