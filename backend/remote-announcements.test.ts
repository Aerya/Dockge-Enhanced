import test from "node:test";
import assert from "node:assert/strict";
import {
    announcementMatchesBuild,
    parseRemoteAnnouncementDocument,
    selectAnnouncementText,
} from "./remote-announcements";

const base = {
    version: 1,
    announcements: [{
        id: "incident-2026-09",
        enabled: true,
        severity: "warning",
        title: { en: "Important", fr: "Important" },
        message: { en: "Update manually.", fr: "Mettez à jour manuellement." },
        dismissible: true,
    }],
};

test("refuse les documents ou annonces invalides", () => {
    assert.deepEqual(parseRemoteAnnouncementDocument({ version: 2, announcements: [] }), []);
    assert.deepEqual(parseRemoteAnnouncementDocument({
        version: 1,
        announcements: [{ ...base.announcements[0], id: "../bad" }],
    }), []);
    assert.deepEqual(parseRemoteAnnouncementDocument({
        version: 1,
        announcements: [{ ...base.announcements[0], severity: "html" }],
    }), []);
});

test("n'accepte que les URL HTTPS", () => {
    const https = parseRemoteAnnouncementDocument({
        ...base,
        announcements: [{ ...base.announcements[0], url: "https://github.com/Aerya/Dockge-Enhanced" }],
    });
    assert.equal(https[0].url?.startsWith("https://"), true);

    const http = parseRemoteAnnouncementDocument({
        ...base,
        announcements: [{ ...base.announcements[0], url: "http://example.test" }],
    });
    assert.equal(http[0].url, undefined);
});

test("cible les versions sans élargir les bornes", () => {
    const [announcement] = parseRemoteAnnouncementDocument({
        ...base,
        announcements: [{
            ...base.announcements[0],
            target: { minVersion: "1.5.4", maxVersion: "1.6.0" },
        }],
    });
    assert.equal(announcementMatchesBuild(announcement, "1.5.3"), false);
    assert.equal(announcementMatchesBuild(announcement, "1.5.4"), true);
    assert.equal(announcementMatchesBuild(announcement, "1.6.0"), true);
    assert.equal(announcementMatchesBuild(announcement, "1.6.1"), false);
});

test("cible une révision exacte ou abrégée", () => {
    const [announcement] = parseRemoteAnnouncementDocument({
        ...base,
        announcements: [{
            ...base.announcements[0],
            target: { revisions: ["0fc2564"] },
        }],
    });
    assert.equal(announcementMatchesBuild(announcement, "1.5.4", { revision: "0fc2564a6ca33a43e83d70f4d7f9160f6dc54e4c" }), true);
    assert.equal(announcementMatchesBuild(announcement, "1.5.4", { revision: "deadbeef" }), false);
    assert.equal(announcementMatchesBuild(announcement, "1.5.4"), false);
});

test("cible la date OCI sans afficher si la métadonnée locale manque", () => {
    const [announcement] = parseRemoteAnnouncementDocument({
        ...base,
        announcements: [{
            ...base.announcements[0],
            target: { createdBefore: "2026-09-02T09:00:00Z" },
        }],
    });
    assert.equal(announcementMatchesBuild(announcement, "1.5.4", { created: "2026-09-02T08:59:59Z" }), true);
    assert.equal(announcementMatchesBuild(announcement, "1.5.4", { created: "2026-09-02T09:00:01Z" }), false);
    assert.equal(announcementMatchesBuild(announcement, "1.5.4"), false);
});

test("choisit la langue exacte puis la langue de base puis l'anglais", () => {
    const text = { en: "English", fr: "Français", "zh-CN": "简体中文" };
    assert.equal(selectAnnouncementText(text, "zh-CN"), "简体中文");
    assert.equal(selectAnnouncementText(text, "fr-FR"), "Français");
    assert.equal(selectAnnouncementText(text, "de-DE"), "English");
});

