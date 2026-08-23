# Delivery, Preview, and Tooling load gates

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

## Preview load gate

`preview.k6.js` implements the separate approved M10 profiles. Use a production build, PostgreSQL pool maximum 10, Redis enforcement, representative current and exact historical drafts, and only compliant expiring Preview credentials. Keep keys in ignored `preview-load.env`; paths must start with `/api/preview/v1/`, contain complete locale/source authority, and never contain credentials.

Create load-only credentials only after approving the target project and environment. Put non-secret `PREVIEW_PROJECT_ID` and optional `PREVIEW_ENVIRONMENT_KEY` in the ignored `preview-load.env`, ensure the existing server environment already has its secure rate-limit fingerprint secret, then run `pnpm --filter @framerfordevs/api preview:load-prepare -- --credentials=20 --days=1`. If the read-only guard reports existing active Preview credentials, make the replacement decision first and re-run with `--replace-existing`; the utility records their non-secret IDs in the ignored file for later audited revocation but does not revoke or mutate them directly. The utility uses normal issuance/auditing, writes one-time keys and IDs only to the ignored mode-0600 file, and enables the production/Redis/pool-10 runtime profile without printing credentials. Revoke every generated ID through normal audited dashboard/API controls after the gate; never mutate rows directly.

Required variables are `PREVIEW_SCENARIO`, `PREVIEW_BASE_URL`, `PREVIEW_CREDENTIALS`, and `PREVIEW_CURRENT_PATHS`. Revision capacity also requires `PREVIEW_REVISION_PATHS`; the size boundary requires a developer-prepared `PREVIEW_OVERSIZED_PATH`. Comma-separated credentials should cover the configured sustained rate without unintentionally exercising the per-credential quota.

Run each gate separately:

```bash
PREVIEW_SCENARIO=current_capacity apps/server/load/run-preview-k6.sh --quiet
PREVIEW_SCENARIO=revision_capacity apps/server/load/run-preview-k6.sh --quiet
PREVIEW_SCENARIO=intentional_429 apps/server/load/run-preview-k6.sh --quiet
PREVIEW_SCENARIO=redis_outage apps/server/load/run-preview-k6.sh --quiet
PREVIEW_SCENARIO=oversized_response apps/server/load/run-preview-k6.sh --quiet
PREVIEW_SCENARIO=concurrent_save_read apps/server/load/run-preview-k6.sh --quiet
PREVIEW_SCENARIO=parallel_audit apps/server/load/run-preview-k6.sh --quiet
```

The current profile mixes 90% GET and 10% HEAD. The wrapper prints a unique non-secret `PREVIEW_RUN_ID` and includes it in measured request IDs so database audit verification can isolate retries/reruns. Ramping executor iterations that start after the measured window are excluded from measured IDs/metrics, preventing stage-boundary audit drift. The wrapper starts a second process for the shared hot-credential profile and restores Redis after the outage profile. For `concurrent_save_read`, run an independently authenticated dashboard save loop against the sampled entries for the full warm-up and measured stages. Set `PREVIEW_COHERENT_TUPLES` to the comma-separated allowlist of committed `schemaRevisionId|sharedRevisionId-or-none|localizedRevisionId-or-none` tuples produced by that loop; k6 fails any torn/unknown source tuple. Verify Delivery/publication state is unchanged. `parallel_audit` is intentionally fixed-count rather than duration-based: set `PREVIEW_EXPECTED_AUDIT_COUNT` (1–10,000; for example 1,000) and optionally `PREVIEW_AUDIT_VUS`/`PREVIEW_AUDIT_MAX_DURATION`. The profile requires exactly that many successful responses. Compare it with exactly that many content-free Preview audit rows whose request IDs start with `preview.load.measured-parallel_audit-{printed-run-id}-`. Expected 429 and 413 responses are isolated from ordinary error metrics. Completed local results are recorded in `m10-baseline-2026-08-12.md`; keep the remaining oversized, concurrent-save, and manual gates separate.

The oversized fixture must be created and restored through normal schema/draft controls, not migration or direct row mutation. Before and after every profile, record PostgreSQL pool wait/active/open-transaction state, Redis key count/TTL and degraded decisions, process heap/RSS, audit counts, and publication/snapshot hashes. Stop rollout if credentials are non-expiring, exceed the 30-day original lifetime, or if audit, source coherence, isolation headers, memory, Redis recovery, or publication invariants fail.

## Tooling readiness baseline

The M12 Tooling gate is a deterministic authenticated integration profile rather than a production-capacity k6 profile. It creates an isolated two-project/two-collection fixture, completes the real OAuth device flow, exercises signed project and manifest continuation cursors, verifies immutable revision cache semantics and first-page-only auditing, alternates bounded manifest/revision reads, and removes the complete fixture afterward.

Run:

```bash
pnpm --filter server exec vitest run test/integration/tooling-readiness.test.ts
```

The accepted result and scope limitations are recorded in `m12-baseline-2026-08-22.md`. Production topology and host/ingress capacity remain M15 scope.
