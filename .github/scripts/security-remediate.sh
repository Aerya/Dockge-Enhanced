#!/usr/bin/env bash
set -Eeuo pipefail

changed=0

while IFS= read -r -d '' lock; do
  d="$(dirname "$lock")"
  echo "npm audit fix: $d"
  (
    cd "$d"
    npm audit fix --package-lock-only --ignore-scripts || true
  )
done < <(find . -maxdepth 5 -name package-lock.json \
  -not -path '*/node_modules/*' -print0)

python3 -m pip install --disable-pip-version-check --quiet \
  'pip-audit==2.10.1' 'packaging>=24' || true

while IFS= read -r -d '' req; do
  echo "pip-audit fix: $req"
  python3 -m pip_audit -r "$req" --fix --dry-run >/dev/null 2>&1 || true
  python3 -m pip_audit -r "$req" --fix >/dev/null 2>&1 || true
done < <(find . -maxdepth 5 -name 'requirements*.txt' \
  -not -path '*/.venv/*' -print0)

while IFS= read -r -d '' gomod; do
  d="$(dirname "$gomod")"
  echo "Go patch updates: $d"
  (
    cd "$d"
    go get -u=patch ./... || true
    go mod tidy || true
  )
done < <(find . -maxdepth 5 -name go.mod -print0)

if ! git diff --quiet; then
  changed=1
fi

echo "changed=$changed" >> "${GITHUB_OUTPUT:-/dev/null}"
