#!/usr/bin/env python3
"""Reject new or worsened HIGH/CRITICAL npm audit findings in a pull request."""

import json
import sys


SEVERITY = {"low": 1, "moderate": 2, "high": 3, "critical": 4}


def findings(report):
    if (
        not isinstance(report, dict)
        or report.get("error")
        or report.get("auditReportVersion") != 2
        or not isinstance(report.get("vulnerabilities"), dict)
    ):
        raise ValueError("Rapport npm audit absent ou invalide ; comparaison impossible.")

    found = {}
    for package, vulnerability in report["vulnerabilities"].items():
        severity = SEVERITY.get(vulnerability.get("severity"))
        if severity is None or not isinstance(vulnerability.get("via"), list):
            raise ValueError(f"Entrée npm audit invalide pour {package}.")

        for via in vulnerability["via"]:
            if isinstance(via, str):
                advisory = f"dependency:{via}"
                advisory_severity = severity
            elif isinstance(via, dict):
                advisory = via.get("url") or via.get("source")
                if not advisory:
                    raise ValueError(f"Avis npm audit sans identifiant pour {package}.")
                advisory = str(advisory)
                advisory_severity = SEVERITY.get(via.get("severity", vulnerability["severity"]))
                if advisory_severity is None:
                    raise ValueError(f"Sévérité npm audit invalide pour {package}.")
            else:
                raise ValueError(f"Avis npm audit invalide pour {package}.")

            key = (package, advisory)
            found[key] = max(found.get(key, 0), advisory_severity)
    return found


def regressions(base, head):
    before, after = findings(base), findings(head)
    return sorted(
        (package, advisory, severity)
        for (package, advisory), severity in after.items()
        if severity >= SEVERITY["high"] and severity > before.get((package, advisory), 0)
    )


def load(path):
    with open(path, encoding="utf-8") as stream:
        return json.load(stream)


def main(base_path, head_path):
    base, head = load(base_path), load(head_path)
    new = regressions(base, head)
    base_count = sum(level >= SEVERITY["high"] for level in findings(base).values())
    head_count = sum(level >= SEVERITY["high"] for level in findings(head).values())
    print(f"Avis npm HIGH/CRITICAL — main : {base_count} ; PR : {head_count} ; nouveaux ou aggravés : {len(new)}")
    for package, advisory, severity in new:
        level = "CRITICAL" if severity == SEVERITY["critical"] else "HIGH"
        print(f"NOUVEAU {level} {package} {advisory}")
    return 1 if new else 0


if __name__ == "__main__":
    try:
        raise SystemExit(main(sys.argv[1], sys.argv[2]))
    except (IndexError, OSError, ValueError, json.JSONDecodeError) as error:
        print(f"Échec de la comparaison npm audit : {error}", file=sys.stderr)
        raise SystemExit(2) from error
