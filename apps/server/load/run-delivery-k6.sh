#!/usr/bin/env bash
# Passes sourced values by environment name and orchestrates the disruptive M9 limiter profiles safely.
set -euo pipefail

repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
requested_scenario="${DELIVERY_SCENARIO:-}"
set -a
# shellcheck disable=SC1091
source "$repository_root/delivery-load.env"
set +a
if [[ -n "$requested_scenario" ]]; then
  DELIVERY_SCENARIO="$requested_scenario"
  export DELIVERY_SCENARIO
fi

secondary_container="framerfordevs-server-load-2"
redis_was_stopped=false
large_fixture_prepared=false
cleanup() {
  docker rm -f "$secondary_container" >/dev/null 2>&1 || true
  if [[ "$redis_was_stopped" == true ]]; then
    docker compose --project-directory "$repository_root" start redis >/dev/null
  fi
  if [[ "$large_fixture_prepared" == true ]]; then
    pnpm --dir "$repository_root" --filter @framerfordevs/api delivery:load-boundary -- --restore || true
  fi
}
trap cleanup EXIT INT TERM

wait_for_url() {
  local url="$1"
  for _ in $(seq 1 60); do
    if curl --fail --silent --show-error "$url" >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done
  printf 'Timed out waiting for %s\n' "$url" >&2
  return 1
}

wait_for_redis() {
  for _ in $(seq 1 60); do
    if docker compose --project-directory "$repository_root" exec -T redis redis-cli ping 2>/dev/null | grep -qx PONG; then
      return 0
    fi
    sleep 1
  done
  printf 'Timed out waiting for Redis recovery.\n' >&2
  return 1
}

if [[ "${DELIVERY_SCENARIO:-}" == "intentional_429" ]]; then
  docker rm -f "$secondary_container" >/dev/null 2>&1 || true
  docker compose --project-directory "$repository_root" run --rm --detach --no-deps \
    --name "$secondary_container" --publish 3002:3000 server >/dev/null
  DELIVERY_SECONDARY_BASE_URL="http://localhost:3002"
  export DELIVERY_SECONDARY_BASE_URL
  wait_for_url "$DELIVERY_SECONDARY_BASE_URL/"
fi

variables=(
  DELIVERY_SCENARIO
  DELIVERY_BASE_URL
  DELIVERY_SECONDARY_BASE_URL
  DELIVERY_PROJECT_ID
  DELIVERY_ENVIRONMENT_KEY
  DELIVERY_COLLECTION_KEY
  DELIVERY_LOCALE
  DELIVERY_ENTRY_IDS
  DELIVERY_UNIQUE_VALUES
  DELIVERY_FILTER_VALUE
  DELIVERY_CREDENTIALS
  DELIVERY_WARMUP_DURATION
  DELIVERY_MEASURE_DURATION
  DELIVERY_MIXED_RATE
  DELIVERY_LIST_RATE
  DELIVERY_EXPANSION_RATE
  DELIVERY_RATE_LIMIT_RATE
  DELIVERY_OUTAGE_RATE
  DELIVERY_REVALIDATION_RATE
  DELIVERY_BOUNDARY_RATE
)
environment_arguments=()
for variable in "${variables[@]}"; do
  if [[ -n "${!variable:-}" ]]; then
    environment_arguments+=(--env "$variable")
  fi
done

run_k6() {
  docker run --rm --network host \
    "${environment_arguments[@]}" \
    --volume "$repository_root/apps/server/load:/scripts:ro" \
    grafana/k6:latest run /scripts/delivery.k6.js "$@"
}

if [[ "${DELIVERY_SCENARIO:-}" == "large_response" ]]; then
  pnpm --dir "$repository_root" --filter @framerfordevs/api delivery:load-boundary -- --prepare
  large_fixture_prepared=true
  run_k6 "$@"
  pnpm --dir "$repository_root" --filter @framerfordevs/api delivery:load-boundary -- --restore
  large_fixture_prepared=false
  exit 0
fi

if [[ "${DELIVERY_SCENARIO:-}" != "redis_outage" ]]; then
  run_k6 "$@"
  exit $?
fi

outage_start_delay_seconds="${DELIVERY_OUTAGE_START_DELAY_SECONDS:-20}"
outage_duration_seconds="${DELIVERY_OUTAGE_DURATION_SECONDS:-15}"
if ! [[ "$outage_start_delay_seconds" =~ ^[1-9][0-9]*$ && "$outage_duration_seconds" =~ ^[1-9][0-9]*$ ]]; then
  printf 'Redis outage delays must be positive integer seconds.\n' >&2
  exit 1
fi

printf 'Starting Redis outage gate; Redis will stop after %ss for %ss.\n' \
  "$outage_start_delay_seconds" "$outage_duration_seconds"
run_k6 "$@" &
k6_pid=$!
sleep "$outage_start_delay_seconds"
docker compose --project-directory "$repository_root" stop redis >/dev/null
redis_was_stopped=true
printf 'Redis is stopped; Delivery requests must use bounded degraded-memory enforcement.\n'
sleep "$outage_duration_seconds"
docker compose --project-directory "$repository_root" start redis >/dev/null
wait_for_redis
redis_was_stopped=false
printf 'Redis is healthy again; continuing traffic verifies automatic recovery.\n'
wait "$k6_pid"

redis_keys="$(docker compose --project-directory "$repository_root" exec -T redis redis-cli DBSIZE | tr -d '\r')"
if ! [[ "$redis_keys" =~ ^[1-9][0-9]*$ ]]; then
  printf 'Redis recovery was not observed: no limiter keys were recreated.\n' >&2
  exit 1
fi
printf 'Redis recovery verified with %s bounded limiter keys.\n' "$redis_keys"
