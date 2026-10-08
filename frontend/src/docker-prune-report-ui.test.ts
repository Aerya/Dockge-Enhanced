import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

test("la page Images conserve et distingue les rapports manuels et automatiques", () => {
    const source = fs.readFileSync(path.join(process.cwd(), "frontend/src/pages/DockerResources.vue"), "utf8");
    assert.match(source, /api\("GET", "images\/prune-reports"\)/);
    assert.match(source, /imagePruneReports\.length/);
    assert.match(source, /pruneOrigin\.\$\{report\.origin\}/);
    assert.match(source, /report\.examined/);
    assert.match(source, /item\.references\.join/);
    assert.match(source, /pruneOutcome\.\$\{item\.outcome\}/);
    assert.match(source, /pruneReportOutcomes/);
    assert.match(source, /pruneReportOutcomeCount\(report, outcome\)/);
});

test("la page Images distingue l'utilisation Docker de l'état de purge", () => {
    const source = fs.readFileSync(path.join(process.cwd(), "frontend/src/pages/DockerResources.vue"), "utf8");
    assert.match(source, /dockerResources\.images\.cols\.status/);
    assert.match(source, /dockerResources\.images\.cols\.purgeState/);
    assert.match(source, /dockerResources\.images\.status\." \+ img\.status/);
    assert.match(source, /dockerResources\.images\.purgeState\." \+ img\.purgeState/);
    assert.match(source, /purgeStateBadge\(img\.purgeState\)/);

    const router = fs.readFileSync(path.join(process.cwd(), "backend/routers/docker-resources-router.ts"), "utf8");
    assert.match(router, /getImagePurgeStates/);
    assert.match(router, /purgeState: purge\?\.state/);
});

test("une image sans tag n'est pas décrite comme une ancienne image", () => {
    const source = fs.readFileSync(path.join(process.cwd(), "frontend/src/pages/DockerResources.vue"), "utf8");
    assert.match(source, /dockerResources\.images\.untaggedImage/);
    assert.doesNotMatch(source, />ancienne image</);
});
