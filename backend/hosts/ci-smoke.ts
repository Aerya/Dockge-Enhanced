import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { parseReport } from "./report";
import { scanHost } from "./security";
if (process.env.GITHUB_ACTIONS !== "true" || !process.env.HOST_TEST_REPORT) {
    throw new Error("Disposable GitHub Actions runner only");
}
const report = parseReport(JSON.parse(await readFile(process.env.HOST_TEST_REPORT, "utf8")));
assert.equal(report.provider, "apt");
assert.ok(report.packages.length > 0);
const result = await scanHost(report);
assert.equal(result.state, "partial");
assert.match(result.database!, /^[a-f0-9]{64}$/);
console.log("Host metadata scan with real Trivy succeeded; package inventory was not transmitted.");
