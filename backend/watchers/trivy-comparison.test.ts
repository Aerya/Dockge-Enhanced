import test from "node:test";
import assert from "node:assert/strict";
import { compareImageScans, type ComparisonFinding, type ComparisonScan } from "./trivy-comparison";

const finding = (id: string, overrides: Partial<ComparisonFinding> = {}): ComparisonFinding => ({ vulnerabilityId: id,
    packageName: "libexample",
    ecosystem: "alpine",
    target: "os",
    severity: "HIGH",
    installedVersion: "1.0",
    ...overrides });
const scan = (findings: ComparisonFinding[], overrides: Partial<ComparisonScan> = {}): ComparisonScan => ({ digest: `sha256:${"a".repeat(64)}`,
    platform: "linux/amd64",
    databaseRevision: "db-revision-1",
    status: "success",
    findings,
    ...overrides });

test("equal totals can conceal one removed CVE and one introduced CVE", () => {
    const result = compareImageScans(scan([ finding("CVE-1") ]), scan([ finding("CVE-2") ]));
    assert.equal(result.noLongerDetected.length, 1);
    assert.equal(result.newlyDetected.length, 1);
    assert.equal(result.persistent.length, 0);
});

test("changed package version or severity does not mean a CVE disappeared", () => {
    const result = compareImageScans(scan([ finding("CVE-1") ]), scan([ finding("CVE-1", { installedVersion: "2.0", severity: "CRITICAL" }) ]));
    assert.equal(result.persistent.length, 1);
    assert.equal(result.noLongerDetected.length, 0);
    assert.equal(result.persistent[0].after.severity, "CRITICAL");
});

test("same CVE in different packages stays distinct and exact duplicates collapse", () => {
    const result = compareImageScans(scan([ finding("CVE-1"), finding("CVE-1"), finding("CVE-1", { packageName: "other" }) ]), scan([]));
    assert.equal(result.noLongerDetected.length, 2);
});

test("failed scans and differing databases/platforms cannot become zero CVEs", () => {
    for (const overrides of [ { status: "error" as const }, { databaseRevision: "other" }, { platform: "linux/arm64" }, { digest: "latest" } ]) {
        assert.throws(() => compareImageScans(scan([]), scan([], overrides)));
    }
    assert.throws(() => compareImageScans(scan([ finding("CVE-1"), finding("CVE-1", { installedVersion: "2.0" }) ]), scan([])));
});
