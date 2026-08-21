# Framer for Devs real webhook receiver

A dependency-light developer harness for testing the real Framer for Devs webhook path through public DNS, Cloudflare edge TLS, a named Cloudflare Tunnel, raw-byte signature verification, retries, redirects, timeouts, replay, and durable capture evidence.

This private package lives under `tools/` so its deterministic compatibility tests travel with the webhook contract. It remains an independent external-consumer simulation, not a production webhook product or deployment target.

## Important Cloudflare networking fact

Cloudflare Tunnel gives this receiver a stable **HTTPS hostname**, not a dedicated stable IP address. Cloudflare advertises changing/anycast public A and AAAA addresses. That is the correct setup for Framer for Devs because each webhook attempt resolves all current addresses, verifies they are public, and pins one validated address for that connection.

If a dedicated fixed source/destination IP is ever required, Cloudflare Tunnel is not that product; use infrastructure with an explicitly allocated public IP instead.

## What is exercised

- Public HTTPS on default port 443
- A/AAAA resolution through Cloudflare
- TLS certificate and SNI verification
- Exact raw-body HMAC verification
- Timestamp freshness
- Active plus retiring-secret overlap
- Stable event identity across retry/replay
- First-attempt success
- Retryable 503 and 429 responses
- Permanent 410 response
- Redirect rejection
- Sender timeout and duplicate ambiguity
- Consumer idempotency behavior
- Append-only per-attempt capture evidence

Signatures, signing secrets, Cloudflare credentials, arbitrary request headers, and raw invalid bodies are never persisted.

## Scenario endpoints

For a public origin such as `https://webhooks-test.example.com`:

| Endpoint                   | Receiver behavior                                                    | Expected sender behavior                   |
| -------------------------- | -------------------------------------------------------------------- | ------------------------------------------ |
| `/hooks/success`           | `204` immediately                                                    | Succeeds once                              |
| `/hooks/retry-twice`       | Attempts 1–2 return `503`; attempt 3 returns `204`                   | Two bounded retries, then success          |
| `/hooks/rate-limit-once`   | Attempt 1 returns `429 Retry-After: 35`; later attempts return `204` | Honors retry policy and server delay       |
| `/hooks/permanent-failure` | `410`                                                                | Immediate dead letter                      |
| `/hooks/redirect`          | `302 Location: /hooks/success`                                       | Dead letter without following redirect     |
| `/hooks/slow`              | Waits 12 seconds before planned `204`                                | Sender times out at 10 seconds and retries |
| `/hooks/idempotent`        | First event is accepted; duplicate/replay returns a safe no-op `200` | Demonstrates event-ID idempotency          |

Each path should normally be configured as a separate Framer for Devs endpoint because every endpoint has its own signing secret and independent delivery history.

## Prerequisites

- Node.js 22+
- pnpm 10.25+
- Docker with Compose
- A Cloudflare account
- A domain delegated to Cloudflare

## Local setup

From the monorepo root:

```bash
pnpm install --frozen-lockfile
pnpm --filter @framerfordevs/webhook-test-receiver run check
pnpm --filter @framerfordevs/webhook-test-receiver run build
```

The local package tests participate in the root `pnpm run ready` gate. Live Cloudflare tests remain opt-in.

For local development without the tunnel:

```bash
pnpm --filter @framerfordevs/webhook-test-receiver run dev
curl -fsS http://127.0.0.1:8787/health/ready
```

Run the Docker and tunnel commands below from `tools/webhook-test-receiver/`.

A signed webhook will return `503` until the matching scenario secret file exists. This is intentional fail-closed behavior.

## Start a free temporary Quick Tunnel

A Quick Tunnel needs no Cloudflare account or domain. It creates a random public `*.trycloudflare.com` hostname that changes when the tunnel is recreated, so use it only for live development testing:

```bash
docker compose --profile quick up -d --build receiver quick-tunnel
docker compose logs quick-tunnel
PUBLIC_BASE_URL=https://<generated-hostname>.trycloudflare.com pnpm run check:tunnel
```

Do not treat the generated hostname as stable configuration. If `secrets/success.txt` contains the receiver's mode-600 success-scenario secret, an opt-in synthetic protocol smoke is available:

```bash
PUBLIC_BASE_URL=https://<generated-hostname>.trycloudflare.com pnpm run smoke:tunnel
```

The command prints only the terminal HTTP status. Stop the temporary tunnel with `docker compose --profile quick stop quick-tunnel`, disable any Dashboard endpoint using its hostname, and remove temporary local secrets/captures when finished.

## Create a stable named Cloudflare Tunnel

A stable named tunnel requires a hostname in a Cloudflare-managed zone. Run:

```bash
./scripts/init-cloudflare-tunnel.sh webhooks-test.example.com
```

The script:

1. Opens Cloudflare's interactive browser authorization.
2. Creates the named `framerfordevs-wb-test` tunnel.
3. Creates the DNS route.
4. Writes ignored `cloudflared/config.yml` and credential JSON files.
5. Keeps credentials out of command arguments and container environment variables at runtime.

Then start both services:

```bash
LOCAL_UID="$(id -u)" LOCAL_GID="$(id -g)" docker compose --profile named up -d --build receiver tunnel
PUBLIC_BASE_URL=https://webhooks-test.example.com pnpm run check:tunnel
```

Cloudflare dashboard requirements:

- Do not place Cloudflare Access authentication in front of `/hooks/*`; the sender cannot provide Cloudflare Access headers.
- Do not cache `/hooks/*`.
- Do not add redirects or request/response transformations.
- Keep only the configured hostname routed to the receiver.

## Configure Framer for Devs endpoints

For each scenario you want to test:

1. Create an enabled webhook endpoint using the corresponding complete HTTPS URL.
2. Copy the one-time signing secret immediately.
3. Store it in `secrets/<scenario>.txt` with mode `600`.
4. Restart/recreate the receiver container so the read-only mount is refreshed if required.
5. Publish a state-changing schema or entry, or explicitly replay an existing event.

Example file preparation without printing the value:

```bash
install -m 600 /dev/null secrets/success.txt
# Open secrets/success.txt in a local editor and paste the one-time secret.
docker compose up -d --force-recreate receiver
# Also restart the active `quick-tunnel` or `tunnel` service only when its configuration changed.
```

During a two-secret rotation overlap, put the active and retiring secrets on separate lines in the same file. At most two are accepted.

## Capture storage

Verified event bodies are stored only after signature and content-free contract validation. Invalid requests retain only bounded metadata, byte count, and SHA-256.

```text
data/
├── captures/
│   └── YYYY/MM/DD/
│       └── <scenario>/
│           └── <event-id>/
│               └── <delivery-id>/
│                   └── <attempt-number>--<attempt-id>--<capture-id>.json
└── state/
    └── accepted/
        └── <scenario>/<event-id>.json
```

Every capture records:

- Safe Standard Webhooks IDs and attempt metadata
- Verification category, never the signature
- Body size and SHA-256
- The verified content-free CloudEvent
- Planned response status, delay, `Retry-After`, and redirect behavior
- Whether the client disconnected before the delayed response
- Whether the event ID had already been accepted

Generate a body-free aggregate report:

```bash
pnpm run report
```

Do not commit `data/`, `secrets/`, `.env`, `cloudflared/config.yml`, `cert.pem`, or tunnel credential JSON.

## Recommended real test sequence

1. `/hooks/success`: publish and confirm one `204` delivery.
2. `/hooks/retry-twice`: publish and wait for attempts 1, 2, and 3.
3. `/hooks/rate-limit-once`: verify the scheduled retry respects at least 35 seconds.
4. `/hooks/permanent-failure`: verify immediate dead letter.
5. `/hooks/redirect`: verify `/hooks/success` receives nothing from the redirect.
6. `/hooks/slow`: verify timeout retries retain the same event ID and unrelated endpoints continue.
7. `/hooks/idempotent`: replay a previously accepted event and verify `duplicate_noop`.
8. Begin/activate secret rotation and verify both configured secrets during overlap.
9. Run `pnpm run report` and reconcile receiver captures with Dashboard delivery attempts.

## Security boundaries

- The public receiver accepts only POSTs with the CloudEvents content type.
- A scenario without a configured secret fails closed.
- Raw bytes are verified before JSON parsing.
- Timestamp tolerance defaults to five minutes.
- Request bodies are capped at 128 KiB.
- Only approved publication event types and content-free keys are persisted.
- Secret files and Cloudflare credentials are mounted read-only.
- Containers drop Linux capabilities and enable `no-new-privileges`.
- The local receiver port binds only to `127.0.0.1`.
- The public health route contains no captured data or configuration diagnostics.

For production webhook consumers, replace filesystem state with a transactional durable idempotency store and complete business processing before acknowledging the event.
