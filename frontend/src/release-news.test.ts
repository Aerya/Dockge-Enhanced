import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { RELEASE_NEWS, getUnreadReleaseNews, sanitizeSeenReleaseNewsIds, getInitialSeenReleaseNewsIds } from "./release-news.js";

test("les nouvelles annonces sont courtes, traduites et visibles au premier passage", () => {
    const additions = RELEASE_NEWS.filter(release => release.id.startsWith("2026-11-14-image-"));
    assert.ok(additions.length > 0);
    assert.deepEqual(getUnreadReleaseNews(getInitialSeenReleaseNewsIds(null)), [ additions.at(-1) ]);
    for (const locale of [ "en", "fr", "de", "es", "zh-CN" ]) {
        const messages = JSON.parse(readFileSync(new URL(`./lang/${locale}.json`, import.meta.url), "utf8"));
        for (const addition of additions) {
            for (const key of addition.items) {
                assert.equal(typeof messages[key], "string");
                assert.ok(messages[key].length > 0 && messages[key].length < 500);
            }
        }
    }
});

const latest = RELEASE_NEWS.find(release => release.id === "2026-11-06-compose-containers-security")!;

test("les annonces rattrapées sont traduites dans les cinq langues", () => {
    assert.equal(latest.id, "2026-11-06-compose-containers-security");
    assert.equal(latest.items.length, 8);
    for (const locale of [ "en", "fr", "de", "es", "zh-CN" ]) {
        const messages = JSON.parse(readFileSync(new URL(`./lang/${locale}.json`, import.meta.url), "utf8"));
        for (const key of latest.items) {
            assert.equal(typeof messages[key], "string", `${locale}: ${key}`);
            assert.ok(messages[key].trim().length > 0);
            assert.ok(messages[key].length < 500, `${locale}: annonce trop longue`);
        }
    }
});

test("un compte ayant lu les anciennes annonces reçoit le rattrapage une seule fois après acquittement", () => {
    const previous = RELEASE_NEWS.filter(release => release !== latest).map(release => release.id);
    assert.deepEqual(getUnreadReleaseNews(previous), [ latest ]);
    const acknowledged = sanitizeSeenReleaseNewsIds([ ...previous, latest.id, latest.id ]);
    assert.deepEqual(getUnreadReleaseNews(acknowledged), []);
});

test("le rattrapage conserve les annonces précédentes encore non lues", () => {
    const previousUnread = RELEASE_NEWS.at(-1)!;
    const seen = RELEASE_NEWS.filter(release => release !== latest && release !== previousUnread).map(release => release.id);
    assert.deepEqual(getUnreadReleaseNews(seen), [ latest, previousUnread ]);
    assert.equal(new Set(RELEASE_NEWS.map(release => release.id)).size, RELEASE_NEWS.length);
});
