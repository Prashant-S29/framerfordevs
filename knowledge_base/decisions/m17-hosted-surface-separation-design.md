# Milestone 17 hosted surface separation design

**Status:** Developer-approved for implementation on 2026-09-20 under every documented gate

**Date:** 2026-09-20

## Decision summary

Milestone 17 separates the public website, developer documentation, and resilient hosted control plane without introducing a second backend authority or sharing browser session authority across subdomains.

The proposed design uses:

- A new minimal `apps/marketing` application for `framerfordevs.com`.
- The existing `apps/developers` application unchanged in architectural role and repointed to `developer.framerfordevs.com`.
- A physical/package rename from `apps/web` to `apps/dashboard`, preserving its route tree except for the old marketing landing page, and targeting `dashboard.framerfordevs.com`.
- Dashboard-hosted credential forms, invitation acceptance, OAuth device approval, and a host-only dashboard session cookie.
- Validated marketing entry routes that redirect to dashboard authentication without accepting credentials, creating sessions, or proxying dashboard responses.
- Canonical invitation and OAuth verification links that point directly to the dashboard; marketing aliases are optional convenience routes, not availability dependencies.
- Same-origin dashboard ingress for `/api/auth/**`, `/api/control-plane/v1/**`, and the remaining temporary `/rpc/**` routes, all backed by the existing server and shared operations.
- The existing Control Plane v1 resource paths and representations on the dashboard host with Better Auth session adaptation, while the API-host form remains strictly bearer-only and cookie-independent.
- Exact host/path profiles enforced before route handling: dashboard session/RPC routes are absent on the public API host, and public API routes are absent on marketing and documentation hosts.
- Independent public-app builds, health boundaries, canonical navigation, and safe failure behavior.

This milestone changes deployment/application boundaries, browser transport, authentication placement, and hosted client adaptation. It does not change business authority, public Control Plane bearer contracts, product roles, content behavior, the public SDK boundary, or production rollout state.

## Developer decisions fixed before this proposal

### Application-to-host mapping

The developer selected three separate applications:

```text
apps/marketing   -> framerfordevs.com
apps/developers  -> developer.framerfordevs.com
apps/dashboard   -> dashboard.framerfordevs.com
```

`apps/dashboard` is the renamed existing `apps/web`. `apps/developers` remains documentation-only. The extra small marketing application is intentional: it gives marketing and documentation independent release cycles and follows the repository's plain-noun app naming convention.

The product-surface authority in `knowledge_base/product.md` has been updated to reflect this split before design approval.

### Authentication placement

The developer selected dashboard-hosted sign-in:

- Marketing owns authentication entry links only.
- Dashboard owns credential forms, session state, invitation acceptance, and OAuth device approval.
- The platform session cookie is host-only to `dashboard.framerfordevs.com` and is never shared with `.framerfordevs.com`.
- Root-hosted credential forms, parent-domain cookies, and a new handoff-token protocol are rejected.

### Backend browser transport

The developer selected same-origin dashboard ingress rather than direct cross-origin browser calls or a TanStack application BFF. Dashboard backend paths proxy directly to the existing Express server; no business logic runs in an ingress layer.

### Canonical sensitive links

The developer selected direct dashboard URLs for generated invitation links and OAuth `verification_uri`. Marketing may expose validated convenience aliases, but neither invitation acceptance nor CLI approval depends on marketing availability.

### Hosted contract convergence

The developer selected a session adapter on the existing Control Plane v1 resource paths:

- On `api.framerfordevs.com`, Control Plane v1 remains bearer-only, originless, cookie-independent, and described by the existing public OpenAPI contract.
- On `dashboard.framerfordevs.com`, the same data paths, schemas, envelopes, and shared operations accept only the current Better Auth session and apply browser CSRF/origin protections.
- Temporary content/editorial dashboard workflows may continue using session oRPC until M19–M21 establish Studio parity.

## Authority and prior decisions

This design consumes and preserves:

- M3 Better Auth identity/session ownership, application-owned authorization, default deny, host-safe invitation fragments, and server-side policy.
- M12's separate static documentation artifact, public contract allowlist, OAuth device flow, and protocol-native Better Auth responses.
- M13's prohibition on browser-held management/refresh/bearer authority and its temporary hosted editorial routes.
- M14–M16 Control Plane v1, exact bearer authority, shared domain operations, complete HTTP/CLI parity, hosted session adapters, operational recovery, and `sdkSupported: false`.
- The public HTTP/CLI/SDK boundary: administration remains HTTP + CLI + hosted UI and never enters the public content/runtime SDK.
- Existing authenticated SSR requirements: route guards and backend queries must receive the same request-local session authority.

M17 supersedes only the prior combined marketing/documentation surface description and the current combined public/dashboard application placement. It does not supersede public API family semantics or the accepted content/editorial authority model.

## Current implementation truth and gaps

The committed repository currently has:

- `apps/web`, a TanStack Start application containing the public landing page, `/login`, `/device`, invitation acceptance, the complete dashboard, and temporary editorial UI.
- `apps/developers`, an independently built, prerendered Fumadocs/TanStack Start portal with no database, Better Auth, or dashboard dependency.
- One Express server that mounts Better Auth, session oRPC, Control Plane, Authoring, Tooling, Preview, and Delivery.
- One exact management CORS origin configured through `CORS_ORIGIN`.
- A browser/backend URL split using `VITE_SERVER_URL` and an internal SSR-only `INTERNAL_SERVER_URL`.
- Request-aware session route guards and SSR oRPC cookie forwarding.
- Production cookie defaults currently set to `SameSite=None`, which is broader than the approved dashboard-only same-origin topology requires.
- No committed production ingress configuration or application-level host/path profile.
- No marketing workspace and no `apps/dashboard` workspace.

The gaps are:

1. Marketing, authentication UI, and resilient administration share one application artifact and release lifecycle.
2. The documentation host does not match the newly approved product surface.
3. Browser session routes and internal dashboard oRPC are routable through the same unclassified server surface as public APIs.
4. The current URL/cookie arrangement does not prove a host-only dashboard session under production subdomains.
5. Hosted M14–M16 administration still consumes dashboard oRPC shapes rather than canonical Control Plane resource representations.
6. Route ownership, canonical links, host allowlists, wrong-host failures, and independent outage behavior are not explicit executable contracts.
7. The server derives its listening port from `BETTER_AUTH_URL`, coupling network binding to public auth identity.

## Goals

M17 must deliver one coherent outcome:

1. Marketing, developer documentation, and dashboard are independently buildable and deployable applications with no app-to-app source imports.
2. Dashboard authentication and recovery remain directly reachable when marketing, documentation, or a customer Studio is unavailable.
3. A browser session is scoped only to the dashboard host and never reaches marketing, documentation, or the public API host.
4. Hosted control-plane administration uses canonical Control Plane v1 schemas and operations without putting OAuth or management bearer credentials in React.
5. Public API-host contracts retain their current bearer/CORS/cache semantics.
6. Every externally reachable host has an explicit route allowlist, navigation model, canonical URL policy, and bounded failure behavior.
7. Existing temporary editorial UI remains usable until later Studio milestones prove parity.

## Non-goals

M17 does not add:

- Studio assets, adapters, session handoff, content routes, or configured-path mounting; M18 owns those.
- Migration of content/editorial, Presentation, Preview, or publication workflows into Studio; M19–M21 own that work.
- Parent-domain cookies, SSO across arbitrary subdomains, third-party OAuth clients, social login, password-reset email delivery, or a new auth handoff protocol.
- New account, workspace, project, policy, credential, webhook, audit, or recovery business operations.
- Public Control Plane cookie authentication on `api.framerfordevs.com`.
- A Control Plane SDK, secret administration in the SDK, or browser-held CLI/management authority.
- Full production ingress rollout, DNS changes, certificate provisioning, operator-network isolation, multi-instance capacity, or DDoS/noisy-neighbor proof; M23 owns production topology hardening.
- Removal of dashboard editorial routes before Studio parity.
- Database schema changes or migrations.
- Package publication, OAuth production activation, deployment, or production configuration changes.

## Surface classification

| Capability                           | Canonical HTTP                                            | Noninteractive CLI          | Hosted UI                                                 | Studio              | Public SDK                                     |
| ------------------------------------ | --------------------------------------------------------- | --------------------------- | --------------------------------------------------------- | ------------------- | ---------------------------------------------- |
| Marketing and auth entry             | Public web routes                                         | Not applicable              | Marketing app                                             | Excluded            | Excluded                                       |
| Developer documentation              | Public static routes/artifacts                            | Existing docs only          | Developer app                                             | Excluded            | Existing documented runtime packages only      |
| Account/control-plane administration | Existing Control Plane v1 bearer API                      | Existing complete parity    | Same Control Plane schemas with dashboard session adapter | Excluded            | Excluded                                       |
| Temporary content/editorial UI       | Existing Authoring/public families where already approved | Existing parity             | Existing session oRPC retained temporarily                | Deferred to M19–M21 | Existing approved content/runtime methods only |
| Session authentication               | Better Auth native protocol                               | OAuth device/token protocol | Dashboard only                                            | Deferred            | Excluded                                       |

The dashboard session profile is application infrastructure, not an additional public integration contract. The public OpenAPI document continues to describe only API-host bearer authority.

## Application and workspace ownership

### `apps/marketing`

The new application owns:

- Product landing and marketing content.
- Public navigation to developer documentation and dashboard sign-in.
- `/login` as a validated redirect entry.
- Optional `/device` and `/invitations/accept` convenience aliases.
- Marketing-only metadata, sitemap/robots/canonical tags, security headers, error and not-found pages.

It owns no:

- Better Auth client or server package.
- Session hook, cookie, credential form, account state, oRPC client, Control Plane client, database import, API bearer, or secret.
- Proxy to dashboard or public APIs.
- Runtime dependency on dashboard, developer docs, Express, or private API packages.

It should use the existing React/TanStack/Vite/UI stack and package-owned tasks. No new external runtime dependency is expected.

### `apps/developers`

The developer portal remains the existing docs-only application:

- Existing MDX, Fumadocs, search, prerender, canonical artifact, and forbidden-surface architecture remains.
- Its deployment/canonical origin changes to `developer.framerfordevs.com`.
- Navigation may link to the marketing root and dashboard sign-in through configured absolute origins.
- It does not gain authentication, account state, marketing pages, or dashboard imports.

### `apps/dashboard`

`apps/web` is renamed to `apps/dashboard` with package identity `dashboard`:

- Existing protected route IDs/URLs remain unless this design explicitly changes them.
- `/dashboard`, project routes, collection/editorial routes, operations, webhooks, invitation acceptance, device approval, and login remain.
- The old public marketing landing component is removed.
- `/` becomes a bounded dashboard-owned redirect: authenticated users go to `/dashboard`; anonymous users go to `/login`.
- Header/product navigation uses absolute configured links for marketing/docs and internal router links for dashboard resources.
- Dashboard pages and auth routes are `noindex`; dashboard robots deny crawling.

Root scripts, package filters, Docker paths, structure checks, tests, and generated route ownership are updated from `web`/`apps/web` to `dashboard`/`apps/dashboard`. Supported public package exports are unaffected.

## Host and route ownership

### Canonical host matrix

| Host/profile                      | Allowed application routes                                                                                | Allowed backend routes                                                                     | Explicitly absent                                                                                         |
| --------------------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| `framerfordevs.com`               | Marketing pages, `/login`, optional `/device`, optional `/invitations/accept`, bounded external redirects | None                                                                                       | `/rpc`, Better Auth handlers, Control Plane, public APIs, management reference, health/operator endpoints |
| `developer.framerfordevs.com`     | Existing docs, search, API references, `/specs/**`                                                        | Developer-app `/api/search` only                                                           | Session/auth, RPC, dashboard UI, private management reference                                             |
| `dashboard.framerfordevs.com`     | Dashboard/auth/recovery/editorial routes and assets                                                       | Browser Better Auth subset, session Control Plane v1 data routes, temporary session `/rpc` | Public API references, originless bearer families, operator health/readiness                              |
| `api.framerfordevs.com`           | Public protocol docs/artifacts where currently approved                                                   | Delivery, Preview, Tooling, Authoring, bearer Control Plane, exact machine OAuth endpoints | Dashboard HTML/assets, session RPC, browser sign-in/up/session/device-approval routes                     |
| Internal operator/service profile | None public                                                                                               | Health/readiness and disabled-by-production management diagnostics                         | All public browser navigation                                                                             |

A route existing in the Express process does not make it available on every host. Host profile is evaluated before authentication, CORS, body parsing, or route business work.

### Server host classifier

The server gains one pure, closed host/path/method classifier with tests. It must:

- Canonicalize configured origins at startup and fail closed on invalid, duplicate, insecure production, credential-bearing, path-bearing, query-bearing, or fragment-bearing values.
- Accept production HTTPS hosts and explicit local development origins only.
- Reject missing, duplicate, malformed, or unknown authority before route handling.
- Trust forwarded host/protocol only through the exact configured proxy-hop boundary; deployment ingress must replace rather than append untrusted forwarded headers.
- Return a generic non-enumerating wrong-host response with no CORS credentials, route detail, redirect, or stack trace.
- Use closed telemetry labels such as `marketing`, `developers`, `dashboard`, `public_api`, `operator`, and `unknown`; raw host values never become metric labels.

M17 implements application-level defense in depth. M23 still owns production ingress/network proof.

## Authentication and session boundary

### Single identity authority

There remains one Better Auth configuration, user/session store, and identity authority. M17 does not create a second auth database, copy sessions, or mint a custom handoff token.

The canonical OAuth issuer/protocol base remains on the public API host. Browser-facing URLs generated by configuration—login, device verification, and any approved consent route—use the dashboard origin explicitly.

A compatibility slice must prove the installed Better Auth 1.7.1 behavior under split route hosts before broad implementation. If one instance cannot safely preserve the fixed issuer while setting a host-only cookie from dashboard-hosted session endpoints, implementation stops for a design amendment. Cross-subdomain cookies or dynamic unbounded hosts are not fallback options.

### Dashboard cookie

The production session cookie must be:

```text
Secure
HttpOnly
SameSite=Lax
Path=/
Domain attribute absent
```

Consequences:

- The browser sends it only to `dashboard.framerfordevs.com`.
- Marketing, developer docs, and `api.framerfordevs.com` never receive it.
- No auth token is placed in local/session storage, URLs, query caches, or browser-readable cookies.
- Session lifetime/update-age and database revocation behavior remain unchanged unless separately approved.
- Production tests inspect `Set-Cookie` and prove no parent-domain attribute.

### Better Auth route profiles

The dashboard host allows only the browser/session endpoints required by current behavior, including:

- Email sign-up and sign-in.
- Sign-out and current-session reads.
- OAuth device request inspection, approve, and deny.
- Any exact protocol callback route demonstrably required by the installed approved configuration.

The API host allows only the originless machine endpoints required by the official CLI, initially:

- Device-code issuance.
- OAuth token/refresh exchange.
- Exact metadata/JWK endpoints only if current client/verifier evidence requires them.

The implementation records the exact installed endpoint inventory. Wildcard exposure of all Better Auth paths on both hosts is prohibited.

API-host machine endpoints reject browser `Origin`, ignore/reject cookies, and never create a dashboard session. Dashboard browser mutations require the exact dashboard origin and Better Auth's CSRF/Fetch Metadata protections. Security checks are never disabled.

### Direct recovery URLs

The following canonical links point directly to dashboard:

- `https://dashboard.framerfordevs.com/login`
- `https://dashboard.framerfordevs.com/device`
- `https://dashboard.framerfordevs.com/invitations/accept#token=...`

The official CLI's `verification_uri` and generated invitation links use those URLs. Therefore marketing availability is not required to sign in, approve a CLI device, inspect an invitation, accept an invitation, or recover a project.

## Marketing authentication-entry redirects

### `/login`

`GET https://framerfordevs.com/login` is a redirect entry, not a form.

It accepts at most one optional `next` value. The parser:

- Accepts only a UTF-8 dashboard-relative absolute path beginning with one `/`.
- Rejects absolute/scheme-relative URLs, backslashes, credentials, control characters, fragments, malformed encoding, duplicate parameters, unknown parameters, and values over 2,048 bytes.
- Rejects loops or backend targets such as `/login`, `/api/**`, and `/rpc/**`.
- Preserves a validated path and query only.
- Does not echo an invalid value in HTML, telemetry, or an error.

A valid request redirects to dashboard `/login?returnTo=<encoded-path>`. An absent value defaults to `/dashboard`. Invalid input renders a bounded non-cacheable 400 page rather than redirecting.

The dashboard's existing `returnTo` parser is aligned to the same kernel and remains authoritative before the post-authentication navigation.

### `/device`

The marketing alias accepts only the existing bounded normalized `user_code` query. A valid value redirects to dashboard `/device?user_code=...`; no value redirects to dashboard `/device` for manual entry. Duplicate, unknown, malformed, or oversized query input returns a safe 400 page.

The official CLI does not depend on this alias; its canonical verification URI is the dashboard route.

### `/invitations/accept`

Canonical invitations already point directly to dashboard. The optional marketing alias exists only for manually constructed/legacy entry:

- The HTTP request receives no token because the token remains in the fragment.
- A minimal client component reads exactly the current 43-character base64url fragment profile.
- A valid token uses `window.location.replace` to the dashboard acceptance URL with the same fragment.
- Invalid/missing fragments render generic guidance without network submission.
- The page is `no-store`, `noindex`, no-referrer, analytics-free, and governed by a self-only CSP.

No server log, Referer header, redirect query, or telemetry event contains the invitation token.

## Dashboard Control Plane session adaptation

### Same resources, different host authentication

Dashboard React calls `/api/control-plane/v1/**` on its own origin. The session adapter:

1. Classifies the request under the dashboard host profile.
2. Rejects `Authorization` and any conflicting credential input.
3. Resolves the Better Auth session from the host-only cookie.
4. Adapts the authenticated user to the existing `ProjectActor`/user principal.
5. Invokes the same Control Plane contracts, decoders, Effect operations, repositories, policy, transactions, audits, cursors, errors, bounds, and response envelopes as the bearer adapter.
6. Omits OAuth-grant checks because a hosted session is not an OAuth CLI token, while preserving every current membership/role/locale/project/environment authorization check.

The API-host adapter continues to:

- Require exactly one allowed bearer authority.
- Reject/ignore cookies as currently specified.
- Reject browser origins/preflights.
- Enforce OAuth grants or exact management-credential scopes.

No route handler reimplements business policy.

### Browser mutation protections

Dashboard-host session mutations require:

- Exact dashboard Host and Origin.
- Same-origin Fetch Metadata where supplied.
- JSON content type for JSON mutations, preventing simple-form submission.
- Existing request/body/query bounds and excess-property rejection.
- `Cache-Control: no-store` on every data response.
- No redirects from API routes.

Originless browser mutation requests are rejected unless the installed Better Auth-native endpoint requires and independently secures a protocol exception. Control Plane session mutations have no such exception.

### Hosted migration scope

M17 migrates hosted M14–M16 administration to the session Control Plane adapter:

- Workspace/project bootstrap, update, archive, restore, capability, and Studio registration.
- Governance, members, invitations, and locales.
- Credentials, webhooks, mappings, deliveries, replay, audits, and archived recovery.

The UI keeps existing behavior and uses hierarchical TanStack Query keys over canonical DTOs. One-time secret values remain component-local/cache-ineligible.

Temporary content/editorial routes—collection/form reads, entries, Presentation, Preview, and publication—may remain on session oRPC. They are not recreated in Control Plane and are retired only after M19–M21 parity. Existing retired schema-structure mutations remain absent.

### Public contract status

The dashboard session profile does not change the canonical Control Plane OpenAPI security scheme or add cookie auth to the public API artifact. Tests prove:

- API-host artifact and bearer behavior remain compatible.
- Dashboard host uses identical request/response schemas.
- Dashboard-only session behavior is absent from SDK exports and public integration examples.

## CORS, origin, and CSRF policy

- Marketing and developer docs make no credentialed request to platform backend routes.
- Production dashboard backend traffic is same-origin; CORS headers are unnecessary there.
- Local development may allow one exact configured dashboard origin and credentials; all other origins are rejected with 403 before route handling.
- Better Auth `trustedOrigins` contains the exact dashboard origin only. It uses no wildcard and contains no production localhost value.
- Marketing and developer origins are not Better Auth trusted origins.
- Dashboard Control Plane and RPC reject cross-origin mutation and credentialed preflight.
- Delivery and Preview retain their approved wildcard, non-credentialed read CORS profiles.
- Tooling, Authoring, and API-host Control Plane remain originless and reject browser Origin/preflight.
- Machine OAuth device/token endpoints are originless; dashboard device approval is same-origin and session-backed.

CORS remains browser policy, not authorization. Every protected operation continues server-side authorization.

## Navigation, metadata, and canonical links

### Marketing

- Brand/home links remain on `framerfordevs.com`.
- Documentation links use `https://developer.framerfordevs.com`.
- Sign-in/open-dashboard links use the dashboard origin directly or the local `/login` entry when campaign attribution is intentionally unnecessary.
- Marketing pages use self canonical URLs, public sitemap/robots, and indexable metadata.

### Developer docs

- Documentation canonical URLs use `developer.framerfordevs.com`.
- Brand links return to marketing.
- Dashboard links are explicit external-origin links.
- Existing public-only search and contract artifact rules remain.
- No duplicate docs are served from marketing.

### Dashboard

- Internal resource navigation remains router-owned and relative.
- Product/marketing and documentation links are configured absolute origins.
- Auth, account, project, operations, and editorial pages are `noindex, nofollow` and omitted from public sitemaps.
- Sign-out clears the dashboard session and returns to dashboard login or the marketing root through an explicit non-sensitive navigation; it never assumes marketing for recovery.

### Redirect compatibility

The product is pre-release, so M17 does not preserve the old combined `apps/web` public landing as a compatibility application. Reasonable convenience paths may redirect:

- Dashboard `/` -> `/dashboard` or `/login` based on session.
- Marketing `/docs/**` -> the equivalent developer-docs URL when the target can be mapped safely.
- Marketing `/dashboard` -> dashboard `/dashboard`.

No wildcard redirect forwards arbitrary paths or query strings across hosts.

## Failure and availability behavior

### Marketing unavailable

Dashboard direct login, invitation acceptance, device approval, administration, and recovery remain reachable. Developer docs remain reachable. Generated sensitive links do not depend on marketing.

### Developer docs unavailable

Marketing and dashboard remain functional. Dashboard UI does not fetch docs at runtime. Documentation links fail independently without affecting sessions or administration.

### Dashboard unavailable

Marketing and docs remain available and do not proxy or render stale account state. Marketing sign-in links fail at the dashboard destination with ordinary browser/network behavior; marketing may show a static support/status link but cannot claim authentication succeeded.

### Public API hostname unavailable

Dashboard browser administration continues through dashboard-host ingress as long as the shared server authority and dashboard ingress are healthy. CLI/public integrations may be unavailable. M17 does not claim process-level isolation if both hosts route to the same failed server process; M23 owns topology/SLO isolation.

### Customer application or Studio unavailable

Dashboard remains the bootstrap, credential, webhook, audit, archive, and recovery surface. No dashboard asset or request depends on the registered customer origin.

### Shared backend/database unavailable

Public shells render bounded unavailable states; protected operations fail safely with existing typed/service errors. No app falls back to cached authority or another host's cookie.

## Configuration and deployment contract

Configuration remains package-owned and explicit. Proposed responsibilities include:

### Server

- Explicit listen `PORT`, no longer derived from public auth URL.
- Canonical public API/OAuth origin.
- Canonical dashboard origin.
- Exact local-development dashboard origin where applicable.
- Trusted proxy hop/network configuration.
- Existing internal service URLs and security secrets.

`CORS_ORIGIN` is removed in the same implementation change that moves its final Better Auth, Express, test, example, Compose, and package-environment consumer to the exact dashboard-origin configuration. That change is complete only when repository search finds no live source, test, manifest, example, or deployment reference to `CORS_ORIGIN`, focused environment/server/auth tests pass under the replacement, and the old key is absent from every active runtime contract before final readiness. It cannot remain as an alias, fallback, deprecated input, or post-milestone cleanup item. Environment schema tests reject path/query/fragment/credential-bearing origins and insecure production HTTP.

### Dashboard

- Public dashboard origin.
- Browser same-origin server base.
- Internal SSR service-discovery URL.
- Public marketing and developer-docs origins for navigation.

### Marketing

- Public dashboard origin for validated entry redirects.
- Public developer-docs origin for navigation.

### Developers

- Public marketing and dashboard origins for navigation only.

No root `.env` is introduced. Build-time public values and server-only values remain distinct and declared in Turborepo task inputs/env where required.

### Deployment gate

Implementation may add source-controlled local/container/reference routing needed to prove the design, but it does not change production DNS, certificates, ingress, environment values, OAuth rollout, or active deployments. The developer controls those actions.

## Effect, package, and dependency boundaries

- Existing business operations remain named Effect workflows behind services/Layers and the shared server `ManagedRuntime`.
- Host/path classification, redirect parsing, and route-profile decisions are pure kernels.
- Express owns host/path/CORS/session/bearer transport adaptation only.
- TanStack applications own routing, SSR, navigation, and UI only.
- No request-local Effect runtime is introduced.
- No app imports another app's source.
- Cross-workspace UI use goes through `@framerfordevs/ui` exports.
- The dashboard may consume explicitly exported browser-safe Control Plane schemas; it does not import server repositories or CLI clients.
- The public SDK remains unchanged and contains no control-plane/session/secret administration.
- No new external dependency is expected. Any discovered need requires package/provenance/bundle review and developer approval.

Proposed ownership:

```text
apps/marketing                         public landing and auth-entry redirects
apps/developers                        docs/search/public artifact portal
apps/dashboard                         session UI and browser Control Plane client
apps/server                            host profiles, auth/RPC/API transport adapters
packages/auth                          Better Auth issuer, trusted origins, cookie policy
packages/env                           host/origin/listen configuration schemas
packages/api/contracts/control-plane   canonical request/response authority
packages/api/operations/control-plane  shared user/credential business workflows
packages/ui                            shared presentation primitives only
tools/browser-tests                    cross-host browser regressions
```

## Database and migration impact

M17 requires no Drizzle schema change and no migration.

Existing Better Auth sessions, users, OAuth clients/resources, workspace/project authority, command receipts, audits, and content remain unchanged. If implementation evidence unexpectedly requires persisted handoff, host, or session state, work stops for a design amendment and the developer-controlled migration process; it cannot be added opportunistically.

## Security and threat model

| Threat/failure                                           | Control                                                                                                |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Marketing/docs compromise receives session               | Host-only dashboard cookie; no parent domain; no auth/backend routes on those hosts                    |
| Wrong-host route exposure                                | Closed host/path/method classifier before auth/body work; generic denial                               |
| Public API cookie authenticates dashboard operation      | API-host Control Plane remains bearer-only and rejects/ignores cookies                                 |
| Dashboard React receives CLI/management bearer           | Session adapter rejects Authorization; no token bridge or SDK admin client                             |
| CSRF against session Control Plane                       | Same-origin Host/Origin/Fetch Metadata, JSON-only mutations, Lax cookie, server authorization          |
| Open redirect through marketing login                    | Bounded dashboard-relative path parser, closed parameters, loop/backend rejection                      |
| Invitation token leaks in redirects/logs                 | Canonical direct dashboard fragment; optional alias validates client-side and never queries/logs token |
| OAuth device approval phishing                           | Canonical dashboard verification URI, matching code display, authenticated explicit approve/deny       |
| Host/X-Forwarded-Host spoofing                           | Exact trusted proxy boundary, canonical configured origins, ingress replacement of forwarded headers   |
| Marketing/docs outage blocks recovery                    | Direct dashboard canonical links and independent application artifacts                                 |
| Dashboard outage leaks stale authority through marketing | Marketing has no account/session/API proxy or cached account state                                     |
| Duplicate business authority                             | Both bearer and session adapters invoke identical operations/repositories/policy                       |
| Public SDK grows administration methods                  | `sdkSupported: false`, export/bundle/docs forbidden-surface tests                                      |
| Temporary editorial UI removed early                     | Explicit retained oRPC allowlist until M19–M21 parity                                                  |
| Raw host/redirect/token enters telemetry                 | Closed profile/outcome labels; no raw authority/query/fragment/cookie/header logging                   |

## Observability

Named transport spans cover:

- Host-profile classification.
- Marketing auth-entry redirect validation and outcome.
- Dashboard session authentication.
- Dashboard Control Plane adaptation.
- API bearer adaptation.
- Wrong-host/origin rejection.

Safe attributes are closed host profile, route family, auth kind (`session | oauth | management_credential | none`), method class, redirect outcome, status family, and duration. Raw Host/Origin/Referer, cookies, authorization, `next`/`returnTo`, invitation fragments, user codes, request bodies, and destination URLs are excluded.

Metrics use only bounded profile/family/auth/outcome/status labels. Existing business audits remain authoritative; marketing redirects and ordinary session reads do not create domain audit events.

## Performance and reliability expectations

- Marketing and docs pages have no database/auth/server dependency on their normal render path.
- Dashboard adds no application BFF hop; ingress routes directly to the existing server.
- Session Control Plane adaptation reuses existing bounded queries, cursors, quotas, and response limits.
- Dashboard SSR uses the internal service URL and forwards request-local cookie authority exactly once.
- Host classification and redirect validation are bounded linear work over capped strings.
- Renaming/splitting apps must not duplicate React, UI, API domain, or business runtime bundles across one application artifact.
- Build and health checks exercise representative owned dependencies: marketing landing, docs route/search artifact, dashboard login/session dependency, server readiness.

Implementation records before/after route and bundle inventories; M17 does not invent a production SLO.

## Test and evidence plan

### Pure and contract tests

- Exact production/local origin normalization and rejection matrix.
- Host/path/method classifier for every profile, wrong host, malformed host, and forwarded-header case.
- `next`/`returnTo` parser property/fuzz cases: absolute, scheme-relative, encoded slash/backslash/control, duplicate/unknown key, oversized, fragment, loop, `/api`, `/rpc`, valid project path/query.
- Device-code and invitation-fragment validators.
- Route ownership manifests for marketing, developers, dashboard, public API, and operator profiles.
- Control Plane DTO equality between bearer and session adapters.
- Public Control Plane OpenAPI remains bearer-only and no SDK export appears.

### Better Auth and session integration

- Production `Set-Cookie` contains Secure, HttpOnly, SameSite=Lax, Path=/, and no Domain.
- Marketing/docs/API requests never receive or accept the dashboard session cookie.
- Dashboard sign-up/sign-in/get-session/sign-out retain native Better Auth behavior.
- API machine device/token endpoints work originlessly and do not create browser sessions.
- Dashboard device inspect/approve/deny requires the dashboard session and exact origin.
- Wrong-host Better Auth paths are absent.
- Session expiry, update-age refresh, revocation, request IDs, and rate limits regressions pass.
- Installed Better Auth split-host compatibility proof passes before broad UI migration.

### Dashboard Control Plane HTTP

- Every M14–M16 hosted operation succeeds through a valid session according to current policy.
- Anonymous, removed, restricted, foreign-tenant, archived, and stale-version behavior matches shared operations.
- Session routes reject Authorization, cross-origin requests, mutation GETs, simple form content types, unknown query/body fields, and oversized input.
- API-host routes still require bearer and reject cookie-only authority.
- Session and bearer calls produce the same safe DTO/envelope for equivalent actors and no duplicate mutation/audit.
- One-time secrets never enter TanStack Query cache, URLs, persisted browser state, or error output.

### Application routing and accessibility

- Marketing has only approved public/entry routes and no auth client/server imports.
- Developer portal retains its existing route/content/public-boundary tests under its new canonical origin.
- Dashboard root/login/protected deep-link hydration remains consistent across server/client.
- Dashboard route tree retains project/editorial URLs and removes the old marketing landing.
- Navigation uses correct internal/external semantics, focus, labels, announcements, and bounded failure pages.
- Canonical/noindex/robots metadata is correct per host.
- Redirect pages and invitation alias work without exposing secrets to DOM text or Referer.

### Cross-workspace/browser tests

Committed headless Chromium specifications cover only browser-owned boundaries:

- Marketing `/login?next=...` lands on dashboard login and completes a safe post-login deep link in an isolated fixture.
- Unsafe redirect input does not navigate off dashboard/marketing origins.
- Direct dashboard protected deep links preserve SSR/session behavior.
- Marketing and developer hosts expose no dashboard cookie/storage.
- Direct dashboard device/invitation routes remain usable without visiting marketing.
- Dashboard remains reachable in a harness where marketing/developer apps are stopped; marketing/docs remain independently reachable when another public app is stopped.

Tests use loopback origins, no retries, and no screenshots/traces/video. Stateful fixtures have registered cleanup and leave no sessions/tokens/residue.

### Package/build/deployment evidence

- `apps/web` references are completely reconciled to `apps/dashboard` where ownership changed.
- Workspace/package/task/structure checks include `marketing` and `dashboard`.
- All three app builds are independent and contain no other app source.
- Docker/reference routing sends only approved host/path combinations.
- Dashboard SSR uses internal service discovery while browser requests use dashboard same-origin routes.
- Public contract artifacts other than intentional documentation host metadata remain byte-compatible.
- Complete format, lint, structure, contracts, type, unit, integration, accessibility, browser, coverage, audit, build, container, and readiness gates pass.

## Manual review

After implementation and automated readiness, the developer should verify:

1. Open marketing, developer docs, and dashboard as three independent origins and inspect canonical navigation.
2. Enter through marketing `/login` with a valid dashboard `next`, authenticate on dashboard, and land on the exact safe destination.
3. Attempt external, scheme-relative, encoded, duplicate, oversized, `/api`, and `/rpc` redirect inputs and confirm no unsafe navigation or reflected value.
4. Inspect the dashboard cookie and confirm Secure/HttpOnly/SameSite=Lax/Path=/ with no Domain; confirm marketing/docs/API requests do not carry it.
5. Approve a CLI device and accept an invitation from direct dashboard canonical links while marketing is stopped.
6. Exercise representative workspace/project, governance, locale, credential, webhook, audit, archive, and restore workflows through the dashboard session Control Plane adapter.
7. Repeat representative Control Plane calls through CLI bearer authority and confirm representation/business-state parity without browser bearer storage.
8. Stop marketing, docs, and a mock customer application independently and confirm dashboard authentication/recovery remains available; stop dashboard and confirm marketing/docs remain independent.
9. Inspect routes, built assets, logs, traces, metrics, storage, and public artifacts for cookies, tokens, internal RPC publication, or SDK administration leakage.

## Implementation sequence and gates

Following the developer's explicit 2026-09-20 design approval:

1. **Workspace split:** add `apps/marketing`; rename `apps/web` to `apps/dashboard`; update package/task/structure/build ownership without changing dashboard behavior.
2. **Pure boundary kernels:** add canonical origin, host/path profile, and redirect parsers with exhaustive tests.
3. **Server host profiles:** separate dashboard, API, and operator route exposure; decouple listen port; preserve public family semantics.
4. **Auth compatibility slice:** configure exact origins/issuer/URLs and host-only cookie; prove split-host Better Auth behavior before continuing.
5. **Session Control Plane adapter:** reuse exact Control Plane schemas/operations and add CSRF-safe dashboard-host transport.
6. **Dashboard migration:** move M14–M16 hosted administration from oRPC DTOs to the session Control Plane client while retaining temporary editorial oRPC.
7. **Public surfaces:** complete marketing routes, docs/dashboard navigation, metadata, canonical links, and failure states.
8. **Reference deployment/browser evidence:** update Docker/reference routing and committed headless browser specifications without production rollout.
9. **Complete readiness and review:** update KB status, run `pnpm run ready`, provide one Conventional Commit proposal, and stop for developer review.

Implementation is authorized in the sequence above. Any need for a database migration, parent-domain cookie, new auth protocol, core dependency, public contract break, or broader ingress architecture stops work for an amendment.

## Alternatives rejected

### Fold marketing into `apps/developers`

Rejected by the developer. Although it minimizes workspaces, it couples marketing and documentation release cycles and does not match the selected plain-noun three-app structure.

### Keep `apps/web` and add a dashboard app

Rejected because it moves the larger established dashboard route tree and creates more import/build regression risk than renaming the owning workspace.

### Root-hosted sign-in with a parent-domain cookie

Rejected because every subdomain would receive broader session authority. Better Auth guidance recommends cross-subdomain cookies only when necessary; this design does not require them.

### Root-hosted sign-in with one-time session handoff

Rejected because it adds a new security-sensitive protocol/persistence/concurrency surface and makes initial authentication depend on marketing availability without material product benefit.

### Direct dashboard browser calls to API host

Rejected because a dashboard-only cookie would not accompany SSR/dashboard requests reliably. Broadening cookie scope would violate the selected boundary.

### TanStack dashboard BFF

Rejected because same-origin ingress can route directly to the existing server. An application BFF adds another runtime hop, failure mode, and transport implementation without adding domain isolation.

### Keep hosted administration on oRPC indefinitely

Rejected because M17 explicitly converges hosted administration on portable Control Plane contracts. Temporary editorial oRPC remains only until the sequenced Studio milestones.

### Separate dashboard-only API paths

Rejected because duplicating resource paths and route inventories weakens compatibility proof. Host-specific authentication over identical Control Plane paths is smaller and more maintainable.

### Canonical sensitive links through marketing

Rejected because marketing downtime would block links and invitation fragments would require a mandatory client bridge. Direct dashboard links preserve recovery availability; marketing aliases remain optional.

### Dynamic/wildcard production auth origins

Rejected because they widen CSRF/open-redirect trust and make host ownership difficult to prove. Production origins remain exact and closed.

## Decision-standard review

### Product-goal alignment

The selected surfaces make the dashboard a genuine account/recovery authority independent of public discovery, docs, and customer applications while preserving one backend model and complete CLI automation.

### Correctness

Closed host/path profiles, canonical origins, one session authority, exact redirect parsing, identical Control Plane schemas, and shared operations prevent ambiguous ownership or transport drift.

### Security

Host-only Lax cookies, exact trusted origins, same-origin mutation checks, API bearer isolation, no browser management bearer, no open redirect, direct fragment-safe invitation links, and wrong-host denial reduce cross-surface privilege and leakage.

### Reliability

Independent app artifacts and direct dashboard recovery routes remove marketing/docs/customer-app dependencies. The design honestly retains the shared server/database dependency and leaves production topology proof to M23.

### Performance

Static public apps avoid auth/database work; direct ingress avoids a BFF hop; existing bounded Control Plane repositories and responses are reused.

### UX

Users get clear marketing, docs, and dashboard destinations, safe deep-link sign-in, stable direct invitation/device flows, and unchanged administration/editorial behavior during the transition.

### DX

Developers and agents keep canonical HTTP/CLI contracts, stable dashboard routes, explicit origins, deterministic errors, and no new SDK administration surface.

### Observability

Closed host/auth/route labels diagnose separation failures without recording raw hosts, redirects, cookies, tokens, or content.

### Maintainability and future compatibility

Three app owners, one server authority, identical Control Plane DTOs, no app-source imports, and temporary explicit oRPC boundaries leave M18–M23 cleanly sequenced.

## Approved implementation authority

The developer approved M17 implementation on 2026-09-20 under these decisions:

1. Add `apps/marketing`, retain docs-only `apps/developers`, and rename `apps/web` to `apps/dashboard`.
2. Use `framerfordevs.com`, `developer.framerfordevs.com`, and `dashboard.framerfordevs.com` as the three canonical application hosts.
3. Keep credential UI/session/invitation acceptance/device approval on dashboard; marketing owns validated entry redirects only.
4. Use a host-only Secure/HttpOnly/SameSite=Lax dashboard cookie with no parent Domain.
5. Use direct dashboard canonical invitation and device-verification links; marketing aliases are optional only.
6. Route dashboard auth, session Control Plane, and temporary RPC through same-origin ingress to the existing server.
7. Enforce exact dashboard/API/operator host/path profiles before route handling.
8. Keep API-host Control Plane bearer-only and public OpenAPI/SDK boundaries unchanged.
9. Add a dashboard-session adapter on identical Control Plane v1 resource paths and migrate M14–M16 hosted administration to it.
10. Retain temporary session oRPC only for content/editorial workflows until M19–M21 parity.
11. Add no database migration or new auth handoff protocol.
12. Require the complete security, routing, compatibility, accessibility, browser, build, and failure-isolation evidence above.
13. Keep production DNS/ingress/configuration, OAuth activation, deployment, commit, milestone acceptance, and M18+ work developer-controlled.

Approval does not authorize the agent to deploy, change production configuration, commit, accept M17, or begin M18. The Better Auth split-host compatibility slice is a real go/no-go gate: failure requires an amendment rather than a workaround.
