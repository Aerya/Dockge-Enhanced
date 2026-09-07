import assert from "node:assert/strict";
import test from "node:test";
import { suggestedExternalStackName } from "./util-external-stack-name";

test("conserve le nom normalisé du projet", () => {
    assert.equal(suggestedExternalStackName("My Compose App"), "my-compose-app");
});

test("retire le préfixe external devenu redondant", () => {
    assert.equal(suggestedExternalStackName("external-radarr"), "radarr");
    assert.equal(suggestedExternalStackName("external-external-sonarr"), "sonarr");
});

test("fournit un nom neutre si le projet ne contient aucun caractère exploitable", () => {
    assert.equal(suggestedExternalStackName("external"), "external");
    assert.equal(suggestedExternalStackName("---"), "stack");
});
