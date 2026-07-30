#!/usr/bin/env bash
set -Eeuo pipefail
changed=0

# npm : sans --force, donc aucune montée majeure hors plage déclarée.
while IFS= read -r -d '' lock; do
  d="$(dirname "$lock")"
  echo "npm audit fix dans $d"
  (cd "$d" && npm audit fix --package-lock-only --ignore-scripts || true)
done < <(find . -maxdepth 4 -name package-lock.json -not -path '*/node_modules/*' -print0)

# Python : mise à jour uniquement des dépendances directes exactement épinglées.
# pip-audit fournit les versions corrigées ; un petit script réécrit seulement
# les lignes nom==version présentes dans le requirements concerné.
python3 -m pip install --disable-pip-version-check --quiet 'pip-audit==2.10.1' || true
while IFS= read -r -d '' req; do
  if grep -Eq '^[[:space:]]*(-r|--requirement|--index-url|--extra-index-url|-e|https?://)' "$req"; then
    echo "Python ignoré (requirements complexe) : $req"
    continue
  fi
  report="$(mktemp)"
  python3 -m pip_audit -r "$req" --format json > "$report" 2>/dev/null || true
  python3 - "$req" "$report" <<'PYFIX'
import json, re, sys
from pathlib import Path
req=Path(sys.argv[1]); report=Path(sys.argv[2])
try: data=json.loads(report.read_text())
except Exception: raise SystemExit(0)
fixes={}
for dep in data:
    name=(dep.get('name') or '').lower().replace('_','-')
    versions=[]
    for vuln in dep.get('vulns') or []:
        versions += vuln.get('fix_versions') or []
    if versions:
        try:
            from packaging.version import Version
            fixes[name]=str(max(map(Version, versions)))
        except Exception:
            fixes[name]=sorted(versions)[-1]
lines=[]; changed=False
pat=re.compile(r'^(\s*)([A-Za-z0-9_.-]+)==([^\s;#]+)(.*)$')
for line in req.read_text().splitlines(True):
    m=pat.match(line.rstrip('\n'))
    if not m:
        lines.append(line); continue
    key=m.group(2).lower().replace('_','-')
    target=fixes.get(key)
    if target and target != m.group(3):
        nl='\n' if line.endswith('\n') else ''
        line=f'{m.group(1)}{m.group(2)}=={target}{m.group(4)}{nl}'
        changed=True
    lines.append(line)
if changed: req.write_text(''.join(lines))
PYFIX
  rm -f "$report"
done < <(find . -maxdepth 4 -name 'requirements*.txt' -print0)

# Go : seulement les mises à jour patch, puis tidy.
while IFS= read -r -d '' gomod; do
  d="$(dirname "$gomod")"
  echo "go get -u=patch dans $d"
  (cd "$d" && go get -u=patch ./... && go mod tidy) || true
done < <(find . -maxdepth 4 -name go.mod -print0)

if ! git diff --quiet; then changed=1; fi
echo "changed=$changed" >> "${GITHUB_OUTPUT:-/dev/null}"
