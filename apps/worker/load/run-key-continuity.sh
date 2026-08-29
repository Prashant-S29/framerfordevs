#!/usr/bin/env bash
# Proves cross-image persisted-key continuity without printing key material or enabling delivery.
set -euo pipefail

container_name="m11-key-continuity-worker"
endpoint_id=""
key_one="$(node -e 'process.stdout.write(require("node:crypto").randomBytes(32).toString("base64url"))')"
key_two="$(node -e 'process.stdout.write(require("node:crypto").randomBytes(32).toString("base64url"))')"
ring_one="$(KEY_ONE="$key_one" node -e 'process.stdout.write(JSON.stringify({"m11-key-one":process.env.KEY_ONE}))')"
ring_both="$(KEY_ONE="$key_one" KEY_TWO="$key_two" node -e 'process.stdout.write(JSON.stringify({"m11-key-one":process.env.KEY_ONE,"m11-key-two":process.env.KEY_TWO}))')"
ring_two="$(KEY_TWO="$key_two" node -e 'process.stdout.write(JSON.stringify({"m11-key-two":process.env.KEY_TWO}))')"

run_fixture() {
  local service="$1"
  local active_key="$2"
  local ring="$3"
  shift 3
  docker compose run --rm --no-deps \
    -e WEBHOOK_ENCRYPTION_ACTIVE_KEY_ID="$active_key" \
    -e WEBHOOK_ENCRYPTION_KEYS="$ring" \
    "$service" \
    pnpm --dir /app/packages/api exec tsx src/scripts/webhook/key-continuity.ts "$@"
}

remove_probe() {
  docker rm -f "$container_name" >/dev/null 2>&1 || true
}

cleanup() {
  remove_probe
  if [[ -n "$endpoint_id" ]]; then
    run_fixture server "m11-key-two" "$ring_both" cleanup "$endpoint_id" >/dev/null 2>&1 || true
  fi
  docker compose up -d worker >/dev/null 2>&1 || true
  unset key_one key_two ring_one ring_both ring_two
}
trap cleanup EXIT

wait_for_status() {
  local expected="$1"
  local status=""
  for _ in $(seq 1 30); do
    status="$(docker exec "$container_name" node -e 'fetch("http://127.0.0.1:3002/ready").then((response)=>process.stdout.write(String(response.status))).catch(()=>process.stdout.write("000"))' 2>/dev/null || true)"
    if [[ "$status" == "$expected" ]]; then
      return 0
    fi
    sleep 1
  done
  return 1
}

start_probe() {
  local active_key="$1"
  local ring="$2"
  remove_probe
  docker compose run -d --no-deps --name "$container_name" \
    -e WEBHOOK_WORKER_ENABLED=false \
    -e WEBHOOK_ENCRYPTION_ACTIVE_KEY_ID="$active_key" \
    -e WEBHOOK_ENCRYPTION_KEYS="$ring" \
    worker >/dev/null
}

docker compose stop worker >/dev/null
docker compose build server worker >/dev/null

endpoint_id="$(run_fixture server "m11-key-one" "$ring_one" create | tail -n 1)"
if [[ ! "$endpoint_id" =~ ^[0-9a-f-]{36}$ ]]; then
  exit 1
fi

start_probe "m11-key-one" "$ring_one"
wait_for_status 200
run_fixture worker "m11-key-one" "$ring_one" verify "$endpoint_id" >/dev/null
docker restart "$container_name" >/dev/null
wait_for_status 200
run_fixture worker "m11-key-one" "$ring_one" verify "$endpoint_id" >/dev/null

run_fixture server "m11-key-two" "$ring_both" rotate "$endpoint_id" >/dev/null
docker compose build worker >/dev/null
start_probe "m11-key-two" "$ring_both"
wait_for_status 200
run_fixture worker "m11-key-two" "$ring_both" verify "$endpoint_id" >/dev/null

start_probe "m11-key-two" "$ring_two"
wait_for_status 503

if docker logs "$container_name" 2>&1 | grep -F -e "$key_one" -e "$key_two" >/dev/null; then
  exit 1
fi
if { docker image history --no-trunc framerfordevs-server; docker image history --no-trunc framerfordevs-worker; } 2>&1 | grep -F -e "$key_one" -e "$key_two" >/dev/null; then
  exit 1
fi
docker run --rm --entrypoint sh framerfordevs-server -c 'test ! -e /app/delivery-load.env && test ! -e /app/preview-load.env' >/dev/null
docker run --rm --entrypoint sh framerfordevs-worker -c 'test ! -e /app/delivery-load.env && test ! -e /app/preview-load.env' >/dev/null

process_count="$(docker exec framerfordevs-postgres psql -U postgres -d framerfordevs -Atc "select count(*) from webhook_endpoint where id = '$endpoint_id'")"
if [[ "$process_count" != "1" ]]; then
  exit 1
fi

printf '%s\n' '{"profile":"docker_key_continuity","serverCiphertext":true,"workerDecrypt":true,"processRestart":true,"imageRestart":true,"activeKeyRotation":true,"missingReferencedKeyReadiness":503,"secretOutput":false,"passed":true}'
