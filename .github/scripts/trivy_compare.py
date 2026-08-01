#!/usr/bin/env python3
import json
import sys

def findings(path):
    with open(path, encoding="utf-8") as stream:
        data = json.load(stream)
    found = set()
    for result in data.get("Results") or []:
        target = result.get("Target", "")
        for item in result.get("Vulnerabilities") or []:
            if item.get("Severity") in {"HIGH", "CRITICAL"} and item.get("FixedVersion"):
                found.add(("vulnerability", target, item.get("VulnerabilityID", "?"), item.get("PkgName", "?")))
        for item in result.get("Misconfigurations") or []:
            if item.get("Severity") in {"HIGH", "CRITICAL"} and item.get("Status", "FAIL") == "FAIL":
                found.add(("misconfiguration", target, item.get("ID", "?"), item.get("Title", "?")))
        for item in result.get("Secrets") or []:
            if item.get("Severity") in {"HIGH", "CRITICAL"}:
                found.add(("secret", target, item.get("RuleID", "?"), item.get("Title", "?")))
    return found

before, after = findings(sys.argv[1]), findings(sys.argv[2])
new = sorted(after - before)
print(f"Base: {len(before)} | PR: {len(after)} | Nouvelles: {len(new)}")
for finding in new[:100]:
    print("NEW", *finding)
raise SystemExit(1 if new else 0)
