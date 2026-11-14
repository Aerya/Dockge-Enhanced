/** Compare immutable image scans, never a subtraction of severity totals. */
export interface ComparisonFinding {
    vulnerabilityId: string;
    packageName: string;
    ecosystem: string;
    target: string;
    severity: string;
    installedVersion: string;
    fixedVersion?: string;
}

export interface ComparisonScan {
    digest: string;
    platform: string;
    databaseRevision: string;
    status: "success" | "error";
    findings: ComparisonFinding[];
}

function indexScan(scan: ComparisonScan): Map<string, ComparisonFinding> {
    if (scan.status !== "success" || !/^sha256:[a-f0-9]{64}$/.test(scan.digest) || !scan.databaseRevision || !scan.platform || !Array.isArray(scan.findings)) {
        throw new Error("A complete scan of an immutable image is required");
    }
    const findings = new Map<string, ComparisonFinding>();
    for (const finding of scan.findings) {
        if (!finding.vulnerabilityId || !finding.packageName || !finding.ecosystem || !finding.target || !finding.severity) {
            throw new Error("Incomplete vulnerability finding");
        }
        // Installed version deliberately excluded: an upgrade can keep the same CVE.
        const key = JSON.stringify([ finding.target, finding.ecosystem, finding.packageName, finding.vulnerabilityId ]);
        const existing = findings.get(key);
        if (existing && (existing.installedVersion !== finding.installedVersion || existing.severity !== finding.severity)) {
            throw new Error("Ambiguous package identity in vulnerability scan");
        }
        findings.set(key, finding);
    }
    return findings;
}

export function compareImageScans(current: ComparisonScan, candidate: ComparisonScan) {
    const before = indexScan(current);
    const after = indexScan(candidate);
    if (current.platform !== candidate.platform || current.databaseRevision !== candidate.databaseRevision) {
        throw new Error("Comparison requires the same platform and vulnerability database revision");
    }
    return {
        // "No longer detected" does not claim an upstream fix: a package can be removed.
        noLongerDetected: [ ...before.entries() ].filter(([ key ]) => !after.has(key)).map(([ , value ]) => value),
        newlyDetected: [ ...after.entries() ].filter(([ key ]) => !before.has(key)).map(([ , value ]) => value),
        persistent: [ ...before.entries() ].filter(([ key ]) => after.has(key)).map(([ key, value ]) => ({ before: value,
            after: after.get(key)! })),
    };
}
