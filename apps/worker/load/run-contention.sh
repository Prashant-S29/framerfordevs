#!/usr/bin/env bash
# Runs sustained producer, dispatcher, and attempt contention across independent processes.
set -euo pipefail

run_id="$(node -e 'process.stdout.write(require("node:crypto").randomUUID())')"
cleanup() {
  docker compose run --rm --no-deps server \
    pnpm --dir /app/packages/api exec tsx src/scripts/webhook/contention-load.ts cleanup "$run_id" \
    >/dev/null 2>&1 || true
  docker compose up -d worker >/dev/null 2>&1 || true
}
trap cleanup EXIT

run_role() {
  local role="$1"
  timeout 240 docker compose run --rm --no-deps server \
    pnpm --dir /app/packages/api exec tsx src/scripts/webhook/contention-load.ts "$role" "$run_id"
}

docker compose stop worker >/dev/null
docker compose build server >/dev/null
run_role setup

run_role produce >/dev/null &
producer_pid=$!
run_role dispatch >/dev/null &
dispatcher_one_pid=$!
run_role dispatch >/dev/null &
dispatcher_two_pid=$!
run_role attempt >/dev/null &
attempt_one_pid=$!
run_role attempt >/dev/null &
attempt_two_pid=$!

wait "$producer_pid" "$dispatcher_one_pid" "$dispatcher_two_pid" "$attempt_one_pid" "$attempt_two_pid"
run_role reconcile
