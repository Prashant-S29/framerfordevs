#!/usr/bin/env bash
# Proves the disabled worker and persisted webhook authority recover across a PostgreSQL restart.
set -euo pipefail

read_invariants() {
  docker exec framerfordevs-postgres psql -U postgres -d framerfordevs -Atc "select concat_ws(':',
    (select count(*) from publication_event),
    (select count(*) from outbox_event where processed_at is null and event_type in ('cms.schema.published','cms.entry.published','cms.entry.unpublished','cms.collection.delivery_config.updated')),
    (select count(*) from webhook_delivery),
    (select count(*) from webhook_delivery_attempt))"
}

before="$(read_invariants)"
docker compose restart postgres >/dev/null

postgres_status=""
worker_status=""
for _ in $(seq 1 60); do
  postgres_status="$(docker inspect --format='{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' framerfordevs-postgres 2>/dev/null || true)"
  worker_status="$(docker inspect --format='{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' framerfordevs-worker-1 2>/dev/null || true)"
  if [[ "$postgres_status" == "healthy" && "$worker_status" == "healthy" ]]; then
    break
  fi
  sleep 1
done
if [[ "$postgres_status" != "healthy" || "$worker_status" != "healthy" ]]; then
  exit 1
fi

after="$(read_invariants)"
if [[ "$before" != "$after" ]]; then
  exit 1
fi

unsafe_state="$(docker exec framerfordevs-postgres psql -U postgres -d framerfordevs -Atc "select
  (select count(*) from webhook_delivery_attempt where state='started') +
  (select count(*) from webhook_endpoint where lease_expires_at <= now()) +
  (select count(*) from webhook_delivery where lease_expires_at <= now()) +
  (select count(*) from pg_stat_activity where datname=current_database() and pid<>pg_backend_pid() and backend_type='client backend' and state<>'idle')")"
if [[ "$unsafe_state" != "0" ]]; then
  exit 1
fi

printf '%s\n' '{"profile":"database_restart_recovery","authorityPreserved":true,"postgresHealthy":true,"workerReady":true,"staleState":0,"passed":true}'
