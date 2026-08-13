import test from "node:test";
import assert from "node:assert/strict";
import { discordWebhookPath } from "./discord";

test("accepte un webhook Discord officiel", () => {
    assert.equal(
        discordWebhookPath("https://discord.com/api/webhooks/123456/token_test-ABC"),
        "/api/webhooks/123456/token_test-ABC"
    );
});

test("conserve les paramètres Discord autorisés par le webhook", () => {
    assert.equal(
        discordWebhookPath("https://discord.com/api/webhooks/123456/token?wait=true"),
        "/api/webhooks/123456/token?wait=true"
    );
});

test("rejette les destinations qui imitent le domaine Discord", () => {
    assert.equal(discordWebhookPath("https://discord.com.example/api/webhooks/123/token"), null);
    assert.equal(discordWebhookPath("https://discord.com/api/webhooks/123/token@evil.example"), null);
});

test("rejette les protocoles et chemins non pris en charge", () => {
    assert.equal(discordWebhookPath("http://discord.com/api/webhooks/123/token"), null);
    assert.equal(discordWebhookPath("https://discord.com/api/users/@me"), null);
});
