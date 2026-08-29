#!/usr/bin/env bash
# Runs the rollback-contained PostgreSQL crash-token and lifecycle-race profile.
set -euo pipefail

docker compose build server >/dev/null
docker compose run --rm --no-deps server \
  pnpm --dir /app/packages/api exec vitest run \
  test/integration/services/webhook/worker-repository.integration.test.ts \
  test/integration/services/webhook/repository.integration.test.ts >/dev/null

unsafe_state="$(docker exec framerfordevs-postgres psql -U postgres -d framerfordevs -Atc "select
  (select count(*) from webhook_delivery) +
  (select count(*) from webhook_delivery_attempt) +
  (select count(*) from webhook_endpoint where name like 'lease-%' or name like 'Integration receiver%' or name like 'Updated receiver%') +
  (select count(*) from cms_invalidation_route_mapping where name in ('Article route','Updated article route','Archive route')) +
  (select count(*) from pg_stat_activity where datname=current_database() and pid<>pg_backend_pid() and backend_type='client backend' and state<>'idle')")"
if [[ "$unsafe_state" != "0" ]]; then
  exit 1
fi

printf '%s\n' '{"profile":"crash_and_lifecycle_races","parallelDispatch":true,"parallelClaim":true,"preFinalizeCrashRecovery":true,"abandonedAttempt":true,"staleTokenRejected":true,"guardedFinalize":true,"disableCancellation":true,"destinationReplacement":true,"subscriptionReplacement":true,"fixtureState":0,"passed":true}'
