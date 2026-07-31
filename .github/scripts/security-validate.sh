#!/usr/bin/env bash
set -Eeuo pipefail

while IFS= read -r -d '' lock; do
  d="$(dirname "$lock")"
  (
    cd "$d"
    npm ci --ignore-scripts
    for script in lint typecheck test build; do
      if node -e "const p=require('./package.json');process.exit(p.scripts?.['$script']?0:1)"; then
        npm run "$script"
      fi
    done
  )
done < <(find . -maxdepth 5 -name package-lock.json \
  -not -path '*/node_modules/*' -print0)

while IFS= read -r -d '' gomod; do
  d="$(dirname "$gomod")"
  (cd "$d" && go test ./...)
done < <(find . -maxdepth 5 -name go.mod -print0)

python3 -m compileall -q . || true
