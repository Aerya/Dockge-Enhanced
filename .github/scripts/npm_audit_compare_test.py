import unittest

from npm_audit_compare import findings, regressions


def report(vulnerabilities):
    return {"auditReportVersion": 2, "vulnerabilities": vulnerabilities}


def entry(severity, advisory="https://example.test/GHSA-1"):
    return {"severity": severity, "via": [{"url": advisory}]}


class AuditComparisonTest(unittest.TestCase):
    def test_unchanged_baseline_and_removal_pass(self):
        base = report({"existing": entry("high"), "removed": entry("critical")})
        head = report({"existing": entry("high")})
        self.assertEqual(regressions(base, head), [])

    def test_new_package_or_advisory_fails(self):
        base = report({"existing": entry("high")})
        head = report({
            "existing": {"severity": "high", "via": [
                {"url": "https://example.test/GHSA-1"},
                {"url": "https://example.test/GHSA-2"},
            ]},
            "added": entry("high"),
        })
        self.assertEqual(len(regressions(base, head)), 2)

    def test_severity_increase_fails(self):
        base = report({"existing": entry("moderate")})
        head = report({"existing": entry("high")})
        self.assertEqual(len(regressions(base, head)), 1)
        self.assertEqual(len(regressions(head, report({"existing": entry("critical")}))), 1)

    def test_new_moderate_advisory_does_not_fail_for_high_package(self):
        base = report({"existing": entry("high")})
        head = report({"existing": {"severity": "high", "via": [
            {"url": "https://example.test/GHSA-1", "severity": "high"},
            {"url": "https://example.test/GHSA-2", "severity": "moderate"},
        ]}})
        self.assertEqual(regressions(base, head), [])

    def test_indirect_vulnerabilities_are_compared(self):
        base = report({"parent": {"severity": "high", "via": ["child"]}})
        head = report({"parent": {"severity": "high", "via": ["child"]}})
        self.assertEqual(regressions(base, head), [])
        self.assertEqual(len(regressions(report({}), head)), 1)

    def test_missing_or_invalid_report_fails_closed(self):
        with self.assertRaises(ValueError):
            findings({"error": {"message": "registry unavailable"}})
        with self.assertRaises(ValueError):
            findings(report({"package": {"severity": "high", "via": [{}]}}))


if __name__ == "__main__":
    unittest.main()
