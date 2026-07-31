#!/usr/bin/env python3
import json
import sys

def findings(path):
    try:
        data = json.load(open(path, encoding="utf-8"))
    except Exception:
        return set()

    out = set()
    for result in data.get("Results") or []:
        target = result.get("Target", "")
        for vuln in result.get("Vulnerabilities") or []:
            if (
                vuln.get("Severity") in {"HIGH", "CRITICAL"}
                and vuln.get("FixedVersion")
            ):
                out.add((
                    "vulnerability",
                    target,
                    vuln.get("VulnerabilityID", "?"),
                    vuln.get("PkgName", "?"),
                ))
        for secret in result.get("Secrets") or []:
            if secret.get("Severity") in {"HIGH", "CRITICAL"}:
                out.add((
                    "secret",
                    target,
                    secret.get("RuleID", "?"),
                    secret.get("Title", "?"),
                ))
        for cfg in result.get("Misconfigurations") or []:
            if (
                cfg.get("Severity") in {"HIGH", "CRITICAL"}
                and cfg.get("Status", "FAIL") == "FAIL"
            ):
                out.add((
                    "misconfiguration",
                    target,
                    cfg.get("ID", "?"),
                    cfg.get("Title", "?"),
                ))
    return out

mode, before_path, after_path = sys.argv[1:4]
before = findings(before_path)
after = findings(after_path)
new = sorted(after - before)
fixed = sorted(before - after)

print(f"before={len(before)} after={len(after)} new={len(new)} fixed={len(fixed)}")
for item in new[:100]:
    print("NEW", *item)
for item in fixed[:100]:
    print("FIXED", *item)

if mode == "regression":
    raise SystemExit(1 if new else 0)
if mode == "improvement":
    raise SystemExit(0 if len(after) < len(before) else 1)
raise SystemExit(2)
