# M11 webhook worker load gates

Run only against the local operator-approved database profile. Outbound delivery remains disabled unless a controlled TLS receiver and persistent webhook key ring are configured.

## Completed profiles

```bash
pnpm --filter @framerfordevs/api webhook:load-dispatch
pnpm --filter worker load:attempts all
pnpm --filter worker load:contention
pnpm --filter worker load:crash-race
pnpm --filter worker load:database-restart
pnpm --filter worker load:key-continuity
```

The dispatcher script requires zero enabled endpoints and zero pending supported backlog, creates 10,000 content-free schema events, runs the real atomic dispatcher in 100-row batches, reconciles canonical events and zero fan-out, enforces the 30-second target, and removes all dedicated rows in `finally`.

The controlled-attempt wrapper generates a temporary CA/server certificate, mounts it read-only into an isolated root-capable container, and runs the real repository, crypto, signing, pinned HTTPS transport, and finalization path. Its test-only validator pins loopback because the production SSRF policy correctly rejects local addresses; policy and rebinding behavior remain covered separately. Each endpoint uses a distinct controlled TLS hostname. The wrapper removes key material and fixtures in `finally`.

The key-continuity profile generates ephemeral keys without printing them, creates ciphertext in the separately built server image, verifies decryption from the worker image before and after process restart, rotates to a new active key, rebuilds the worker image, verifies old and new ciphertext, and proves readiness returns 503 when the still-referenced old key is removed. Delivery remains disabled. It also checks current image history, logs, and load-file absence before removing the fixture.

The contention profile starts one sustained producer, two dispatchers, and two attempt processes against two projects and six fast/slow endpoints. The crash/race profile proves lease abandonment/reclaim, stale-token rejection, guarded finalization, and configuration cancellation races against PostgreSQL. The restart profile preserves durable authority while PostgreSQL restarts and requires worker readiness recovery.

Accepted evidence is recorded in `m11-baseline-2026-08-13.md`. Each profile reconciles queue/attempt counts and verifies no leaked fixture rows, secrets, bodies, headers, URLs, open transactions, or stale leases.
