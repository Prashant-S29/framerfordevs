#!/usr/bin/env bash
# Sources Preview secrets by name and orchestrates only the approved disruptive profiles.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
requested="${PREVIEW_SCENARIO:-}"
set -a
# shellcheck disable=SC1091
source "$root/preview-load.env"
set +a
if [[ -n "$requested" ]]; then PREVIEW_SCENARIO="$requested"; export PREVIEW_SCENARIO; fi

secondary="framerfordevs-preview-load-2"
redis_stopped=false
cleanup() {
  docker rm -f "$secondary" >/dev/null 2>&1 || true
  if [[ "$redis_stopped" == true ]]; then
    docker compose --project-directory "$root" start redis >/dev/null
  fi
}
trap cleanup EXIT INT TERM

wait_url() {
  for _ in $(seq 1 60); do
    if curl --fail --silent "$1/" >/dev/null 2>&1; then return 0; fi
    sleep 1
  done
  printf 'Timed out waiting for %s\n' "$1" >&2
  return 1
}
wait_redis() {
  for _ in $(seq 1 60); do
    if docker compose --project-directory "$root" exec -T redis redis-cli ping 2>/dev/null | grep -qx PONG; then return 0; fi
    sleep 1
  done
  printf 'Timed out waiting for Redis recovery.\n' >&2
  return 1
}

if [[ "${PREVIEW_SCENARIO:-}" == "intentional_429" ]]; then
  docker rm -f "$secondary" >/dev/null 2>&1 || true
  docker compose --project-directory "$root" run --rm --detach --no-deps \
    --name "$secondary" --publish 3002:3000 server >/dev/null
  PREVIEW_SECONDARY_BASE_URL="http://localhost:3002"
  export PREVIEW_SECONDARY_BASE_URL
  wait_url "$PREVIEW_SECONDARY_BASE_URL"
fi

if [[ -z "${PREVIEW_RUN_ID:-}" ]]; then
  PREVIEW_RUN_ID="$(date -u +%Y%m%d%H%M%S)-$$"
  export PREVIEW_RUN_ID
fi
printf 'Preview load run ID: %s\n' "$PREVIEW_RUN_ID"

names=(PREVIEW_SCENARIO PREVIEW_RUN_ID PREVIEW_BASE_URL PREVIEW_SECONDARY_BASE_URL PREVIEW_CREDENTIALS
  PREVIEW_CURRENT_PATHS PREVIEW_REVISION_PATHS PREVIEW_OVERSIZED_PATH PREVIEW_CONCURRENCY_PATH PREVIEW_COHERENT_TUPLES
  PREVIEW_WARMUP_DURATION PREVIEW_MEASURE_DURATION PREVIEW_CURRENT_RATE PREVIEW_REVISION_RATE
  PREVIEW_RATE_LIMIT_RATE PREVIEW_OUTAGE_RATE PREVIEW_BOUNDARY_RATE PREVIEW_CONCURRENCY_RATE
  PREVIEW_EXPECTED_AUDIT_COUNT PREVIEW_AUDIT_VUS PREVIEW_AUDIT_MAX_DURATION)
args=()
for name in "${names[@]}"; do
  if [[ -n "${!name:-}" ]]; then args+=(--env "$name"); fi
done
run_k6() {
  docker run --rm --network host "${args[@]}" \
    --volume "$root/apps/server/load:/scripts:ro" grafana/k6:latest \
    run "$@" /scripts/preview.k6.js
}

if [[ "${PREVIEW_SCENARIO:-}" != "redis_outage" ]]; then run_k6 "$@"; exit $?; fi

start="${PREVIEW_OUTAGE_START_DELAY_SECONDS:-20}"
duration="${PREVIEW_OUTAGE_DURATION_SECONDS:-15}"
if ! [[ "$start" =~ ^[1-9][0-9]*$ && "$duration" =~ ^[1-9][0-9]*$ ]]; then
  printf 'Redis outage delays must be positive integer seconds.\n' >&2
  exit 1
fi
run_k6 "$@" & pid=$!
sleep "$start"
docker compose --project-directory "$root" stop redis >/dev/null
redis_stopped=true
sleep "$duration"
docker compose --project-directory "$root" start redis >/dev/null
wait_redis
redis_stopped=false
wait "$pid"
keys="$(docker compose --project-directory "$root" exec -T redis redis-cli DBSIZE | tr -d '\r')"
if ! [[ "$keys" =~ ^[1-9][0-9]*$ ]]; then
  printf 'Redis recovery was not observed.\n' >&2
  exit 1
fi
printf 'Redis recovery verified with %s bounded limiter keys.\n' "$keys"
