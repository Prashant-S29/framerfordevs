# Milestone 18 Studio mount and security runtime design

**Status:** M18A design approved and implementation authorized; M18B implementation remains unauthorized

**Date:** 2026-09-21

## Approval amendment — 2026-09-21

The developer approved the amended M18A/M18B split and authorized M18A implementation. Work begins with the mandatory Better Auth provider-compatibility slice and private OAuth harness. M18B detailed confirmation/implementation, migration generation/application, package publication, production OAuth/configuration, rollout, deployment, commit, milestone acceptance, and M19+ remain developer-controlled.

## Implementation checkpoint — 2026-09-21

The provider compatibility slice, Studio platform contracts/pure kernels, deterministic OpenAPI source, shared quota registry, and approved Drizzle schema edits are complete. The developer generated and applied `0019_add_studio_runtime_authority`; full artifact review and read-only live-catalog verification confirm its snapshot chain, 61-table scope, two intended changed tables, contiguous journal/migration row, columns, constraints, indexes, and default-inactive registration authority. M18A database integration may resume; M18B and operational rollout remain gated.

## Decision summary

The original proposal combined a new platform OAuth/resource authority, a migration and Control Plane lifecycle, four developer-runtime packages, two framework adapters, and a browser shell. That approaches the M13 upper bound and crosses the repository's platform/runtime seam. The approved M18 roadmap therefore uses two sequential review and acceptance units:

- **M18A — Studio platform authority:** explicit registration activation, deterministic Studio OAuth clients, per-session user acknowledgement, shared abuse controls, token verification, security audit, one bounded server-to-server bootstrap API, and a private end-to-end OAuth conformance client.
- **M18B — Studio mount and security runtime:** the developer-owned BFF, a production Redis store adapter, exact mounted assets/routes/cookies, Fetch core, Express and TanStack Start adapters, and the authenticated empty shell.

M18A must be accepted before M18B implementation can be authorized. This approval authorizes M18A implementation only; after M18A acceptance, the developer must approve or amend the M18B details against implemented provider contracts. M19 remains blocked on M18B acceptance.

The parent design makes four load-bearing choices:

1. Studio sign-in uses OAuth 2.1 Authorization Code with S256 PKCE through the existing Better Auth identity authority. This extends the current fixed-CLI OAuth model with one deterministic public client per explicitly activated Studio registration; it is not general dynamic client registration.
2. OAuth access and refresh tokens remain in a developer-owned BFF. Browser JavaScript receives only a random opaque host-only `HttpOnly` Studio session cookie. M18B must ship both a store contract and a production-capable Redis reference implementation; there is no production in-memory fallback.
3. A canonical Web Standards `Request -> Response` BFF core owns routing, auth exchange, session refresh, bootstrap, assets, headers, and upstream adaptation. Thin Express 5 and TanStack Start adapters translate framework requests only. This proves framework independence within the supported Node/Web Request baseline, not edge-runtime portability.
4. Separate staged packages keep browser and server authority physically distinct: `@framerfordevs/studio`, `@framerfordevs/studio-server`, `@framerfordevs/studio-store-redis`, `@framerfordevs/studio-adapter-express`, and `@framerfordevs/studio-adapter-tanstack-start`.

Existing M14 Studio registrations remain inert after migration. A user with exact project authority must explicitly activate one before it becomes redirect or OAuth-client authority. Registration changes and deactivation immediately invalidate that authority.

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

Users should expect acknowledgement at least once per new eight-hour local session and again after safe session loss caused by store outage, deployment, or registration drift. The screen presents ordinary continuation—not an error or alarm—while still naming the project, origin, and delegated authority accurately.

Before acknowledgement and code issuance, the platform must resolve the exact active registration and current user, require an active project with CMS enabled and current `project.read`, and preserve foreign/nonexistent non-enumeration. Registration metadata/version changes revoke prior consents. If Better Auth 1.7.1 cannot enforce the current-policy check, forced acknowledgement, version-bound consent invalidation, and fail-closed issuance without weakening the split-host boundary, M18A stops for a design amendment.

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

## Current implementation truth and gaps

The repository currently has:

- One versioned M14 Studio registration per exact project/environment with canonical `applicationOrigin` and non-root `mountPath`.
- Stable Control Plane GET/PUT operations, CLI commands, dashboard controls, receipts, actor attribution, and audit behavior for that inert metadata.
- Better Auth 1.7.1 with one fixed official CLI OAuth client, exact resources, JWT verification, refresh rotation, dashboard-hosted login/consent, and API-host protocol endpoints.
- A host-only dashboard session and exhaustive M17 host/auth/CSRF route matrices.
- A secure M13 loopback editor whose Node process owns hosted credentials while its browser receives only a local challenge.
- A private browser-safe `@framerfordevs/content-form` package and shared UI primitives.

The missing M18 authority is:

1. No registration activation lifecycle or deterministic Studio OAuth client.
2. No Studio-specific resource/scope/verifier or project-bound token claims.
3. No developer-owned BFF/session-store contract.
4. No configurable-path Studio artifact or framework adapters.
5. No authenticated, role-projected bootstrap operation.
6. No exact route, cookie, CSP, origin, traversal, expiry, revocation, or outage contract for the mounted Studio.

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
| Registration origin/path change   | Atomic client disable, token/consent revocation, registration-version mismatch, and forced local session eviction    |
| Browser token theft               | Tokens encrypted only in BFF store; opaque `HttpOnly` cookie; no browser API receives tokens                         |
| CSRF against BFF                  | Host/origin/Fetch Metadata checks, `SameSite=Lax`, JSON-only mutations, state, and no permissive CORS                |
| Host/proxy confusion              | Configured external origin is authority; adapters reject mismatched effective host/protocol and untrusted forwarding |
| Path traversal/route capture      | Canonical decoded path matching, no percent/backslash/dot ambiguity, finite asset manifest, closed methods           |
| XSS/clickjacking                  | No unsafe HTML, self-only CSP, `frame-ancestors 'none'`, `nosniff`, shared React escaping                            |
| Store replay/race                 | Digest-only opaque IDs, atomic consume/CAS, one refresh winner, bounded expiry, deletion on terminal auth failure    |
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
- Both user metadata invalidation and the management credential kill switch revoke current OAuth authority in the same transaction. M18A has no BFF session store; M18B must consume the changed registration version/status through its already-approved revoke-on-registration-change hook so no session can continue trusting an old origin or mount path.
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

It is receipt-idempotent and returns the bounded registration, effective runtime status, `replayed`, and `noOp`. Same command/same fingerprint replays; changed intent conflicts; stale version fails. Activation/deactivation, OAuth client/link changes, token revocation, audit, receipt, actor-union registration attribution, and registration version/status mutation are one database transaction. Supporting credential-attributed kill-switch receipts requires a post-0019 constraint-only migration that removes the obsolete user-only actor predicate from `control_plane_command_receipt_scope_result_valid`; migration 0019 remains immutable.

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
3. The attempt store contains state, verifier, registration/project/environment/version, issuer, resource, return path, creation/expiry, and one-use state. The browser receives only the opaque attempt cookie.
4. The BFF redirects to the API-host authorization endpoint with exact client, callback, state, S256 challenge, resource, scopes, and forced Studio acknowledgement. No arbitrary return URL is accepted.
5. Better Auth sends unauthenticated users to dashboard login through its signed continuation. Dashboard remains the only credential form/session host.
6. Before authorization completes, the platform verifies active registration and current project access and renders the dashboard-hosted Studio acknowledgement with resolved project/origin context. Every new local session requires Allow; Deny issues no code.
7. The provider redirects only to the exact BFF callback with code and state.
8. The BFF atomically consumes the attempt, compares state in constant time where applicable, and exchanges code + verifier server-to-server with redirects disabled and bounded time/body limits.
9. The BFF validates the token response, encrypts it into its shared restart-stable store under a new opaque session ID, clears the attempt cookie, sets the Studio session cookie, and redirects to the canonical mount root with no auth parameters.
10. Callback replay, state mismatch, expired attempt, provider error, malformed response, or registration drift clears transient state and renders bounded recovery without reflecting raw input.

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

A canonical trailing-slash redirect may be used only when required by deterministic asset behavior and must remain under the exact mount. Unknown paths/methods, encoded separators, dot segments, duplicate separators, backslashes, credential/query pollution, and oversized URLs fail closed. The handler never acts as an arbitrary platform proxy.

The Fetch core accepts a validated configuration and one standard `Request`, then always returns a standard `Response` for a request already matched to the mount. Adapters perform exact mount matching and delegate requests outside the mount to the host framework. They do not implement auth, cookies, CSP, path normalization, token refresh, platform calls, or policy.

The configured public application origin—not arbitrary `Host`, `Forwarded`, or `X-Forwarded-*` input—is canonical. An adapter may honor forwarding only through explicit framework/server trusted-proxy configuration and must compare the resulting external URL to the configured origin before entering the core.

## Browser shell and asset behavior

`@framerfordevs/studio` owns the React shell, TanStack Router base-path behavior, browser-safe DTOs, and shared UI composition. It owns no OAuth client, token, cookie parser, store, environment reader, platform bearer client, SQL, or Effect runtime.

The artifact is built once and served at any validated mount. The server renders only a bounded escaped mount/config meta projection; no token, user, content, arbitrary HTML, or executable inline configuration enters the document. Assets use a generated finite manifest, content hashes, exact MIME types, byte/count caps, and immutable cache headers. HTML/bootstrap/auth responses are `no-store`.

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
- Compare-and-swap replacement after token refresh.
- Delete one session.
- Atomic shared abuse-limit evaluation for authorization start, callback/token exchange admission, and authenticated session routes.
- Bounded cleanup by expiry and, where supported, registration identifier.
- Declared `scope: "shared" | "process_local"` and `survivesProcessRestart: boolean` capabilities. Production requires `shared` plus `true`; these fields describe application-process topology only and do not claim Redis AOF/RDB or disaster durability.

The core generates raw opaque IDs with at least 256 bits and stores only their SHA-256 digest. It encrypts authorization-attempt payloads—including state and PKCE verifier—and OAuth token records before calling the store using a configured versioned server keyring and authenticated encryption. Store implementations never receive plaintext state, verifier, access token, or refresh token. Current and previous decryption keys permit bounded rotation; only the current key encrypts.

Removing a previous key is an intentional forced-logout boundary for any record still encrypted by it. Operators must keep each retired decrypt key available for at least the maximum eight-hour session lifetime after the last process capable of writing with that key is drained; the ten-minute attempt lifetime is contained by that bound. Mixed-version fleets may not disagree about the current write key. Early removal must be surfaced as session invalidation, never corruption or a fallback to plaintext.

The encrypted record contains only exact registration/project/environment/version, OAuth token values/types/scopes/expiries, refresh generation/version, and safe timestamps. It contains no content, schema, labels, email, arbitrary request, or return URL.

### Refresh and concurrency

The core refreshes before a bounded expiry threshold. One compare-and-swap winner persists rotated OAuth tokens; losers reload the winner rather than issuing parallel refreshes. Refresh-token reuse remains zero. A terminal refresh or authorization failure deletes the record and cookie; transient upstream failure preserves an unexpired access token only when it is still valid and otherwise returns a bounded unavailable response.

The opaque browser session ID remains stable across ordinary OAuth refresh to avoid multi-tab invalidation races. It is always newly generated after callback/re-authentication, cannot be caller-selected, and is deleted on logout, absolute expiry, terminal auth failure, or detected registration drift. M18 has no privilege-elevation operation; current platform policy prevents a stable local session ID from preserving removed authority.

### Production enforcement and reference store

The server package has no implicit store. A separately exported test/development memory store reports `scope: "process_local"` and `survivesProcessRestart: false`. Startup rejects any store that is not shared and restart-stable when either:

- the configured origin is non-loopback and runtime mode is production, or
- production mode is selected explicitly.

M18B ships `@framerfordevs/studio-store-redis` as the production-capable reference adapter. It uses a caller-supplied Redis connection, namespaced digest-only keys, server-side TTLs, atomic Lua operations for consume/CAS/admission, bounded commands/replies/timeouts, TLS/auth-compatible client configuration, and no degraded-memory fallback. Session availability—not permanent business data durability—is its purpose; losing the store safely signs users out. Production guidance requires shared persistence across application instances and deploys and documents Redis persistence/HA as an operator availability choice.

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

The cookie name is deterministic per registration, bounded, and uses an appropriate secure prefix when browser prefix rules permit. Exact loopback HTTP uses a separate unprefixed name and omits `Secure`; this exception cannot activate for non-loopback hosts.

The authorization-attempt cookie has the same host/path isolation, at most 10-minute lifetime, and contains only an opaque attempt ID. Callback consumes and clears it.

Studio writes no auth value to `localStorage`, `sessionStorage`, IndexedDB, Cache Storage, service workers, route/search/hash state, HTML, React Query keys, or clipboard. Non-sensitive user preferences remain out of M18 unless separately justified.

### Origin and CSRF

- Browser API/logout mutations require exact configured origin, same-origin Fetch Metadata where supplied, and exact allowed content type/body.
- Login and callback are top-level GET protocol routes with state/PKCE protections and no mutation of project data.
- BFF routes emit no credentialed CORS policy; cross-origin browser requests are denied.
- Cookies are not authorization by themselves: the BFF resolves the store record and the platform reauthorizes current project scope.

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

Shell/auth/bootstrap responses set, as applicable:

- `Content-Security-Policy` with self-only scripts/styles/connect/images, `object-src 'none'`, `base-uri 'none'`, `frame-ancestors 'none'`, and bounded form/navigation destinations.
- `Referrer-Policy: no-referrer`.
- `X-Content-Type-Options: nosniff`.
- `Cross-Origin-Opener-Policy: same-origin` where compatible with OAuth navigation.
- `Cross-Origin-Resource-Policy: same-origin`.
- `Permissions-Policy` denying unused capabilities.
- `Cache-Control: no-store` for HTML, auth, errors, and bootstrap.
- Immutable public caching only for content-hashed finite assets.

The design must test the exact COOP behavior through OAuth popup/top-level navigation; top-level navigation is the required baseline and must not depend on opener communication.

## Effect and package architecture

### Platform

- `packages/api/src/contracts/studio/`: Studio token/bootstrap schemas and public Studio OpenAPI source.
- `packages/api/src/operations/studio/`: named current-user bootstrap and authorization workflows.
- `packages/api/src/services/studio/`: registration-bound principal verification and repository adapters.
- `packages/auth`: deterministic client/resource configuration, claims, and installed-provider compatibility boundary.
- `packages/db`: registration runtime state and immutable migration authority; existing OAuth tables remain Better Auth authority.
- `apps/server`: Studio v1 Express transport and exact API-host route profile.
- `packages/public-contracts`: deferred to M18B for Studio v1 registry and immutable compatibility baseline after the shipped BFF consumes the M18A contract. M18A still owns schema-backed OpenAPI source, deterministic generated-byte tests, and the test harness contract; it does not create a released-baseline entry.

Business workflows use named `Effect.fn`, typed expected errors, services/Layers, and the existing shared `ManagedRuntime`. Better Auth remains Promise-native at its protocol boundary and translates into typed application failures at the Studio adapter. No request-local runtime or raw third-party error reaches contracts.

### Developer-owned runtime packages

- `packages/studio`: browser-only SPA, router, safe contracts, UI composition, and built asset manifest.
- `packages/studio-server`: Fetch core, config decoder, OAuth client, token validation, session encryption/refresh, store contract/conformance suite, assets, and safe responses.
- `packages/studio-store-redis`: production-capable shared Redis store and limiter adapter over the server contract; it receives ciphertext/envelopes only.
- `packages/studio-adapter-express`: only Express Request/Response/next translation and trusted external URL projection.
- `packages/studio-adapter-tanstack-start`: only TanStack Start route integration around native Web Requests.

The server package never imports app source. Adapter packages depend on declared server exports. Browser bundle forbidden-import tests reject server/auth/env/Node/database/token/store modules. Packages are staged at `0.0.0` and remain unpublished until a separate developer gate.

## Configuration contract

The BFF receives one strictly decoded configuration:

- canonical platform API/OAuth issuer origin;
- registration, project, and environment IDs;
- canonical application origin and mount path matching registration;
- runtime mode;
- bounded timeout/body settings within package maxima;
- explicit shared, process-restart-stable session store;
- current and bounded previous session-encryption keys by non-secret key ID.

No package reads an ambient management/OAuth token. Server-only configuration never enters Vite/browser variables. The handler fails startup on mismatched IDs/origin/path, unknown fields, insecure non-loopback HTTP, weak/missing encryption material, missing store, process-local or restart-volatile production store, or unsupported adapter/runtime.

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

M18B additionally enforces shared per-registration authorization-start limits through the store contract before allocating attempts. A per-trusted-source BFF limit is enabled only where the hosting adapter has an independently configured and proven proxy boundary; otherwise the shared registration limit is the safe fallback. Exact local thresholds are fixed in the M18B confirmation after M18A evidence, not caller-tunable bypasses.

Domain audits are added for:

- `studio.registration.runtime.activated`
- `studio.registration.runtime.deactivated`
- `studio.session.established`

All contain actor, exact stable scope/registration ID, registration version, request ID, action, and time. The session-establishment event additionally uses the non-secret Studio grant ID as its resource identity so bootstrap can verify the marker. They exclude origin, mount path, client ID, code/token values, user email, cookies, BFF store IDs, encryption IDs, and request bodies. `studio.session.established` is a security-category event emitted once for a grant whose token response may be released, not for refresh, bootstrap retry, or a failed local store write. Under the synchronous fallback, an audit may exist even if transport delivery later fails; this bounded false-positive is preferable to releasing an unaudited grant.

Named spans cover activation/deactivation, authorization preflight, Studio-token verification, bootstrap, BFF authorization attempt, callback exchange, store lookup/CAS/delete, refresh, logout, asset/shell response, and adapter translation.

Safe attributes use closed operation/adapter/runtime/auth/outcome/status/size/duration buckets and stable scope IDs only where current telemetry rules permit. Metrics never label tenant, registration, user, origin, path, session, state, client, token, or error text. Logs never include raw URL query, callback code/state, Authorization, Set-Cookie, token response, ciphertext, content, or PII.

## Performance and reliability

- Shell assets are finite, content-hashed, bounded, and code-split; M18 has no content-list waterfall.
- Bootstrap performs one registration/project/environment/current-policy path without N+1 queries.
- Store calls and platform fetches have explicit timeouts, abort propagation, response byte limits, and no hidden retry.
- Refresh uses one atomic winner and never retries a rotated refresh token.
- OAuth/browser requests never follow unexpected redirects.
- Handler and adapters do not buffer unbounded request/response bodies.
- Browser shell has no duplicate React/UI copies and records raw/gzip package and route budgets before review.
- No service worker or offline authority is introduced.

## Database impact and migration gate

M18 is expected to require a developer-controlled migration named:

```text
add_studio_runtime_authority
```

The proposed Drizzle change adds:

- registration runtime status defaulting to `inactive` for every existing row;
- runtime change timestamp and exact user actor authority;
- constraints tying active state to required runtime actor/time fields;
- Control Plane command-receipt operation/result support for runtime set;
- indexes required by active registration/client verification.

OAuth client/resource/token/consent rows already exist from M12 and are used as companion authority; no general OAuth schema expansion or dynamic-registration table is added.

After approved implementation reaches the schema slice, the agent updates Drizzle schema/tests and stops. The developer generates the migration. The agent fully inspects SQL, snapshot, and journal; the developer applies it; only then may database integration continue. Existing migrations remain immutable.

## Test and evidence plan

### Pure/property/contracts

- Deterministic client IDs and exact callback composition.
- Canonical origin/mount matching, loopback exceptions, ports, IPv6, Unicode, byte bounds, traversal, encoded separators, duplicate separators, and route prefix confusion.
- Exact OAuth client metadata/resource/scope/grant matrix and dynamic-registration exclusions.
- Store opaque ID entropy/encoding/digest, encrypted attempt/token envelopes, key rotation and deliberate early-retirement logout, expiry, atomic consume/CAS/admission, and production shared/restart-stable topology guard.
- Cookie names/attributes/path matching for multiple registrations and non-root mounts.
- Bootstrap schema/action projection and standard envelope/error mapping.
- Studio OpenAPI deterministic exact bytes and forbidden control-plane/content/protocol surfaces; immutable public-contract registry/baseline registration waits for M18B consumption.

### Better Auth compatibility gate

Before broad implementation, prove pinned Better Auth 1.7.1 supports:

- deterministic database-managed public clients without enabling RFC 7591;
- API-host authorize/token with dashboard-hosted login continuation and host-only dashboard cookie;
- exact redirect, mandatory S256 PKCE, state, resource, scope, forced per-session Studio acknowledgement, short TTL, zero refresh reuse, and revocation;
- current project authorization before acknowledgement/code completion and version-bound consent invalidation;
- shared authorization/token rate-limit hooks and preferred atomic or approved synchronous-gated `studio.session.established` audit ordering;
- registration/version claims or an equally strict verifier binding;
- disabled-client and revoked-token behavior for pending code, access, and refresh paths;
- loopback callback behavior without weakening production HTTPS.

Failure of deterministic client resolution, exact redirect/resource/scope, mandatory PKCE/state, pre-issuance current policy, consent/version invalidation, or token binding stops M18A for amendment. Lack of a shared provider transaction for audit does not stop M18A if—and only if—the synchronous response-gating, no-token-release, bootstrap-marker, and compensating-revocation fallback passes. If neither audit path is enforceable, implementation stops. No custom handoff or parent-domain cookie is an automatic fallback.

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
- User-only activation; management/Delivery/Preview credential denial.
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

- Shared conformance suite runs against the memory test store and the shipped Redis reference adapter, including real Redis atomicity/outage/recovery integration.
- Production startup cannot use a missing, implicit, process-local, or restart-volatile store; the Redis adapter has no memory degradation path.
- Direct frameworkless Fetch-core conformance plus Express and TanStack Start parity for every owned route, status, header, cookie, body, error, cancellation, streaming/byte bound, outside-mount delegation, and trusted external URL decision.
- Static import/runtime checks substantiate only Node/Web Request framework independence; no evidence or documentation claims edge/unknown-runtime portability.
- Reverse-proxy hostile forwarded-host/protocol cases fail closed.
- Package import/exports prevent browser-to-server dependency leakage.

### M18A dashboard acknowledgement browser/accessibility

The private OAuth harness drives committed headless, retry-free dashboard specifications for Allow, Deny, unauthenticated login continuation, live dashboard session, registration drift, and callback cleanup. Component and browser coverage require keyboard order/activation, initial and failure focus, status/error announcements, explicit project/origin labelling, 375 px and 200% reflow, and automated WCAG A/AA checks. Routine re-entry after expiry, store loss, deploy record loss, or registration recovery uses neutral continuation copy—not error or security-warning language—while still explaining the delegation accurately.

### M18B Studio browser/accessibility

Committed headless, retry-free specifications cover:

- Direct configured-path load, nested path, sign-in redirect/explicit Studio acknowledgement/callback cleanup, refresh, local-only logout, expiry, revocation, and recovery.
- A live dashboard cookie never bypasses the next Studio acknowledgement after local logout.
- Cookie host/path isolation, absent browser token/storage authority, no callback secret in history, and no cross-origin request.
- Inactive/changed registration, unauthorized role, archive, platform/store/customer-app outage states.
- Keyboard/focus/landmarks/status, sign-in and recovery links, 375 px and 200% reflow through component/accessibility coverage, and automated WCAG A/AA checks.

Browser tests do not retain cookies/tokens or capture screenshots/traces/video. Interactive review remains separately developer-authorized.

### Package/build/readiness

- Clean fixture installs staged packages and mounts both adapters at non-default nested paths.
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
7. **M18A evidence and review:** run complete applicable gates, update KB, provide one Conventional Commit proposal, and stop for developer review. M18B remains unauthorized.

### M18B — Studio mount and security runtime

After M18A is accepted, revalidate and obtain developer approval for the M18B runtime details before implementation:

1. Revalidate the M18A bootstrap shape through the real BFF, then register the Studio v1 canonical artifact and immutable compatibility baseline; create staged browser/server/Redis-store/adapter workspaces and forbidden-import/build tests without content features.
2. Implement exact mount/assets, OAuth flow, encrypted attempt/session contract, production Redis adapter, cookies, refresh/local logout, headers, local abuse controls, and failures.
3. Complete direct Fetch conformance, Express/TanStack parity, and the accessible authenticated empty shell.
4. Run complete applicable evidence, update KB, provide a separate Conventional Commit proposal, and stop for developer review. M19 remains unauthorized until M18B acceptance.

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

Exact registration identity, deterministic OAuth clients, PKCE/state, optimistic/idempotent activation, registration-version binding, current policy, and atomic store refresh prevent ambiguous or stale authority.

### Security

No dynamic registration, client secret, browser token, wildcard origin, parent cookie, arbitrary proxy, or retroactive registration trust is introduced. Revocation and current authorization are server-side and exact.

### Reliability

Durable BFF sessions, CAS refresh, bounded failures, no browser fallback, and independent dashboard recovery make outages and redeploy behavior explicit.

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

## Approved M18A scope

The developer approved the M18A/M18B roadmap split and authorized **M18A implementation only** under this design:

1. Explicit inactive/active Studio registration runtime state and user-only activation.
2. One deterministic registration-derived public OAuth client with Authorization Code + S256 PKCE, `studio:session`, current server-side pre-authorization, forced per-session Studio acknowledgement, shared abuse controls, and no general dynamic registration.
3. Fail-closed `studio.session.established` security audit using preferred transaction atomicity or the approved synchronous response-gating/bootstrap-marker fallback.
4. A private test-only public OAuth client that proves authorize through bootstrap and cannot enter shipped dependency graphs or artifacts.
5. Studio v1 bootstrap and deterministic OpenAPI source only; immutable `packages/public-contracts` baseline registration, BFF packages, mounted shell, and M19 content/editorial operations wait for M18B.
6. The explicit pre-M23 installation-wide OAuth safety-valve tradeoff and developer-controlled `add_studio_runtime_authority` migration gate.

M18B remains a separate later approval gate. Its bounded direction is BFF-only encrypted OAuth token storage, opaque path-scoped browser sessions, a shipped production Redis adapter with no memory fallback, direct Fetch conformance, Express 5/TanStack Start adapters, and the empty authenticated shell. Approval here does not authorize M18B implementation.
