#!/usr/bin/env bash
set -euo pipefail
[[ "${GITHUB_ACTIONS:-}" == true ]] || { echo 'Disposable GitHub Actions VM only'; exit 1; }
setup_test_dir=$(mktemp -d)
setup_test_image="dockge-host-setup-ci:${GITHUB_RUN_ID}"
cleanup() {
 docker rm -f dockge-host-setup-ci dockge-host-bridge-ci >/dev/null 2>&1 || true
 sudo systemctl disable --now dockge-host-collector.timer dockge-host-executor.timer >/dev/null 2>&1 || true
 sudo rm -f /etc/systemd/system/dockge-host-{collector,executor}.{timer,service}
 sudo systemctl daemon-reload
 rm -rf "$setup_test_dir"
}
trap cleanup EXIT
cp extra/host-management/*.{py,cjs,service,timer} "$setup_test_dir/"
npx esbuild backend/hosts/bridge-cli.ts --bundle --platform=node --format=esm --outfile="$setup_test_dir/bridge.mjs"
cat > "$setup_test_dir/Dockerfile" <<'DOCKER'
FROM node:22-alpine
RUN apk add --no-cache util-linux
WORKDIR /app/extra/host-management
COPY . .
DOCKER
docker build -q -t "$setup_test_image" "$setup_test_dir" >/dev/null
setup_test_options=$(printf '%s' '{"mode":"monitor","scopes":["security"],"hours":[2],"packages":[],"refreshMetadata":false}' | base64 -w0)
docker run --name dockge-host-setup-ci --privileged --pid=host --network none "$setup_test_image" node bootstrap.cjs "$setup_test_options"
sudo systemctl is-enabled --quiet dockge-host-collector.timer
sudo systemctl is-active --quiet dockge-host-collector.timer
docker run -d --name dockge-host-bridge-ci --read-only --cap-drop ALL --network none --security-opt no-new-privileges \
 --mount type=bind,source=/var/lib/dockge-host-reports,target=/host-reports,readonly \
 --mount type=bind,source=/var/lib/dockge-host-operations,target=/host-operations,readonly \
 --mount type=bind,source=/var/lib/dockge-host-requests,target=/host-requests \
 "$setup_test_image" node -e 'setInterval(()=>{},3600000)' >/dev/null
docker exec dockge-host-bridge-ci node bridge.mjs read > "$setup_test_dir/result.json"
python3 - "$setup_test_dir/result.json" <<'PY'
import json,sys
r=json.load(open(sys.argv[1]))
assert r['report']['provider']=='apt' and r['report']['packages']
assert r['operations']['manual'] is False
PY
if docker exec dockge-host-bridge-ci sh -c 'touch /host-reports/must-not-write' 2>/dev/null; then exit 1; fi
docker exec dockge-host-bridge-ci sh -c 'test ! -e /var/run/docker.sock'
# Change permissions through the same installer; no update request is submitted.
setup_test_manual=$(printf '%s' '{"mode":"manual","scopes":["security"],"hours":[2],"packages":[],"refreshMetadata":false}' | base64 -w0)
docker rm dockge-host-setup-ci >/dev/null
docker run --name dockge-host-setup-ci --privileged --pid=host --network none "$setup_test_image" node bootstrap.cjs "$setup_test_manual"
sudo systemctl is-enabled --quiet dockge-host-executor.timer
for attempt in $(seq 1 20); do
 if sudo python3 -c 'import json; assert json.load(open("/var/lib/dockge-host-operations/capabilities.json"))["manual"]'; then break; fi
 sleep 2
done
sudo python3 -c 'import json; p=json.load(open("/etc/dockge-host/policy.json")); assert p["allowInstall"] and not p["allowAutomatic"]'
docker exec dockge-host-bridge-ci node bridge.mjs read > "$setup_test_dir/manual.json"
python3 -c 'import json,sys; r=json.load(open(sys.argv[1])); assert r["operations"]["manual"] and not r["operations"]["automatic"]' "$setup_test_dir/manual.json"
# Revoke execution through the UI installer, without submitting any update.
docker rm dockge-host-setup-ci >/dev/null
docker run --name dockge-host-setup-ci --privileged --pid=host --network none "$setup_test_image" node bootstrap.cjs "$setup_test_options"
docker exec dockge-host-bridge-ci node bridge.mjs read > "$setup_test_dir/revoked.json"
python3 -c 'import json,sys; assert not json.load(open(sys.argv[1]))["operations"]["manual"]' "$setup_test_dir/revoked.json"
echo 'Guided setup, real systemd collector, immediate inventory, readonly bridge and idempotent retry passed'
