#!/usr/bin/env bash
# Only run on a disposable CI Docker daemon, never on a production host.
set -euo pipefail
image="${1:?image required}"
test_dir=$(mktemp -d)
created=()
cleanup() {
    for id in "${created[@]}"; do docker rm -f "$id" >/dev/null; done
    rm -f "$test_dir/events.jsonl"
    rmdir "$test_dir"
}
trap cleanup EXIT
started=$(date +%s)
created+=("$(docker run -d --name monitoring-smoke-crash --label dockge-monitoring-smoke=true \
    --network none --read-only --restart always --entrypoint sh "$image" -c 'sleep 1; exit 1')")
created+=("$(docker run -d --name monitoring-smoke-unhealthy --label dockge-monitoring-smoke=true \
    --network none --read-only --health-cmd 'exit 1' --health-interval 1s --health-retries 1 --health-start-period 1s \
    --entrypoint sh "$image" -c 'sleep 120')")
ready=false
for _ in $(seq 1 30); do
    if [[ $(docker inspect -f '{{.RestartCount}}' "${created[0]}") -ge 2 ]] && \
       [[ $(docker inspect -f '{{.State.Health.Status}}' "${created[1]}") == unhealthy ]]; then
        ready=true
        break
    fi
    sleep 1
done
if [[ "$ready" != true ]]; then
    docker inspect --format '{{.Name}} restarts={{.RestartCount}} state={{json .State}}' "${created[@]}"
    exit 1
fi
# Make the exclusive upper bound later than the events being checked.
sleep 1
finished=$(date +%s)
# Use the CLI shipped in Enhanced, not the runner's CLI, to reproduce #592.
docker run --rm --network none --entrypoint docker \
    -v /var/run/docker.sock:/var/run/docker.sock "$image" events \
    --since "$started" --until "$finished" --format '{{json .}}' \
    --filter label=dockge-monitoring-smoke=true --filter event=die --filter event=health_status \
    > "$test_dir/events.jsonl"
docker run --rm --network none --read-only --tmpfs /tmp \
    -v "$test_dir/events.jsonl:/events.jsonl:ro" \
    -e MONITORING_EVENT_FIXTURE=/events.jsonl \
    --entrypoint ./node_modules/.bin/tsx "$image" --test backend/watchers/monitoring-watcher.test.ts
