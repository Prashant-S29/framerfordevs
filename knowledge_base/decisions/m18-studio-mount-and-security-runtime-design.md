# Milestone 18 Studio mount and security runtime design

**Status:** M18A accepted; M18B design approved; full M18B implementation complete and awaiting developer review

**Date:** 2026-09-21
**M18B revalidated:** 2026-09-26

## Approval amendment — 2026-09-21

The developer approved the amended M18A/M18B split and authorized M18A implementation. Work begins with the mandatory Better Auth provider-compatibility slice and private OAuth harness. M18B detailed confirmation/implementation, migration generation/application, package publication, production OAuth/configuration, rollout, deployment, commit, milestone acceptance, and M19+ remain developer-controlled.

## Implementation checkpoint — 2026-09-21

The provider compatibility slice, Studio platform contracts/pure kernels, deterministic OpenAPI source, shared quota registry, and approved Drizzle schema edits are complete. The developer generated and applied `0019_add_studio_runtime_authority`; full artifact review and read-only live-catalog verification confirm its snapshot chain, 61-table scope, two intended changed tables, contiguous journal/migration row, columns, constraints, indexes, and default-inactive registration authority. M18A database integration may resume; M18B and operational rollout remain gated.

## M18B design confirmation — 2026-09-26

M18A is accepted at `317a295`; developer-applied migrations `0019` and `0020`, current source, tests, and generated Studio OpenAPI are executable truth. This confirmation revalidates the developer-runtime half against that implementation and supersedes conflicting pre-M18A proposal wording below. It completes the M18B design for developer review but does not authorize implementation, package publication, production configuration, rollout, deployment, or M19.

### Revalidated M18A contract and bounded correction

- The compatibility correction adds the signed absolute grant deadline to the accepted 30,112-byte Studio OpenAPI source. M18B registers the resulting reviewed bytes at SHA-256 `f3a70dee4d72057a3df982a6b4a4ff5192daea850b57810cfeb7caa498ef5b03` as the `studio/v1` canonical artifact and first immutable baseline with `sdkSupported: false`; any later contract-byte change stops for amendment rather than silently moving the baseline.
- The BFF treats access and refresh tokens as opaque. It does not decode a JWT as authority, import platform auth/environment internals, or implement a second JWKS verifier. Before issuing a local session and after every refresh, it calls the accepted bearer-only bootstrap endpoint, strictly decodes the standard envelope, and compares registration, version, project, environment, application origin, mount path, and user with local/session authority.
- Accepted M18A currently configures each rotated provider refresh token for eight hours from that rotation, while the approved contract requires one absolute eight-hour Studio grant/session bound. M18B includes one bounded, migration-free compatibility correction before runtime packages: the immutable `studio.session.established` audit time anchors the platform deadline; refresh claim issuance and Studio-principal authorization (including bootstrap) deny at or after that time plus eight hours. Tests advance through multiple rotations and beyond the original deadline. The BFF uses the earlier of that authority and `attempt.createdAt + 8 hours`, and refresh, cookie renewal, key rotation, or record re-encryption never extends it.
- Existing bootstrap `session.expiresAt` remains the current access-token expiry, not the local absolute-session deadline. M18B does not reinterpret or expose it as eight-hour authority.

### Exact mount, raw request, and cookie representations

- Inactive M14 registration metadata keeps its existing broad schema, but M18B runtime activation supports only a portable active mount profile: the case-sensitive ASCII wire pattern `^/[A-Za-z0-9_-]+(?:/[A-Za-z0-9_-]+)*$`, with the existing 240-byte and non-root bounds. This makes the registration path, URL wire path, OAuth callback path, asset base, router base path, and cookie `Path` byte-identical. Activation fails closed for older metadata outside that profile; no row is mutated automatically, and the user must deactivate/update/reactivate it. This is a bounded M18A compatibility correction, not a migration.
- The exact callback remains `${applicationOrigin}${mountPath}/auth/callback`; the BFF derives client ID, issuer, resource, authorize/token/revoke/bootstrap paths, and callback from decoded configuration rather than accepting endpoint overrides.
- A standard `Request` can already have URL dot segments normalized. Express and TanStack Start adapters therefore run one exported dependency-free raw-target validator before constructing/delegating the canonical `Request`. It rejects malformed encoding, encoded or literal dot/separator ambiguity, backslashes, duplicate separators, credentials, fragments, and mount-prefix confusion. The Fetch core then matches only canonical decoded routes. A custom Fetch integration is supported only when its ingress supplies equivalent pre-normalization validation; raw-target portability or edge-runtime support is not claimed.
- HTTPS cookie names are `__Secure-ffd-studio-s-<registrationDigest>` and `__Secure-ffd-studio-a-<registrationDigest>`, where the suffix is the first 128 SHA-256 bits of the canonical registration ID encoded base64url. Exact loopback HTTP uses `ffd-studio-loopback-s-...` and `ffd-studio-loopback-a-...`. Both cookies are host-only, `HttpOnly`, `SameSite=Lax`, and `Path=<exact portable mount>`; HTTPS adds `Secure`. Creation and deletion use identical attributes. `__Host-` is not used because it requires `Path=/`.
- Duplicate/shadow values for either owned cookie are rejected; the BFF never chooses one. Cookie path and port are not authorization or origin isolation. The developer-owned application, every same-origin script, and any same-origin service worker are inside the trusted application boundary and can invoke/read Studio same-origin behavior even though they cannot read `HttpOnly` values. A sibling-controlled parent-domain cookie can cause fail-closed denial but cannot become authority; stronger isolation requires a dedicated origin and is outside M18B.

### OAuth attempt, callback, and local-session protocol

- `GET {mount}/auth/login` accepts no query/body/credential input, rejects prefetch, requires a top-level document navigation profile, and fixes return to the mount root. It creates a 10-minute encrypted attempt only after shared registration admission. The attempt stores configured scope, exact issuer/resource/client/callback, state, PKCE verifier, creation/deadline, and no registration version; authoritative version is learned from callback bootstrap.
- One browser cookie names one current attempt. A newer login replaces the cookie; an older tab cannot redeem without its matching cookie and expires naturally. A wrong state/issuer does not consume or clear an otherwise valid attempt. A callback with matching cookie/state first validates an exact bounded query, then atomically consumes that attempt before exchange. Success permits exactly one `code`, `state`, and exact `iss`; error permits one closed provider error, one state, and only absent-or-exact issuer as proven by pinned-provider tests. Success and error fields are mutually exclusive, duplicates/extras fail, and descriptions are never reflected.
- Token exchange uses exact form fields, `redirect: "error"`, fixed endpoints, abort propagation, and bounded time/body limits. The response requires bounded access/refresh tokens, `Bearer`, integer `expires_in` from 1 through 300, and exactly `studio:session offline_access` as a set. It is immediately bootstrap-validated before any cookie is issued.
- Callback success atomically creates the encrypted session and, when replacing an existing local session, deletes the old session in the same store operation. If bootstrap or store creation fails after token issuance, no browser session is created and the new refresh authority is synchronously subjected to one bounded compensating revocation attempt.
- Local logout requires exact same-origin `POST`, exact JSON `{}`, and committed local store deletion before reporting success or clearing the cookie. It always leaves the dashboard identity session intact. Remote revocation is bounded and best-effort after local invalidation; failure cannot restore the deleted local record. Store unavailability is distinct from record absence: absence clears the cookie successfully, while unavailability returns `503` and retains the cookie so logout can be retried honestly.
- After callback, the browser-visible URL is the clean canonical mount root and application responses never contain codes, state, or tokens. M18B does not claim that every browser implementation erases redirect-chain history; security rests on one-use code/state/PKCE, no-referrer, bounded lifetime, and no secret reflection.

### Store, encryption, refresh, and Redis semantics

- The store contract adds atomic pre-refresh fencing, not post-exchange CAS alone: `claimRefresh` changes one expected generation to an in-flight owner before any provider request; contenders wait/reload for at most one second without issuing. A claim released before dispatch may be retried. Once dispatch begins, that generation is never submitted again. Ambiguous timeout, lost reply, owner death, or expired in-flight lease makes the session terminal and requires fresh acknowledgement; lease expiry is not evidence that redemption failed.
- `commitRefresh` requires the exact owner/generation and replaces ciphertext once; logout/delete prevents a late commit from resurrecting a session. If a successful token response cannot be committed because the record was deleted or superseded, the winner performs one bounded compensating revocation. Separate grants for the same user/client remain separate records; multi-process tests prove one session's refresh handling does not replay or invalidate another.
- Attempts and sessions use envelope version 1 with `A256GCM`, a cryptographically random 96-bit nonce, 256-bit key, and 128-bit tag. Canonical authenticated data binds envelope version, key ID, record kind, digest store key, registration digest, absolute expiry, and refresh generation. Plaintext is strictly decoded and bounded. Unknown keys, malformed envelopes/plaintext, tag failure, record swapping, or unsupported versions fail closed without raw crypto errors.
- The keyring has one current write key and at most three previous decrypt keys; IDs are unique bounded non-secret ASCII labels and every decoded key is exactly 32 bytes. Only the current key writes. Operators keep an old key for at least eight hours after the final old-key writer drains; mixed fleets must agree on the current writer. Re-encryption preserves authority, generation, and expiry. Early retirement deliberately invalidates affected records.
- Production and every non-loopback origin require an explicitly supplied store declaring shared and process-restart-stable topology. The declaration is trusted deployer configuration, not a claim that arbitrary custom infrastructure can be introspected. Only exact loopback development may use the package memory store. No BFF path uses the platform rate limiter's degraded-memory behavior.
- The Redis reference adapter uses caller-supplied configuration/connection, primary reads, namespaced digest-only keys, server TTLs plus application expiry checks, and Lua operations for admission/consume/replace/refresh fencing/delete. Multi-key scripts use one registration hash tag and therefore one Redis Cluster slot. Commands have bounded queues and deadlines; only explicit `NOSCRIPT` recovery is retried. Timeout, connection loss, or failover ambiguity after a write fails closed and never causes a second OAuth exchange. Redis asynchronous failover is not represented as linearizable authority.
- A deployment namespace epoch is part of every key. Normal restart/deploy keeps it stable; restore from an older Redis snapshot requires rotation, intentionally signing out all local Studio sessions so deleted records cannot resurrect. Cleanup is capped and never scans an unbounded keyspace.

### Source-controlled local bounds

These are package constants, not caller-tunable bypasses; lowering deployment-level limits is allowed outside the package, while raising them requires a design amendment and evidence.

| Boundary                                                          |                                 M18B limit |
| ----------------------------------------------------------------- | -----------------------------------------: |
| Authorization starts per registration                             |                        30/minute, burst 10 |
| Callback exchanges per registration                               |                        60/minute, burst 10 |
| Authenticated app-local requests per registration                 |                      600/minute, burst 100 |
| Authenticated app-local requests per session                      |                       120/minute, burst 20 |
| Outstanding attempts per registration                             |                                         20 |
| Active sessions per registration                                  |                                      1,024 |
| Concurrent callback exchanges per registration                    |                                         10 |
| Concurrent refresh waiters per session                            |                                         16 |
| Raw request target / total accepted headers / owned Cookie header |                     8 KiB / 32 KiB / 4 KiB |
| Logout body / OAuth response / bootstrap response                 |           1 KiB / 32 KiB / accepted 64 KiB |
| Encrypted attempt / encrypted session record                      |                            16 KiB / 64 KiB |
| Asset count / one asset / total assets                            |                         64 / 2 MiB / 8 MiB |
| Initial executable JS (entry + eager chunks)                      |                 600 KiB raw / 200 KiB gzip |
| Initial CSS                                                       |                  128 KiB raw / 40 KiB gzip |
| One cleanup operation                                             |                                100 records |
| Store / platform request deadline                                 |                     2 seconds / 10 seconds |
| Refresh threshold / absolute local session                        | 60 seconds / 8 hours from attempt creation |

M18B has no trusted-source bucket because M23 has not proven customer ingress/header replacement. Registration-wide isolation accepts that one source can temporarily deny one registration without letting spoofed forwarding data create false fairness. `429` includes bounded retry guidance; store/platform outage is `503`, never an in-memory fallback.

### Route and response policy

- Owned methods stay closed: shell, login, callback, and bootstrap are `GET`; logout is `POST`; assets are `GET` from the finite manifest. Known-route wrong methods return bounded `405`; unknown or noncanonical paths return bounded `404`; the handler never becomes a fallback SPA or arbitrary proxy in M18B.
- Shell HTML is public but `no-store` and contains only escaped non-secret mount and dashboard-recovery-origin metadata. The server builds it from a generated manifest, emits exact absolute mount asset URLs without `<base>` or executable inline configuration, and the browser router uses the same mount base. The package artifact is built once. Only successful content-hashed assets receive `public, max-age=31536000, immutable`; errors, redirects, HTML, auth, logout, and bootstrap are `no-store`. Range requests and unmanifested files fail closed.
- The exact shell policy is `default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; font-src 'self'; manifest-src 'none'; worker-src 'none'; child-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'`. Responses also set no-referrer, nosniff, same-origin opener/resource policies, `X-Frame-Options: DENY`, and a deny-by-default Permissions Policy. No inline script/style is required. Origin-wide HSTS remains the hosting application's responsibility.
- Login requires navigation metadata and rejects prefetch. Callback permits the expected cross-site top-level provider navigation but requires cookie/state/issuer/PKCE. Bootstrap requires exact same-origin browser evidence (`Origin` when present and `Sec-Fetch-Site: same-origin`) and rejects cross-site/same-site sibling contexts; logout additionally requires exact Origin and JSON. No owned route emits credentialed CORS headers. Framework/APM/proxy logs before the handler are explicitly outside package redaction and must be configured not to log raw callback URLs, Cookie, Authorization, or response headers.

### Package and framework contract

- The five approved `0.0.0` workspaces remain the boundary. `@framerfordevs/studio` owns the standalone client-only SPA, dependency-light `./contracts`, and generated finite asset manifest/files. It bundles one React/UI runtime into the artifact and exports no server/auth/store code. `@framerfordevs/studio-server` depends only on declared `studio` contract/artifact exports and owns Effect workflows, one process-level `ManagedRuntime`, configuration decoding, asset loading, OAuth/bootstrap adaptation, encryption, and the store/conformance contracts. Handler construction returns the canonical Fetch function plus explicit disposal; it never creates a runtime per request.
- `@framerfordevs/studio-store-redis` implements only the server store port and receives ciphertext/envelope metadata, never token/state/verifier plaintext. Express and TanStack Start adapters depend on declared server exports, run raw-target/external-origin checks at the earliest Node request boundary, preserve cancellation and bounded streaming, delegate outside the exact canonical mount, and contain no auth/policy/store logic.
- The Studio is a client-rendered document, not host-framework SSR. The TanStack Start adapter mounts the same Fetch core at the server boundary and cannot put bootstrap/user data in SSR loaders, hydration, server-function caches, or host query caches. Clean built fixtures must prove both adapters retain manifest assets and exact parity at nested non-default mounts.
- App-local browser contracts are closed and exported from `@framerfordevs/studio/contracts`. Bootstrap reuses the accepted platform success DTO after strict server validation; local session/unavailable errors use a separate bounded app-local code set and never masquerade as platform authority. Query keys contain no session/token/cookie/attempt value, browser persistence is disabled, retries are off for auth failures, and logout removes all in-memory bootstrap/user projection.
- Package manifests declare every workspace dependency and package-owned build/type/test/coverage task; root orchestration remains Turborepo-only. Tarballs include only expected ESM/types/assets/licenses/readmes. The private OAuth harness stays a development-only dependency and cannot enter production graphs or artifacts.

### M18B acceptance boundary

M18B requires no Drizzle schema change or migration. The developer approved this confirmation and authorized implementation in the stated sequence: first the absolute-eight-hour and portable-active-mount compatibility corrections with focused accepted-M18A regressions, then the five runtime packages after checkpoint review. Complete evidence includes direct Fetch plus raw-target conformance, Express/TanStack parity, multi-client Redis refresh fencing and outage/restore tests, exact package/tarball/browser-bundle inspection, baseline registration, noninteractive browser/accessibility coverage, load/bound evidence for the constants above, and full readiness. M19 remains unauthorized until M18B implementation is accepted.

## M18B approval and compatibility checkpoint — 2026-09-26

The developer approved the confirmed design, explicitly accepted the portable-active-mount narrowing and unchanged no-trusted-source-bucket risk through M23, and authorized M18B implementation under the documented gates. Migration generation/application, package publication, production OAuth/configuration, rollout, deployment, commit, milestone acceptance, and M19 remain developer-controlled.

The first implementation checkpoint is complete:

- M14's broader `StudioMountPath` registration schema remains unchanged. A separate portable active schema/predicate enforces `^/[A-Za-z0-9_-]+(?:/[A-Za-z0-9_-]+)*$` at activation. Existing inactive rows outside it remain byte-for-byte unchanged and fail activation; preexisting active rows outside it fail OAuth authorization, claim issuance/refresh, and bootstrap without automatic mutation, while deactivation remains available for recovery.
- `studio.session.established.occurredAt` now anchors an immutable grant deadline carried in signed Studio access-token claims. Refresh preserves that deadline, refresh claim issuance denies at/after it even when the rotated provider row expires later, the Studio verifier rejects otherwise-live access tokens beyond it, and bootstrap requires the exact unexpired audit-derived deadline.
- Five focused regressions cover schema narrowing/parity, runtime transition and recovery, no-mutation denial for inactive and preexisting active rows, two refresh rotations beyond the provider's original expiry shape, access-token denial after the original deadline, refresh denial after the deadline, and audit-derived bootstrap denial. Full `pnpm run ready` passes 1,490 tests, coverage, contract drift, 18 type tasks, and nine builds; all 13 committed noninteractive browser specifications also pass. No migration or runtime package was created.

Per the approved sequence, work stopped at this checkpoint until the developer authorized uninterrupted completion of the five runtime packages.

## M18B implementation completion — 2026-09-27

The authorized runtime work is complete without a migration:

- Added the five private `0.0.0` packages owned by this design: the browser-only Studio shell/contracts/artifact, framework-neutral Effect/Fetch BFF, restart-stable shared Redis adapter, and thin Express 5 and TanStack Start adapters.
- Added exact external-origin and raw-target guards, strict asset/route/method allowlists, platform-compatible auth routes, exact secure/loopback cookies, expiry/generation-bound A256GCM attempts/sessions with key-ID rotation and read re-encryption, bounded callback/token/bootstrap decoding, exact registration/session rate limits, strict CSP/cache/security headers, and redacted bounded telemetry.
- Added atomic shared attempt/session quotas and reauthentication replacement, one-shot callback consumption, registration-slot-safe Redis keys, distributed callback/waiter permits, refresh generations/leases acquired before provider dispatch, terminal invalidation after post-dispatch failure or abandoned dispatched ownership, process-restart/multi-client evidence, and fail-closed logout/Redis outage recovery without production memory fallback.
- Added the accessible responsive mounted empty shell with explicit loading/login/session/denial/outage/logout and canonical dashboard recovery, shared UI primitives, TanStack Router/Query, browser forbidden-import coverage, a 127,924-byte gzip initial-transfer budget, finite tarball allowlists, adapter parity, and a retry-free Chromium mount/sign-in/bootstrap/sign-out/accessibility specification.
- Registered and baseline-locked Studio v1 at 30,112 bytes and SHA-256 `f3a70dee4d72057a3df982a6b4a4ff5192daea850b57810cfeb7caa498ef5b03`; exposed it through the public-contract package and developer portal without adding SDK support.

M18B now awaits final developer review. Package publication, production OAuth/configuration, rollout, deployment, commit, milestone acceptance, and M19 remain developer-controlled.

## Decision summary

The original proposal combined a new platform OAuth/resource authority, a migration and Control Plane lifecycle, five developer-runtime packages (including two framework adapters), and a browser shell. That approaches the M13 upper bound and crosses the repository's platform/runtime seam. The approved M18 roadmap therefore uses two sequential review and acceptance units:

- **M18A — Studio platform authority:** explicit registration activation, deterministic Studio OAuth clients, per-session user acknowledgement, shared abuse controls, token verification, security audit, one bounded server-to-server bootstrap API, and a private end-to-end OAuth conformance client.
- **M18B — Studio mount and security runtime:** the developer-owned BFF, a production Redis store adapter, exact mounted assets/routes/cookies, Fetch core, Express and TanStack Start adapters, and the authenticated empty shell.

M18A is accepted. The approved M18B implementation is complete and awaits final developer review. M19 remains blocked on M18B acceptance.

The parent design makes four load-bearing choices:

1. Studio sign-in uses OAuth 2.1 Authorization Code with S256 PKCE through the existing Better Auth identity authority. This extends the current fixed-CLI OAuth model with one deterministic public client per explicitly activated Studio registration; it is not general dynamic client registration.
2. OAuth access and refresh tokens remain in a developer-owned BFF. Browser JavaScript receives only a random opaque host-only `HttpOnly` Studio session cookie. M18B must ship both a store contract and a production-capable Redis reference implementation; there is no production in-memory fallback.
3. A canonical Web Standards `Request -> Response` BFF core owns routing, auth exchange, session refresh, bootstrap, assets, headers, and upstream adaptation. Thin Express 5 and TanStack Start adapters translate framework requests only. This proves framework independence within the supported Node/Web Request baseline, not edge-runtime portability.
4. Separate staged packages keep browser and server authority physically distinct: `@framerfordevs/studio`, `@framerfordevs/studio-server`, `@framerfordevs/studio-store-redis`, `@framerfordevs/studio-adapter-express`, and `@framerfordevs/studio-adapter-tanstack-start`.

Existing M14 Studio registrations began inactive when M18A was applied. A user with exact project authority must explicitly activate one before it becomes redirect or OAuth-client authority. Registration changes and deactivation immediately invalidate that authority.

## Developer decisions fixed during design

### Authentication and handoff

The developer selected Authorization Code + PKCE over a custom one-time handoff. Studio is an externally hosted delegated client, so using the installed standards-based provider is safer than adding a second grant, replay, expiry, and cryptographic protocol.

This is a new narrow authority model, not merely reuse of the CLI flow:

- The platform materializes the client from one existing Studio registration.
- RFC 7591 dynamic registration remains disabled.
- No user, application, or management credential can choose a client ID, redirect URI, scope set, or resource.
- The client receives only the Studio resource and `studio:session` plus protocol-required `offline_access`.
- The client is public, has no secret, accepts only `authorization_code` and `refresh_token`, and always requires S256 PKCE.

### User acknowledgement and consent

Activation and end-user delegation are separate trust decisions. The fixed `developer` role currently has `project.update`, so a member who may configure `applicationOrigin` must not silently acquire another member's delegated Studio authority merely because that member has a dashboard cookie.

The generated client therefore uses `skipConsent: false`, and every new BFF authorization attempt sends the provider-owned equivalent of `prompt=consent`. The dashboard-hosted acknowledgement must identify the exact project and canonical application origin, explain that the developer-operated application will act with the current user's project permissions, and provide explicit Allow and Deny actions. It must obtain those values from the resolved active registration/provider continuation, never from untrusted query display data. Generic CLI copy is not reused.

A prior consent or live dashboard session may avoid another credential prompt, but it never bypasses this per-session Studio acknowledgement. Local Studio logout does not terminate the dashboard identity session; a subsequent Studio login may identify the user silently, but still requires a fresh Studio acknowledgement. A dashboard recovery link remains available for global account-session management.

Users should expect acknowledgement at least once per new eight-hour local session and again after safe session loss caused by confirmed record loss, namespace rotation, or registration drift. The screen presents ordinary continuation—not an error or alarm—while still naming the project, origin, and delegated authority accurately.

Before acknowledgement and code issuance, the platform resolves the exact active registration and current user, requires an active project with CMS enabled and current `project.read`, and preserves foreign/nonexistent non-enumeration. Registration metadata/version changes revoke prior consents. Accepted M18A evidence proves pinned Better Auth 1.7.1 enforces current policy, forced acknowledgement, version-bound consent invalidation, and fail-closed issuance without weakening the split-host boundary; a regression stops M18B.

### Session ownership

The developer selected BFF-owned server-side sessions. The platform remains the OAuth issuer and Studio resource server; it does not become the session store for developer-owned infrastructure.

The browser cookie contains only a random session identifier. The BFF store holds the encrypted OAuth token record. An encrypted cookie containing OAuth tokens is forbidden even when `HttpOnly`, and platform-hosted Studio session handles are not introduced.

### Initial adapters

M18B supports the canonical Fetch handler, Express 5, and TanStack Start. A frameworkless conformance fixture invokes the Fetch core directly and forbidden-import checks keep Express, TanStack, and application source out of the core. This is evidence of framework-neutral behavior on the supported Node/Web Request baseline only. Next.js, Astro, other frameworks, edge runtimes, and deployment-provider-specific adapters are deferred until compatibility evidence justifies broader claims.

## Authority and prior decisions

This design consumes and preserves:

- M3's Better Auth identity-only boundary, fixed project roles, current policy checks, default deny, and non-enumeration.
- M6's renderer-neutral generated-form architecture and browser-safe package boundary; M18 reuses shared UI but adds no form/content route.
- M10's prohibition on browser Preview credentials and its exact user-role projection and `no-store` behavior.
- M13's browser/BFF token isolation, closed operation allowlist, bounded static assets, secure headers, controlled runtime lifetime, and local-editor convergence requirement.
- M14's one-registration-per-environment identity, canonical origin/path schemas, optimistic/idempotent registration authority, and explicit statement that registration was inert before M18.
- M17's dashboard-only host session, split OAuth issuer/login surfaces, exact host profiles, direct dashboard recovery, and prohibition on parent-domain cookies or browser management bearers.
- The public HTTP/CLI/SDK boundary: activation is Control Plane HTTP + CLI + dashboard; Studio runtime is not control-plane SDK expansion.
- Existing repository Effect, API-envelope, package, test-placement, browser-test, migration, redaction, and worker-isolation rules.

M18 supersedes only the inert-runtime treatment of an explicitly activated Studio registration. It does not turn ordinary registration metadata into trust retroactively and does not change dashboard-cookie scope.

## Current implementation truth and M18B gaps

Accepted M18A now provides:

- One versioned registration per exact project/environment with active/inactive runtime authority, user-only activation/metadata change, and exact management-credential `active -> inactive` recovery.
- Deterministic registration-derived public OAuth clients, Code + S256 PKCE, forced per-session acknowledgement, exact Studio resource/scopes/claims, five-minute stateless JWT access tokens, persisted rotating refresh authority, and current grant/audit-marker checks.
- Canonical Control Plane HTTP, CLI, and dashboard lifecycle controls with transactional receipts/audits/revocation and developer-applied migrations `0019`–`0020`.
- A bounded bearer-only Studio v1 bootstrap operation and deterministic OpenAPI source, plus private provider compatibility and browser harness evidence.
- A host-only dashboard identity session, exact M17 host/auth/CSRF route matrices, the secure M13 loopback editor precedent, browser-safe content-form/UI packages, and shared Redis rate-limit infrastructure.

M18B still must add:

1. The migration-free absolute-eight-hour and portable-active-mount compatibility corrections fixed in the confirmation above.
2. The developer-owned BFF, encrypted attempt/session store contract, production Redis reference adapter, refresh fencing, and exact local abuse bounds.
3. The built-once configurable-path Studio artifact, safe browser contracts, and authenticated empty shell.
4. Raw-target plus canonical Fetch handling and parity-proven Express 5/TanStack Start adapters.
5. Real-client bootstrap consumption and `studio/v1` immutable public-contract registry/baseline registration.
6. Exact route/cookie/CSP/origin/CSRF/cache/expiry/revocation/outage/package evidence without M19 content operations.

## Goals

The split must prove two bounded outcomes at separate gates. M18A proves registration-derived platform delegation and safe bootstrap authority; M18B proves that a developer can mount and operate the authenticated empty shell without moving content authority. Across the parent M18 scope:

1. A developer can configure and mount one Studio artifact at the exact active registration path without framework-owned business logic.
2. An authorized user can enter Studio through the existing dashboard-hosted identity flow without exposing OAuth, management, or refresh authority to browser JavaScript.
3. The BFF and platform both bind every request to one registration, workspace, project, environment, origin, mount path, user, and current policy decision.
4. The shell receives only a bounded safe bootstrap projection and exposes no content operation before M19.
5. Express and TanStack Start adapters produce the same routes, headers, cookies, errors, and security decisions as the Fetch core.
6. Dashboard and CLI remain the recovery and automation surfaces when Studio or the customer application is unavailable.

## Non-goals

M18 does not add:

- Entry, collection, locale, generated-form, draft, revision, Preview, Presentation, publish, or unpublish routes or UI.
- A replacement for the M13 local editor, or hosted-schema structure authoring.
- General dynamic OAuth registration, third-party OAuth applications, arbitrary redirect URIs, client secrets, client credentials, or broad account tokens.
- OAuth tokens in browser storage, HTML, URLs, logs, query keys, framework state, or cookies.
- A platform-hosted Studio session service or a production in-memory BFF store.
- Cross-origin browser calls to platform APIs, parent-domain cookies, iframe embedding, wildcard origins, or service-worker persistence.
- New public application-SDK administration methods.
- Next.js, Astro, edge-runtime, managed-hosting, deployment, DNS, TLS, or production-ingress rollout.
- Wildcard or per-branch preview-deployment origins. M18 supports one exact `main` registration/origin at a time; changing it deactivates the prior client and sessions. Preview-deployment lifecycle belongs to later environment/runtime design.
- Retirement of dashboard editorial routes; M19–M21 own parity and retirement.
- Package publication or production OAuth activation.

## Surface classification

| Capability                           | Canonical HTTP                                         | CLI                                       | Dashboard                                | Studio                            | Public SDK |
| ------------------------------------ | ------------------------------------------------------ | ----------------------------------------- | ---------------------------------------- | --------------------------------- | ---------- |
| Registration metadata                | Existing Control Plane v1 GET/PUT                      | Existing parity                           | Existing settings                        | Read-only bootstrap identity only | Excluded   |
| Runtime activate/deactivate          | Control Plane v1 `PUT .../studio-registration/runtime` | `studio registration activate/deactivate` | Explicit activation controls             | Excluded                          | Excluded   |
| OAuth authorization/token/revocation | Better Auth native protocol                            | Not applicable                            | Dashboard login/continuation             | BFF only; never browser JS        | Excluded   |
| Studio bootstrap                     | Studio v1 exact project/environment route              | Runtime-only; no CLI duplicate            | May link to active Studio                | BFF-only same-origin projection   | Excluded   |
| BFF login/callback/logout/session    | Package-owned app-local routes                         | Not applicable                            | Sign-in/recovery remains dashboard-owned | Exact configured mount            | Excluded   |
| Studio shell/assets                  | Package artifact                                       | Package/build verification only           | Link to active registration              | Exact configured mount            | Excluded   |

The app-local BFF contract is a supported package API, not an undocumented private UI transport. Platform application endpoints retain `{ ok, data, error, message }`; OAuth endpoints retain native protocol responses.

## Trust boundaries and threat model

### Assets

Protected assets are dashboard identity/session authority, OAuth codes/tokens, BFF session records and encryption keys, exact tenant/project/environment membership, safe registration redirect authority, and future Studio content access.

### Boundaries

1. Untrusted browser -> developer-owned application/BFF.
2. Developer BFF -> public platform OAuth and Studio APIs.
3. Dashboard browser/session -> Better Auth authorization continuation.
4. Control Plane user -> registration runtime activation.
5. Framework adapter/reverse proxy -> canonical Fetch handler.
6. Browser package -> server package and store, which must never be crossed by token material.

### Required controls

| Threat                            | Control                                                                                                              |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Spoofed Studio client             | Deterministic client ID from active registration; no caller-selected registration endpoint                           |
| Redirect takeover                 | Exact registered origin + mount callback; canonical URL equality; no wildcard or prefix matching                     |
| Authorization-code interception   | S256 PKCE, single-use state/attempt, exact callback, short code lifetime                                             |
| Login CSRF or mix-up              | Issuer/resource/client/state binding, signed provider continuation, exact callback and redirect validation           |
| Cross-tenant token use            | Token registration claims plus current composite scope resolution and policy on every Studio API call                |
| Stale membership/role             | Current server-side project/policy evaluation for bootstrap and all later operations                                 |
| Registration origin/path change   | Atomic platform revocation/version mismatch; next local protected request deletes the denied BFF session             |
| Browser token theft               | Tokens encrypted only in BFF store; opaque `HttpOnly` cookie; no browser API receives tokens                         |
| CSRF against BFF                  | Host/origin/Fetch Metadata checks, `SameSite=Lax`, JSON-only mutations, state, and no permissive CORS                |
| Host/proxy confusion              | Configured external origin is authority; adapters reject mismatched effective host/protocol and untrusted forwarding |
| Path traversal/route capture      | Canonical decoded path matching, no percent/backslash/dot ambiguity, finite asset manifest, closed methods           |
| XSS/clickjacking                  | No unsafe HTML, self-only CSP, `frame-ancestors 'none'`, `nosniff`, shared React escaping                            |
| Store replay/race                 | Digest-only opaque IDs, consume-once attempts, pre-dispatch fencing, bounded expiry, deletion on terminal failure    |
| Process-local production sessions | Store capability reports sharing and restart survival; production rejects process-local or restart-volatile stores   |
| Token/content leakage             | No bodies/tokens/cookies/raw URLs in errors, logs, traces, metrics, reports, or browser artifacts                    |
| Studio outage blocks recovery     | Dashboard direct login, registration deactivation, project recovery, and CLI remain independent                      |

## Registration runtime lifecycle

### State

A registration has runtime status `inactive | active` in addition to existing metadata/version fields.

- Every pre-M18 row migrates to `inactive`.
- Create/update metadata remains possible through the existing operation while inactive. While active, changing origin or mount path is user-only; a management credential cannot repoint active trust.
- A user-authorized origin or mount-path change on an active registration atomically disables the derived OAuth client, revokes outstanding Studio OAuth rows, increments registration authority, records the user actor, and leaves the new registration inactive.
- Activation is user-only, requires active project + CMS + exact environment, `project.update`, current expected version, and an OAuth user grant. Management, Delivery, and Preview credentials cannot activate or repoint runtime trust.
- Deactivation remains available as a recovery operation for an archived project. A project/environment-bound management credential with existing `project.update` authority may invoke only the fail-closed `active -> inactive` kill switch; its actor is persisted through the registration's existing user-or-credential change attribution and audit/receipt authority, while user-only runtime confirmation fields are cleared rather than implying human confirmation.
- Both user metadata invalidation and the management credential kill switch revoke current OAuth authority in the same transaction. There is no platform-to-BFF session callback in M18. Current bootstrap/refresh denies immediately; the BFF consumes that denial and atomically deletes its local record/cookie on the next protected request. Dormant encrypted records may remain until bounded expiry but grant no operation.
- Archive denies Studio authorization/bootstrap immediately. Restore does not resurrect a deleted BFF session; the user signs in again under current authority.

The Control Plane runtime mutation is:

```text
PUT /api/control-plane/v1/projects/{projectId}/environments/{environmentId}/studio-registration/runtime
```

```json
{
  "commandId": "uuid",
  "expectedVersion": 3,
  "enabled": true
}
```

It is receipt-idempotent and returns the bounded registration, effective runtime status, `replayed`, and `noOp`. Same command/same fingerprint replays; changed intent conflicts; stale version fails. Activation/deactivation, OAuth client/link changes, token revocation, audit, receipt, actor-union registration attribution, and registration version/status mutation are one database transaction. Developer-applied migration `0020_allow_studio_credential_kill_switch` removed the obsolete user-only actor predicate from `control_plane_command_receipt_scope_result_valid`; migration 0019 remains immutable.

### Deterministic OAuth client

For registration ID `<uuid>`, the client ID is a fixed versioned derivation such as:

```text
ffd-studio-v1-<uuid>
```

The platform—not user input—sets:

- `referenceId`: registration ID.
- `metadata`: bounded typed registration/project/environment/version marker.
- `redirectUris`: exactly `${applicationOrigin}${mountPath}/auth/callback`.
- `postLogoutRedirectUris`: none in M18; Studio logout is local plus token revocation.
- `tokenEndpointAuthMethod`: `none`.
- `applicationType`: `web`.
- `grantTypes`: `authorization_code`, `refresh_token`.
- `responseTypes`: `code`.
- `requirePKCE`: `true`.
- `skipConsent`: `false`; each BFF login fixes `prompt=consent` so a previous consent cannot silently establish a new Studio session.
- `enableEndSession`: `false`.
- resources: only the canonical Studio v1 resource.
- scopes: only `studio:session` and `offline_access`.

RFC 7591 endpoints stay disabled. OAuth client CRUD privileges remain denied. The derived client is not cached as immutable trusted global configuration because registration changes are database authority.

### Lifetimes and invalidation

- Authorization state/PKCE attempt: at most 10 minutes and single-use.
- Authorization code: installed provider default or a shorter proven bound; never increased for Studio.
- Access token: 5 minutes.
- Refresh token and BFF session absolute lifetime: 8 hours.
- Refresh reuse interval: zero.
- Browser session cookie maximum age never exceeds the stored session or refresh expiry.

Studio access-token claims include a versioned client kind, registration ID/version, project ID, environment ID, user subject, and one platform-generated non-secret stable grant ID carried across refresh. The grant ID is distinct from codes, tokens, sessions, clients, and registrations and lets bootstrap verify the establishment-audit marker. Claims accelerate rejection but never replace current database authorization.

Every Studio API request verifies cryptography, issuer, audience, client, `studio:session`, expiry, active registration, exact registration version/client metadata, active project/CMS, exact project/environment, and current user policy. Therefore deactivation, metadata change, archive, member removal, or policy loss denies immediately even while a JWT's cryptographic expiry has not elapsed.

Deactivation/update marks the client disabled and revokes persisted access tokens, refresh tokens, and consents for that client. Pending codes cannot redeem against a disabled/version-mismatched client. A BFF receiving terminal invalid-token/registration responses deletes its local session and cookie.

Successful authorization-code redemption records `studio.session.established` as a platform security audit attributed to the user and exact registration/project/environment/version. It contains no origin, path, client ID, code, token, cookie, store ID, or email.

The preferred implementation inserts the audit atomically with the grant transition. Because Better Auth 1.7.1 may not expose that transaction, M18A has one pre-approved fallback: the token endpoint buffers the successful provider response, synchronously persists the audit in the same request path, and releases token bytes only after audit success. Audit failure returns a bounded native OAuth hard error, exposes no token response, and triggers best-effort revocation of the unreturned grant; the consumed code requires a new authorization attempt. Bootstrap additionally rejects a grant lacking its establishment audit marker. Background/best-effort audit after a successful response is forbidden.

## M18A OAuth conformance client

M18A ships a named private test deliverable at `tools/studio-oauth-harness`. It is a public OAuth client in protocol terms—no client secret or confidential-client shortcut—and drives the complete authorize → dashboard login/acknowledgement → exact callback → token exchange → Studio bootstrap sequence with generated S256 PKCE and state.

The harness uses only loopback test registrations, keeps codes/tokens/verifiers in memory, emits only redacted outcomes, and is unavailable from production applications and package exports. Repository structure and forbidden-import tests fail if application/package production source imports it, if it appears in a publishable tarball/browser bundle, or if it accepts a caller-supplied client/resource/scope outside its fixture. M18A integration and committed headless dashboard tests use this harness for success, denial, malformed/replay/expiry, revocation, registration drift, audit failure, and non-enumeration evidence. It is deleted or retained as private test infrastructure after M18B; it never becomes a supported runtime client.

## M18B OAuth browser flow

1. `GET {mountPath}/auth/login` validates the exact external URL and creates a server-side authorization attempt.
2. The core generates at least 256 bits each for opaque attempt ID and OAuth state plus a standards-compliant PKCE verifier; only the challenge leaves the BFF.
3. The attempt store contains state, verifier, configured registration/project/environment/origin/mount, issuer, resource, fixed mount-root return, creation/expiry, and one-use state. It does not guess a registration version; callback bootstrap establishes that authority. The browser receives only the opaque attempt cookie.
4. The BFF redirects to the API-host authorization endpoint with exact client, callback, state, S256 challenge, resource, scopes, and forced Studio acknowledgement. No arbitrary return URL is accepted.
5. Better Auth sends unauthenticated users to dashboard login through its signed continuation. Dashboard remains the only credential form/session host.
6. Before authorization completes, the platform verifies active registration and current project access and renders the dashboard-hosted Studio acknowledgement with resolved project/origin context. Every new local session requires Allow; Deny issues no code.
7. The provider redirects only to the exact BFF callback with code, state, and its exact issuer identifier.
8. The BFF strictly validates the bounded callback query and compares state/issuer in constant time where applicable, atomically consumes the matching attempt, and exchanges code + verifier server-to-server with redirects disabled and bounded time/body limits.
9. The BFF strictly validates the token response, calls real bootstrap, verifies exact returned scope/user/registration authority, and only then atomically stores the encrypted token record under a new opaque session ID, replacing any prior local session. It clears the attempt cookie, sets the Studio session cookie, and redirects to the canonical mount root with no auth parameters.
10. Wrong state or issuer neither consumes nor clears an otherwise valid attempt. A matching provider denial, malformed matching callback, expired/consumed attempt, replay, malformed response, or registration drift renders bounded recovery without reflecting raw input; consumed/expired transient state is cleared.

Loopback HTTP follows the same flow and PKCE checks. Only exact `localhost`, `127.0.0.1`, or `[::1]` registrations may disable the cookie `Secure` attribute; production/non-loopback HTTP remains impossible.

## BFF route and mount contract

For registered mount `/studio`, the handler owns only:

```text
GET  /studio                     shell
GET  /studio/assets/<manifest>   immutable finite assets
GET  /studio/auth/login          authorization start
GET  /studio/auth/callback       exact OAuth callback
POST /studio/auth/logout         revoke/delete local Studio session; dashboard session remains
GET  /studio/api/bootstrap       authenticated safe bootstrap
```

The shell is served at the exact mount with no trailing-slash canonicalization redirect; absolute manifest asset URLs remove that need. Unknown paths/methods, encoded separators, dot segments, duplicate separators, backslashes, credential/query pollution, and oversized URLs fail closed. The handler never acts as an arbitrary platform proxy.

The Fetch core accepts a validated configuration and one canonical standard `Request`, then always returns a standard `Response`. Adapters first apply the shared raw-target/external-origin guard, perform exact mount matching, and delegate only canonical outside-mount requests to the host framework. They do not implement auth, cookies, CSP, token refresh, platform calls, or policy.

The configured public application origin—not arbitrary `Host`, `Forwarded`, or `X-Forwarded-*` input—is canonical. An adapter may honor forwarding only through explicit framework/server trusted-proxy configuration and must compare the resulting external URL to the configured origin before entering the core.

## Browser shell and asset behavior

`@framerfordevs/studio` owns the React shell, TanStack Router base-path behavior, browser-safe DTOs, and shared UI composition. It owns no OAuth client, token, cookie parser, store, environment reader, platform bearer client, SQL, or Effect runtime.

The artifact is built once and served at any validated portable active mount. The server constructs bounded HTML from the generated finite manifest, emits exact absolute mount asset URLs, and renders only escaped non-secret mount and canonical dashboard-recovery-origin metadata; it uses no `<base>`, token, user, content, arbitrary HTML, or executable inline configuration. Relative chunk imports resolve from manifest-listed assets. Assets use content hashes, exact MIME types, byte/count caps, and immutable cache headers. HTML/bootstrap/auth responses are `no-store`.

The M18 shell provides:

- Product/project/environment identity from authenticated bootstrap.
- Current user and bounded role/action projection.
- Signed-in, loading, unavailable, expired, forbidden, archived, CMS-disabled, inactive-registration, and not-found states.
- Sign-in, retry, dashboard recovery, and local sign-out actions. Sign-out copy states that the dashboard identity session remains active and that the next Studio login requires acknowledgement but may not require credentials.
- Accessible landmark/navigation/focus/status behavior.
- Explicit “content editing arrives in the next milestone” empty state; no placeholder mutation.

No content body, draft, credential, schema implementation metadata, or hidden field is returned.

## BFF session-store contract

### Required store operations

The server package owns refresh orchestration; adapters and stores do not.

The store contract supports:

- Atomic create of encrypted authorization attempts with expiry and bounded outstanding-attempt admission.
- Atomic consume-once of an authorization attempt.
- Atomic create of one encrypted session record under a digest key.
- Read of session ciphertext + version + expiry.
- Atomic pre-dispatch refresh claim with owner/fencing generation, bounded waiter observation, exact-owner commit, safe pre-dispatch release, and terminal invalidation after ambiguous dispatch.
- Atomic replacement of an existing browser session after reauthentication.
- Delete one session without permitting a late refresh commit to recreate it.
- Atomic shared abuse-limit evaluation for authorization start, callback/token exchange admission, registration routes, and authenticated session routes.
- Atomic registration-scoped attempt/session count admission under the source-controlled maxima.
- Bounded cleanup by expiry and opaque registration digest.
- Declared `scope: "shared" | "process_local"` and `survivesProcessRestart: boolean` capabilities. Production requires `shared` plus `true`; these fields describe application-process topology only and do not claim Redis AOF/RDB or disaster durability.

The core generates raw opaque IDs with at least 256 bits and stores only their SHA-256 digest. It encrypts authorization-attempt payloads—including state and PKCE verifier—and OAuth token records before calling the store using the confirmed version-1 A256GCM envelope and server keyring. Store implementations never receive plaintext state, verifier, access token, or refresh token. One current and at most three previous decryption keys permit bounded rotation; only the current key encrypts.

Removing a previous key is an intentional forced-logout boundary for any record still encrypted by it. Operators must keep each retired decrypt key available for at least the maximum eight-hour session lifetime after the last process capable of writing with that key is drained; the ten-minute attempt lifetime is contained by that bound. Mixed-version fleets may not disagree about the current write key. Early removal must be surfaced as session invalidation, never corruption or a fallback to plaintext.

The encrypted record contains only exact registration/project/environment/version, application origin/mount, user ID, immutable absolute deadline, OAuth token values/types/scopes/expiries, refresh generation/version, and safe timestamps. It contains no content, schema, labels, email, arbitrary request, or return URL.

### Refresh and concurrency

The core refreshes at the confirmed 60-second threshold. One atomic pre-dispatch claim winner may submit a refresh generation; losers wait/reload without issuing. Refresh-token reuse remains zero. Once dispatch begins, every ambiguous transport/provider/store outcome makes that generation terminal rather than retrying it. A successful response is bootstrap-validated before exact-owner commit; failed or stale commit triggers bounded compensation. The cookie clears only after confirmed record absence/terminal invalidation, while store unavailability remains a retryable `503` rather than false logout.

The opaque browser session ID remains stable across ordinary OAuth refresh to avoid multi-tab invalidation races. It is always newly generated after callback/re-authentication, cannot be caller-selected, and is deleted on logout, absolute expiry, terminal auth failure, or detected registration drift. M18 has no privilege-elevation operation; current platform policy prevents a stable local session ID from preserving removed authority.

### Production enforcement and reference store

The server package has no implicit store. A separately exported test/development memory store reports `scope: "process_local"` and `survivesProcessRestart: false`. Startup rejects it for every non-loopback origin and whenever production mode is selected, including production loopback fixtures. Shared/restart-stable capability is an explicit trusted deployer declaration backed by conformance, not runtime proof of arbitrary infrastructure.

M18B ships `@framerfordevs/studio-store-redis` as the production-capable reference adapter. It uses a caller-supplied Redis connection, namespaced digest-only keys, server-side TTLs, atomic Lua operations for admission/consume/replacement/refresh fencing/delete, bounded commands/replies/timeouts, TLS/auth-compatible client configuration, and no degraded-memory fallback. Session availability—not permanent business data durability—is its purpose; confirmed record loss signs users out, while a transient outage returns bounded unavailability without pretending records are absent. Production guidance requires shared persistence across application instances/deploys and documents Redis persistence/HA plus namespace rotation after restore as operator availability choices.

Adapters cannot suppress the production-store check. Tests prove production cannot start through omitted, implicit, process-local, restart-volatile, or falsely selected default configuration. Custom production stores remain supported but must satisfy the same atomicity, admission, expiry, encryption-envelope preservation, cleanup, outage, and concurrency conformance suite.

## Cookie and browser-storage contract

### Studio session cookie

For HTTPS registrations:

```text
Secure
HttpOnly
SameSite=Lax
Path=<exact mount path>
Domain absent
Max-Age <= remaining 8-hour absolute session lifetime
```

Cookie names, registration digest suffixes, loopback variants, attributes, duplicate rejection, and deletion behavior are exact as fixed in the M18B confirmation. HTTPS uses `__Secure-`, never `__Host-`, because the required non-root mount path is the cookie path. Exact loopback HTTP uses only the separate unprefixed names and omits `Secure`; this exception cannot activate for non-loopback hosts.

The authorization-attempt cookie has the same host/path isolation, an exact 10-minute lifetime, and contains only an opaque attempt ID. Creation sets `Max-Age=600` and `Expires=<attempt deadline>`. Session creation sets `Max-Age=max(0, floor(absolute deadline - now))` and `Expires=<the same immutable deadline>`; no refresh or response moves that deadline. Deletion uses the same name, host-only scope, Path, SameSite, HttpOnly, and Secure profile with `Max-Age=0` plus a past `Expires`. Callback consumes and clears the attempt cookie.

Studio writes no auth value to `localStorage`, `sessionStorage`, IndexedDB, Cache Storage, service workers, route/search/hash state, HTML, React Query keys, or clipboard. Non-sensitive user preferences remain out of M18 unless separately justified.

### Origin and CSRF

- Bootstrap requires exact same-origin browser evidence and reauthorizes current platform scope; logout additionally requires exact Origin, same-origin Fetch Metadata, `application/json`, and exact `{}`.
- Login is a top-level non-prefetch document navigation with no query/body; callback permits the expected cross-site top-level provider navigation but requires the exact browser-bound attempt, state, callback, and issuer rules fixed above.
- BFF routes emit no credentialed CORS policy; cross-origin/same-site sibling API requests and `Origin: null` are denied.
- Cookies are not authorization by themselves: the BFF resolves the encrypted store record and bootstrap reauthorizes current project scope.

## Platform Studio v1 bootstrap

The canonical route is server-to-server bearer-only:

```text
GET /api/studio/v1/projects/{projectId}/environments/{environmentId}/bootstrap
```

It rejects cookies, browser Origin/preflight, query credentials, redirects, duplicate Authorization, wrong resources/scopes/clients, and every non-Studio credential family. It returns the standard application envelope and `Cache-Control: no-store`.

The response is bounded and schema-backed:

```ts
type StudioBootstrap = {
  formatVersion: 1;
  registration: {
    id: StudioRegistrationId;
    version: number;
    applicationOrigin: StudioApplicationOrigin;
    mountPath: StudioMountPath;
  };
  project: {
    id: ProjectId;
    name: ProjectName;
    workspaceId: WorkspaceId;
  };
  environment: {
    id: EnvironmentId;
    key: "main";
    name: "main";
  };
  user: {
    id: AuthUserId;
    name: string;
    email: string;
  };
  role: ProjectRole;
  effectiveActions: ReadonlyArray<StudioBootstrapAction>;
  session: {
    expiresAt: IsoDateTime;
  };
};
```

`StudioBootstrapAction` is a closed shell-relevant projection derived from canonical policy, not caller-selected role simulation. It may describe future navigation availability but grants no operation and includes no secret or content. Email is shown only to the authenticated user in their own shell and remains excluded from telemetry.

The operation requires active registration, exact origin/path/client/version, active project, enabled CMS, exact environment, active membership, and `project.read`. Known members without authority receive `FORBIDDEN`; foreign/nonexistent scope remains `NOT_FOUND` after valid Studio authentication. Invalid Studio tokens fail generically before resource lookup.

## Security headers and cache policy

Shell/auth/bootstrap responses follow the exact route/response matrix in the M18B confirmation and set:

- `Content-Security-Policy` with the confirmed no-inline, no-worker, self-only script/style/connect/image profile, `object-src 'none'`, `base-uri 'none'`, `form-action 'self'`, and `frame-ancestors 'none'`.
- `Referrer-Policy: no-referrer`.
- `X-Content-Type-Options: nosniff`.
- `Cross-Origin-Opener-Policy: same-origin`; required top-level OAuth navigation must pass without opener communication.
- `Cross-Origin-Resource-Policy: same-origin`.
- `Permissions-Policy` denying unused capabilities.
- `Cache-Control: no-store` for HTML, auth, errors, and bootstrap.
- Immutable public caching only for content-hashed finite assets.

The design must test the exact COOP behavior through OAuth popup/top-level navigation; top-level navigation is the required baseline and must not depend on opener communication.

## Effect and package architecture

### Platform

- `packages/api/src/contracts/studio/`: Studio token/bootstrap schemas and public Studio OpenAPI source.
- `packages/api/src/operations/studio-public/`: named current-user bootstrap, authorization, and quota workflows.
- `packages/api/src/services/studio/`: registration-bound principal verification and repository adapters.
- `packages/auth`: deterministic client/resource configuration, claims, and installed-provider compatibility boundary.
- `packages/db`: registration runtime state and immutable migration authority; existing OAuth tables remain Better Auth authority.
- `apps/server`: Studio v1 Express transport and exact API-host route profile.
- `packages/public-contracts`: deferred to M18B for Studio v1 registry and immutable compatibility baseline after the shipped BFF consumes the M18A contract. M18A still owns schema-backed OpenAPI source, deterministic generated-byte tests, and the test harness contract; it does not create a released-baseline entry.

Business workflows use named `Effect.fn`, typed expected errors, services/Layers, and the existing shared `ManagedRuntime`. Better Auth remains Promise-native at its protocol boundary and translates into typed application failures at the Studio adapter. No request-local runtime or raw third-party error reaches contracts.

### Developer-owned runtime packages

- `packages/studio`: browser-only SPA, router, safe contracts, UI composition, and built asset manifest.
- `packages/studio-server`: Fetch core, raw-target/config decoders, OAuth client, real-bootstrap token-response validation, session encryption/fenced refresh, store contract/conformance suite, assets, and safe responses.
- `packages/studio-store-redis`: production-capable shared Redis store and limiter adapter over the server contract; it receives ciphertext/envelopes only.
- `packages/studio-adapter-express`: only earliest-node raw-target/external-origin validation plus Express Request/Response/next translation.
- `packages/studio-adapter-tanstack-start`: only earliest supported Node/Nitro raw-target validation and TanStack Start integration around native Web Requests.

The server package never imports app source. Adapter packages depend on declared server exports. Browser bundle forbidden-import tests reject server/auth/env/Node/database/token/store modules. Packages are staged at `0.0.0` and remain unpublished until a separate developer gate.

## Configuration contract

The BFF receives one strictly decoded configuration:

- one canonical platform origin from which issuer, resource, authorize/token/revoke, and bootstrap endpoints are derived;
- one canonical dashboard origin used only for direct browser recovery navigation;
- registration, project, and environment IDs;
- canonical application origin and confirmed portable active mount path matching registration;
- runtime mode and stable deployment namespace epoch;
- optional lower deployment deadlines within the fixed package maxima, never raised limits;
- explicit shared, process-restart-stable session store except exact loopback development;
- one current and at most three previous exact-32-byte session-encryption keys by non-secret key ID.

No package reads an ambient management/OAuth token. Server-only configuration never enters Vite/browser variables. The handler fails startup on locally inconsistent IDs/origin/path, unknown fields, insecure non-loopback HTTP, weak/missing encryption material, missing store, disallowed process-local/restart-volatile topology, or unsupported adapter/runtime. Startup does not claim unauthenticated remote registration validation; authorize plus callback bootstrap establishes the current active registration/version before a local session exists.

The platform does not fetch, health-check, or SSRF-probe the registered customer origin. Dashboard launch links use the validated canonical origin/path directly; ordinary browser/network failure is reported honestly.

## Failure and availability behavior

- **Dashboard unavailable before sign-in:** existing Studio sessions continue only until local/access authority requires refresh or current platform checks fail; new sign-in and recovery are unavailable honestly.
- **Marketing/docs unavailable:** Studio sign-in and runtime are unaffected.
- **Customer application/BFF unavailable:** dashboard and CLI registration deactivation/recovery remain available.
- **Platform API unavailable:** the shell may render a static bounded unavailable state but cannot use cached bootstrap as authority or mutate anything.
- **Session store unavailable:** fail closed; do not create a browser-only fallback.
- **Store record missing after deploy:** clear cookie and restart sign-in.
- **Registration inactive/changed:** clear local session after the platform denial and link to dashboard recovery.
- **User removed/role changed/project archived:** current platform checks deny; no stale browser projection becomes authority.

## Abuse controls, observability, and audit

M14 activation/deactivation remains under the existing shared `control-plane.global` plus `control-plane.user` policies with `studioWrite` cost 5; user-only activation does not add a credential bucket. M18A adds closed shared policies rather than relying on Better Auth's current production-only process-memory default:

| Policy                | Identity                   | Limit / capacity | Operations                                     |
| --------------------- | -------------------------- | ---------------- | ---------------------------------------------- |
| `studio.oauth.global` | installation               | 3,000/min / 250  | authorize, token, revoke ingress               |
| `studio.oauth.client` | active registration/client | 120/min / 20     | code redemption, refresh, revoke               |
| `studio.oauth.user`   | current authenticated user | 60/min / 10      | pre-authorization and acknowledgement attempts |
| `studio.global`       | installation               | 3,000/min / 250  | Studio v1 bootstrap                            |
| `studio.user`         | current authenticated user | 120/min / 20     | Studio v1 bootstrap                            |

Before bounded parsing and client/session resolution, current M18A has only the installation-wide `studio.oauth.global` identity. Forwarded source data is not trusted because M23 still owns production ingress source restriction; direct access to a server configured to trust forwarded authority remains unavailable. Consequently one abusive source can exhaust the 3,000/min safety bucket and temporarily deny Studio OAuth for every project. M18A accepts that availability tradeoff rather than trusting spoofable source identity: the bucket sheds overload but provides no tenant/source fairness, and its threshold requires load evidence before acceptance.

After bounded client/user verification, the exact client/user policy limits the narrower identity. Native OAuth errors remain protocol-shaped. Better Auth's route limiter remains enabled as defense in depth but must use shared production storage and be configured not to become an undocumented per-process or single-BFF-IP bottleneck. The compatibility slice must prove hook/order/body handling before relying on it. M23 may add a trusted-source bucket only after ingress replacement/source restrictions are proven; M18A must not pre-authorize that identity.

M18B enforces the confirmed source-controlled registration/session rates, count admission, concurrency, byte, deadline, and cleanup bounds through the store before allocation or expensive work. It has no source-address bucket before M23 proves ingress/header replacement; forwarding data never becomes local quota authority.

Domain audits are added for:

- `studio.registration.runtime.activated`
- `studio.registration.runtime.deactivated`
- `studio.session.established`

All contain actor, exact stable scope/registration ID, registration version, request ID, action, and time. The session-establishment event additionally uses the non-secret Studio grant ID as its resource identity so bootstrap can verify the marker. They exclude origin, mount path, client ID, code/token values, user email, cookies, BFF store IDs, encryption IDs, and request bodies. `studio.session.established` is a security-category event emitted once for a grant whose token response may be released, not for refresh, bootstrap retry, or a failed local store write. Under the synchronous fallback, an audit may exist even if transport delivery later fails; this bounded false-positive is preferable to releasing an unaudited grant.

Named spans cover activation/deactivation, authorization preflight, Studio-token verification, bootstrap, BFF authorization attempt, callback exchange, store lookup/fence/commit/delete, refresh, logout, asset/shell response, and adapter translation.

Safe attributes use closed operation/adapter/runtime/auth/outcome/status/size/duration buckets and stable scope IDs only where current telemetry rules permit. Metrics never label tenant, registration, user, origin, path, session, state, client, token, or error text. Logs never include raw URL query, callback code/state, Authorization, Set-Cookie, token response, ciphertext, content, or PII.

## Performance and reliability

- Shell assets are finite, content-hashed, bounded, and code-split; M18 has no content-list waterfall.
- Bootstrap performs one registration/project/environment/current-policy path without N+1 queries.
- Store calls and platform fetches have the confirmed deadlines, abort propagation, response byte limits, bounded queues, and no hidden retry after ambiguous work.
- Refresh claims one generation before dispatch; contenders never submit it, and any post-dispatch ambiguity requires reauthentication rather than replay.
- OAuth/browser requests never follow unexpected redirects.
- Handler and adapters do not buffer unbounded request/response bodies.
- Browser shell has no duplicate React/UI copies and records raw/gzip package and route budgets before review.
- No service worker or offline authority is introduced.

## Database impact and migration record

M18A's developer-generated/applied migrations are complete and immutable:

- `0019_add_studio_runtime_authority` added registration runtime state/actor/time authority, receipt support, and active lookup indexes.
- `0020_allow_studio_credential_kill_switch` corrected only the receipt constraint so an exact management credential may record `active -> inactive` recovery.

M18B requires no Drizzle schema change or migration. It uses existing OAuth/audit authority plus developer-owned encrypted store state. If implementation discovers a need for persisted platform session, key, adapter, or handoff state, work stops for a design amendment and the developer-controlled migration process; it is not added opportunistically.

## Test and evidence plan

### Pure/property/contracts

- Deterministic client IDs and exact callback composition.
- Canonical origin/mount matching, loopback exceptions, ports, IPv6, Unicode, byte bounds, traversal, encoded separators, duplicate separators, and route prefix confusion.
- Exact OAuth client metadata/resource/scope/grant matrix and dynamic-registration exclusions.
- Store opaque ID entropy/encoding/digest, encrypted attempt/token envelopes and authenticated-data swapping denial, key rotation/deliberate early-retirement logout, immutable expiry, atomic admission/consume/replacement/refresh fencing/delete, and the production shared/restart-stable topology guard.
- Cookie names/attributes/path matching for multiple registrations and non-root mounts.
- Bootstrap schema/action projection and standard envelope/error mapping.
- Studio OpenAPI deterministic exact bytes and forbidden control-plane/content/protocol surfaces; immutable public-contract registry/baseline registration waits for M18B consumption.

### Provider compatibility and M18B correction gate

Before broad M18B runtime implementation, preserve the accepted pinned Better Auth 1.7.1 evidence and prove the bounded compatibility correction supports:

- deterministic database-managed public clients without enabling RFC 7591;
- API-host authorize/token with dashboard-hosted login continuation and host-only dashboard cookie;
- exact redirect, mandatory S256 PKCE, state, resource, scope, forced per-session Studio acknowledgement, short TTL, zero refresh reuse, and revocation;
- current project authorization before acknowledgement/code completion and version-bound consent invalidation;
- shared authorization/token rate-limit hooks and preferred atomic or approved synchronous-gated `studio.session.established` audit ordering;
- registration/version claims or an equally strict verifier binding;
- disabled-client and revoked-token behavior for pending code, access, and refresh paths;
- loopback callback behavior without weakening production HTTPS;
- absolute eight-hour denial before token release after multiple rotations, denial of pre-deadline access tokens after the original deadline, and bootstrap-marker enforcement without extending the provider refresh row.

A regression in deterministic client resolution, exact redirect/resource/scope, mandatory PKCE/state, pre-issuance current policy, consent/version invalidation, token binding, audit gating, or the new absolute deadline stops M18B for remediation or design amendment. The accepted synchronous response-gating, no-token-release, bootstrap-marker, and compensating-revocation fallback remains valid; no custom handoff or parent-domain cookie is an automatic fallback.

### Effect/service tests

- Replaceable registration repository, policy, Studio principal verifier, clock, ID/random generator, BFF HTTP client, store, encryption keyring, logger, and telemetry Layers.
- Expected auth/store/upstream failures remain typed; defects and interruption stay distinct.
- No repository work after malformed token/client/path; no bootstrap loading before exact principal scope.
- Current membership/role/archive/CMS/registration checks on every bootstrap.
- No token/origin/path/email/body enters telemetry.

### PostgreSQL integration

- Existing registrations begin inactive.
- Atomic activate/deactivate + derived OAuth client/resource link + audit + receipt.
- Same-command replay, changed-fingerprint conflict, stale version, concurrent activate/deactivate/update, and no-op behavior.
- Active metadata update disables client, revokes access/refresh/consent, increments authority, and remains inactive.
- User-only activation and metadata changes; exact management-credential deactivation-only recovery; Delivery/Preview and broader credential denial.
- Cross-workspace/project/environment isolation and actor constraints.
- Failure injection after every registration/client/link/token/audit/receipt stage leaves no partial activation authority; token-audit failure proves no token bytes are released, bootstrap denies the grant marker, and compensating revocation is attempted.
- Indexed active-registration/client/token paths and zero test residue.

### HTTP and security

- Every Control Plane runtime and Studio v1 path/method/query/header/content-type/body/status/envelope/request-ID/cache behavior.
- The private `tools/studio-oauth-harness` drives OAuth code/PKCE/state success and malformed, replayed, expired, wrong client/resource/scope/issuer/audience/redirect/version cases through token exchange and bootstrap.
- Foreign/nonexistent non-enumeration and known-member forbidden behavior.
- Host/origin/Fetch Metadata/CSRF/CORS, duplicate headers, cookies on API host, Authorization on browser routes, redirects, oversized/chunked input, and safe failures.
- Registration change, membership removal, policy loss, archive, refresh replay, and provider/store outage invalidation.
- Secret scanners prove browser/server reports and artifacts contain no seeded token/cookie/key values.

### M18B store conformance and adapters

- Shared conformance runs against the memory test store and shipped Redis adapter, including real Redis atomic admission/consume/replacement, pre-dispatch refresh fencing, owner death before/after dispatch, late commit, logout race, count/byte limits, namespace restore rotation, outage/recovery, and no memory degradation.
- Production and non-loopback startup cannot use a missing, implicit, process-local, or restart-volatile store; custom topology declarations remain trusted configuration and must pass the same suite.
- Two independent BFF processes cover concurrent tabs, one refresh winner, bounded waiters, ambiguous/lost replies, two grants for the same user/client, and proof that no generation is submitted twice.
- Direct frameworkless canonical Fetch conformance plus the separate raw-target guard and Express/TanStack parity cover every owned route, status, header, cookie, body, error, cancellation, streaming/byte bound, outside-mount delegation, and external-origin decision.
- Static import/runtime checks substantiate only Node/Web Request behavior with a pre-normalization Node ingress guard; no evidence or documentation claims edge/unknown-runtime portability.
- Reverse-proxy hostile forwarded-host/protocol cases fail closed, and package import/exports prevent browser-to-server dependency leakage.

### M18A dashboard acknowledgement browser/accessibility

The private OAuth harness drives committed headless, retry-free dashboard specifications for Allow, Deny, unauthenticated login continuation, live dashboard session, registration drift, and callback cleanup. Component and browser coverage require keyboard order/activation, initial and failure focus, status/error announcements, explicit project/origin labelling, 375 px and 200% reflow, and automated WCAG A/AA checks. Routine re-entry after expiry, store loss, deploy record loss, or registration recovery uses neutral continuation copy—not error or security-warning language—while still explaining the delegation accurately.

### M18B Studio browser/accessibility

Committed headless, retry-free specifications cover:

- Direct configured-path load, nested path, sign-in redirect/explicit Studio acknowledgement/callback cleanup, refresh, local-only logout, expiry, revocation, and recovery.
- A live dashboard cookie never bypasses the next Studio acknowledgement after local logout.
- Cookie host/path behavior, duplicate/shadow denial, absent browser token/storage authority, clean post-callback application URL with one-use code protections, and no cross-origin API request.
- Inactive/changed registration, unauthorized role, archive, platform/store/customer-app outage states.
- Keyboard/focus/landmarks/status, sign-in and recovery links, 375 px and 200% reflow through component/accessibility coverage, and automated WCAG A/AA checks.

Browser tests do not retain cookies/tokens or capture screenshots/traces/video. Interactive review remains separately developer-authorized.

### Package/build/readiness

- Clean fixture installs staged packages and mounts both adapters at non-default nested paths; the production artifact stays within the fixed initial-JS/CSS budgets, measured from manifest reachability with gzip level 9.
- Package tarballs contain only expected builds/assets/types/licenses and no environment/test/coverage files; forbidden-import and archive checks keep `tools/studio-oauth-harness` out of all production graphs and artifacts.
- Browser bundle contains no Node, Better Auth server, token/store/encryption, env, database, Control Plane, or management modules.
- Format, lint, structure, contract drift, types, unit/integration/contract/accessibility/browser/coverage, audit, build, Docker, database invariants, package inspection, and `git diff --check` pass.
- Stop the independent worker before shared-database gates and keep/restore it only under the established developer-controlled state.

## Implementation sequence and gates

### M18A — Studio platform authority

1. **Split/design approval:** developer approves or amends this record and the M18A/M18B roadmap split. No implementation begins before this gate.
2. **Provider compatibility slice:** build the private public-client `tools/studio-oauth-harness`; prove pinned Better Auth split-host Code + PKCE, forced acknowledgement, pre-issuance policy, shared abuse hooks, preferred atomic or approved synchronous-gated audit ordering, consent invalidation, and revocation before new authority is built.
3. **Platform contracts and pure kernels:** add registration runtime, Studio bootstrap, client/grant derivation, token claims/verifier, rate-limit policies, consent projection, deterministic OpenAPI bytes, and tests. Do not register an immutable Studio public-contract baseline yet.
4. **Database schema gate:** edit approved Drizzle schema/tests, then stop for developer migration generation/application and full artifact review.
5. **Activation and delegation authority:** implement atomic runtime state, deterministic clients, revocation, receipts, activation/session audits, HTTP, CLI, dashboard activation controls, and Studio-specific acknowledgement.
6. **Studio resource authority:** implement token verification, bootstrap, route profile, deterministic OpenAPI generation/tests, shared quotas, and non-enumeration; defer registry/artifact baseline commitment to M18B.
7. **M18A evidence and review (completed):** run complete applicable gates, update KB, provide one Conventional Commit proposal, and stop for developer review. M18B remained unauthorized at that gate.

### M18B — Studio mount and security runtime

The detailed M18B design is approved. The developer authorized continuation after Step 1's required checkpoint, and all five steps are now complete:

1. Land the migration-free absolute-eight-hour and portable-active-mount compatibility corrections with focused M18A regressions; no runtime package work proceeds if either accepted authority cannot be preserved.
2. Register the accepted Studio v1 bytes as the canonical artifact/immutable baseline; create the five staged browser/server/Redis-store/adapter workspaces and forbidden-import/build/package tests without content features.
3. Implement the confirmed raw-target/mount/assets, OAuth/bootstrap flow, A256GCM attempt/session contract, pre-dispatch refresh fencing, Redis adapter, exact cookies/routes/headers/bounds, local logout, and failures.
4. Complete canonical Fetch plus Express/TanStack parity, the accessible authenticated empty shell, two-process Redis/concurrency/outage evidence, package inspection, and load/bound evidence.
5. Run complete applicable readiness, update KB, provide a separate Conventional Commit proposal, and stop for developer review. M19 remains unauthorized until M18B acceptance.

Any need for a custom handoff, dynamic registration, browser token storage, platform Studio-session service, parent-domain cookie, arbitrary proxy, additional framework/core dependency, broader scope, unplanned migration authority, or M19 content operation stops for explicit amendment.

## Alternatives rejected

### Custom one-time handoff

Rejected because it duplicates standards-based code/state/replay/expiry/revocation authority and repeats the M17 anti-pattern without benefit.

### General dynamic OAuth client registration

Rejected because Studio clients are derived platform resources, not arbitrary third-party applications. Self-service RFC 7591 would create a broader client-management program, redirect trust, and abuse surface.

### Reuse the fixed CLI client

Rejected because its redirect/grant model and broad Tooling/Authoring/Control Plane scopes are not exact Studio authority. It would weaken resource and client attribution.

### Treat every existing registration as active

Rejected because M14 explicitly promised inert metadata. Retroactive trust would convert previously harmless origins into redirect/session authority without renewed approval.

### Skip user acknowledgement because activation already trusted the origin

Rejected. Activation is an administrative project decision, while OAuth issuance delegates a particular user's current authority. Because `project.update` is available to the developer role, activation alone cannot silently stand in for that user's decision. M18 uses dashboard-hosted Studio-specific acknowledgement on every new local session rather than generic third-party wording.

### OAuth tokens in encrypted browser cookies

Rejected because encryption does not change token location or blast radius. Browser storage remains outside the selected BFF-only authority boundary.

### Platform-hosted Studio session service

Rejected because it adds a second session protocol and makes platform infrastructure own live session state for developer-hosted runtimes. The BFF already owns deployer origin/TLS/runtime responsibilities and should own its session store.

### In-memory production sessions

Rejected because redeploy/multi-instance loss would silently invalidate users and cannot provide shared restart-stable atomic refresh semantics. The runtime fails closed instead of warning and continuing.

### Direct browser calls to Studio v1

Rejected because they require browser bearer authority/CORS and bypass the BFF isolation selected by product and M13 precedent.

### Framework business logic in adapters

Rejected because auth/policy/cookie/path drift would emerge immediately. Adapters translate only; the Fetch core owns behavior.

### Add Next.js and Astro adapters in M18B

Rejected as premature dependency and compatibility scope. Direct Fetch-core conformance plus the two repository-native adapters proves framework independence only within the documented Node/Web Request baseline; it does not claim universal runtime portability.

## Decision-standard review

### Product alignment

The design gives developers a portable mount and clients one role-projected Studio entry while preserving developer-owned infrastructure and dashboard recovery.

### Correctness

Exact registration identity, deterministic OAuth clients, PKCE/state, optimistic/idempotent activation, registration-version binding, current policy, and pre-dispatch fenced refresh prevent ambiguous or stale authority.

### Security

No dynamic registration, client secret, browser token, wildcard origin, parent cookie, arbitrary proxy, or retroactive registration trust is introduced. Revocation and current authorization are server-side and exact.

### Reliability

Restart-stable bounded BFF sessions, pre-dispatch fenced refresh, explicit ambiguous-outcome sign-in recovery, no browser fallback, and independent dashboard recovery make outages and redeploy behavior explicit.

### Performance

One bounded bootstrap, finite hashed assets, no content waterfall, and no extra framework business hop keep the shell small. Measurements, not speculative caching, govern later optimization.

### UX

Users enter the configured project Studio through familiar dashboard authentication and an accurate project/origin-specific delegation acknowledgement. Local logout clearly leaves the dashboard identity session intact. Expiry, denial, outage, inactive registration, and recovery have explicit accessible states.

### DX

Developers get a canonical Fetch handler, strict configuration, conformance suite, and two thin adapters. Unsupported frameworks can integrate at the Web Request boundary without copying auth logic.

### Observability

Closed spans/metrics and exact activation audits diagnose the new trust boundary while excluding callback, token, cookie, origin, path, content, and PII values.

### Maintainability and future compatibility

Separate browser/server/adapter packages, one narrow Studio resource, current policy evaluation, and no M19 content routes leave a stable foundation for content/localization and later visual Studio work without migrating identity.

## Accepted M18A scope

The developer approved the M18A/M18B roadmap split and has accepted **M18A** under this design:

1. Explicit inactive/active Studio registration runtime state and user-only activation.
2. One deterministic registration-derived public OAuth client with Authorization Code + S256 PKCE, `studio:session`, current server-side pre-authorization, forced per-session Studio acknowledgement, shared abuse controls, and no general dynamic registration.
3. Fail-closed `studio.session.established` security audit using preferred transaction atomicity or the approved synchronous response-gating/bootstrap-marker fallback.
4. A private test-only public OAuth client that proves authorize through bootstrap and cannot enter shipped dependency graphs or artifacts.
5. Studio v1 bootstrap and deterministic OpenAPI source only; immutable `packages/public-contracts` baseline registration, BFF packages, mounted shell, and M19 content/editorial operations wait for M18B.
6. The explicit pre-M23 installation-wide OAuth safety-valve tradeoff and developer-applied migrations `0019_add_studio_runtime_authority` and `0020_allow_studio_credential_kill_switch`.

M18B's approved design remains: BFF-only A256GCM OAuth storage, exact opaque path-scoped sessions, pre-dispatch refresh fencing, a production Redis adapter with no memory fallback, raw-target plus canonical Fetch conformance, Express 5/TanStack Start adapters, accepted Studio baseline registration, and the empty authenticated shell. The compatibility corrections and runtime packages are complete; final acceptance remains developer-controlled.
