#!/usr/bin/env python3
import json, sys

def findings(path):
    try:
        data=json.load(open(path))
    except Exception:
        return set()
    found=set()
    for result in data.get('Results') or []:
        target=result.get('Target','')
        for v in result.get('Vulnerabilities') or []:
            if v.get('Severity') in {'HIGH','CRITICAL'} and v.get('FixedVersion'):
                found.add(('vuln', target, v.get('VulnerabilityID','?'), v.get('PkgName','?')))
        for m in result.get('Misconfigurations') or []:
            if m.get('Severity') in {'HIGH','CRITICAL'} and m.get('Status','FAIL') == 'FAIL':
                found.add(('misconfig', target, m.get('ID','?'), m.get('Title','?')))
        for s in result.get('Secrets') or []:
            if s.get('Severity') in {'HIGH','CRITICAL'}:
                found.add(('secret', target, s.get('RuleID','?'), s.get('Title','?')))
    return found

mode, before_path, after_path = sys.argv[1:4]
before, after = findings(before_path), findings(after_path)
new = sorted(after-before)
removed = sorted(before-after)
print(f'Avant: {len(before)} | Après: {len(after)} | Nouvelles: {len(new)} | Corrigées: {len(removed)}')
for item in new[:50]: print('NEW', *item)
for item in removed[:50]: print('FIXED', *item)
if mode == 'regression':
    raise SystemExit(1 if new else 0)
if mode == 'improvement':
    raise SystemExit(0 if len(after) < len(before) else 1)
raise SystemExit(2)
