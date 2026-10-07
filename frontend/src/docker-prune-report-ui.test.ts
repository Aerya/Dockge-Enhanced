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
