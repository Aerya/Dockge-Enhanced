#!/usr/bin/env bash
set -Eeuo pipefail

run_node() {
  local d="$1"
  pushd "$d" >/dev/null
  if [[ -f package-lock.json ]]; then
    npm ci --ignore-scripts
    for script in lint typecheck test build; do
      if node -e "const p=require('./package.json'); process.exit(p.scripts?.['$script'] ? 0 : 1)"; then
        npm run "$script"
      fi
    done
  fi
  popd >/dev/null
}

while IFS= read -r -d '' f; do run_node "$(dirname "$f")"; done < <(find . -maxdepth 4 -name package-lock.json -not -path '*/node_modules/*' -print0)

while IFS= read -r -d '' f; do
  d="$(dirname "$f")"
  (cd "$d" && go test ./...)
done < <(find . -maxdepth 4 -name go.mod -print0)

python3 -m compileall -q . || true
