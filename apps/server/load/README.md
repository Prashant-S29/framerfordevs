# Delivery load gate

`delivery.k6.js` implements the approved M9 local/manual capacity and resilience gates. Run it only against the deterministic 10,000-publication fixture, production server build, PostgreSQL pool maximum 10, and Redis enforcement.

Required environment variables:

- `DELIVERY_SCENARIO` (one value listed below; run each separately)
- `DELIVERY_BASE_URL`
- `DELIVERY_PROJECT_ID`
- `DELIVERY_ENVIRONMENT_KEY`
- `DELIVERY_COLLECTION_KEY`
- `DELIVERY_ENTRY_IDS` (comma-separated fixture IDs)
- `DELIVERY_UNIQUE_VALUES` (matching comma-separated slug values)
- `DELIVERY_FILTER_VALUE`
- `DELIVERY_CREDENTIALS` (comma-separated environment-scoped Delivery keys)
- Optional `DELIVERY_LOCALE` (defaults to `en`)

Run without placing credentials in shell history. The wrapper sources the ignored file and passes values to Docker by environment-variable name; do not use Docker `--env-file`, which preserves shell-safe quote characters as data.

## Capacity profiles

```bash
DELIVERY_SCENARIO=mixed_latest_unique apps/server/load/run-delivery-k6.sh --quiet
DELIVERY_SCENARIO=indexed_list apps/server/load/run-delivery-k6.sh --quiet
DELIVERY_SCENARIO=pinned_expansion apps/server/load/run-delivery-k6.sh --quiet
```

## Resilience and boundary profiles

```bash
DELIVERY_SCENARIO=intentional_429 apps/server/load/run-delivery-k6.sh --quiet
DELIVERY_SCENARIO=redis_outage apps/server/load/run-delivery-k6.sh --quiet
DELIVERY_SCENARIO=conditional_304 apps/server/load/run-delivery-k6.sh --quiet
DELIVERY_SCENARIO=large_response apps/server/load/run-delivery-k6.sh --quiet
```

The wrapper applies profile-specific safeguards:

- `intentional_429` starts a temporary second server process on port 3002 and proves that one hot credential is shared and limited through Redis across both processes. Successful responses and intentional 429s are both expected.
- `redis_outage` stops local Redis for 15 seconds during measured traffic, restores it, and requires successful Delivery responses plus recreated bounded Redis keys. Do not run it while other local work depends on Redis.
- `conditional_304` acquires an ETag in setup and requires 304 for every measured revalidation.
- `large_response` republishes 32 sampled entries with temporary multibyte bodies, requires stable 413 rejection, and restores their current small publications even when the run fails. Publication/snapshot history is append-only, so this profile intentionally leaves immutable test publications while restoring all current heads and drafts.

The accepted local results are recorded in `m9-baseline-2026-08-11.md`. Expected 429/413 responses are evaluated through scenario-specific metrics and must not be mixed into the ordinary success error rate.

After the runs, verify PostgreSQL active/waiting connections, Redis recovery/key TTLs, heap stability, current fixture size, duplicate unique claims, and open transactions as specified in the approved M9 decision.
