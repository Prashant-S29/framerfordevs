# Product and Architecture Learnings

**Purpose:** Preserve consequential product and architecture lessons so future agents do not repeat decisions or assumptions that caused rework, violated agreed constraints, or drifted from the product goals.

This file is not a command-error log. Do not record ordinary shell failures, missing local tools, typos, or harmless execution mistakes.

## What belongs here

Record a learning when an implementation or decision:

- Was based on an incorrect product or architecture assumption
- Violated an agreed product invariant or engineering constraint
- Had to be discarded or substantially reworked
- Created avoidable security, reliability, performance, UX, DX, observability, or maintainability problems
- Coupled the CMS to a future product in a way that would block composition
- Broke or weakened a public contract, tenant boundary, localization rule, or publication guarantee

## Entry format

```text
## Date — Short title

**Context:** What was being built or decided.
**Incorrect assumption or decision:** What caused drift or rework.
**Cost or risk:** What had to be discarded, repaired, or could have broken.
**Learning:** The durable product or architecture lesson.
**Prevention:** The concrete rule or test that prevents recurrence.
**Status:** Current resolution.
```

---

## 2026-07-28 — Repository stack must be verified before architecture decisions

**Context:** The initial conversation described the frontend as Next.js and referred to “MetraAuth.”

**Incorrect assumption or decision:** Treating those names as canonical would have designed the CMS around a stack the repository does not use.

**Cost or risk:** It could have caused unnecessary frontend migration work, incompatible implementation plans, and incorrect authentication integration.

**Learning:** Product planning must distinguish intended product behavior from the concrete stack already checked into the repository. Architecture decisions require repository verification, not conversational assumption alone.

**Prevention:** Before planning or changing architecture, inspect the root README, package manifests, workspace configuration, and runtime entrypoints. Record the confirmed stack in `context.md` and require an explicit developer decision before replacing it.

**Status:** Resolved. TanStack Start and Better Auth are canonical.

---

## 2026-07-28 — Research tooling must not become a runtime dependency

**Context:** The official Effect skill requires a local Effect source checkout through the root `prepare` script.

**Incorrect assumption or decision:** Running the research checkout unconditionally during every package installation would couple Docker/CI builds to GitHub availability, require Git in runtime build images, increase build time, and copy research-only files into build contexts.

**Cost or risk:** Container builds would become slower and less reliable for functionality that production does not need.

**Learning:** Agent research infrastructure and product runtime dependencies are different concerns. Research tooling must remain reproducible for developers without entering production artifacts or critical build paths.

**Prevention:** `.repos`, skills, and knowledge documents are excluded from Docker contexts. Container builds set `SKIP_EFFECT_SOURCE_SETUP=1`; local installs still prepare the research checkout.

**Status:** Resolved and validated through complete Docker image builds.

---

## 2026-07-28 — CORS configuration must enforce origin denial explicitly

**Context:** The starter passed a fixed trusted origin string to CORS middleware.

**Incorrect assumption or decision:** Treating a mismatched `Access-Control-Allow-Origin` response as sufficient rejection left untrusted requests executing against the server even though browsers would withhold the response.

**Cost or risk:** Non-browser clients could still perform requests, preflights did not communicate an explicit denial, and security behavior depended on browser enforcement rather than server policy.

**Learning:** CORS is not authorization, but configured browser-origin policy must still be explicit, deterministic, and tested on the server boundary.

**Prevention:** Reject untrusted origins and preflights with HTTP 403 before route handling, omit CORS headers, and maintain tests for trusted, untrusted, preflight, and originless requests.

**Status:** Resolved with integration coverage.

---

## 2026-07-29 — Stable package declarations are the executable Effect API contract

**Context:** Milestone 1 introduced stable `effect@3.22.0` while the installed Effect skill and source-oriented examples use some newer source API names.

**Incorrect assumption or decision:** Treating guide/source names such as `Context.Service`, `Schema.TaggedErrorClass`, and `Schema.optionalKey` as guaranteed stable package exports caused the first implementation pass to target APIs absent from the installed stable declaration surface.

**Cost or risk:** The service, error, and schema foundation required avoidable rewrites and could have encouraged upgrading to beta packages merely to satisfy examples.

**Learning:** For a pinned stable Effect release, the installed package's public declarations and compile-time behavior are the executable contract. Guides and source remain research inputs, not permission to cross the approved stability boundary.

**Prevention:** Keep exact aligned stable versions, inspect the installed public declarations when an API differs, compile incrementally, and use stable 3.22 equivalents (`Context.Tag`, `Schema.TaggedError`, and exact `Schema.optionalWith`) rather than changing versions speculatively.

**Status:** Resolved with stable versions and compatibility tests.

---

## 2026-07-30 — Container health must exercise server-rendered dependencies

**Context:** The Docker web root was healthy, but the server-rendered login route failed while resolving the current Better Auth session.

**Incorrect assumption or decision:** The web container used the browser-facing `http://localhost:3000` API URL during server-side rendering. Inside the web container, `localhost` referred to the web container itself. The root-only health check did not exercise authentication and therefore reported healthy.

**Cost or risk:** Docker appeared production-ready while `/login` rendered a fetch failure, blocking authentication and all manual platform review.

**Learning:** Universal applications need separate public browser and internal service-discovery URLs. Container health checks must traverse a representative server-rendered dependency, not only a static or dependency-free root.

**Prevention:** Docker supplies `INTERNAL_SERVER_URL=http://server:3000` for SSR while retaining the public Vite URL for browsers. URL resolution has dedicated tests, and the web health check now requests `/login`, which exercises the auth service dependency.

**Status:** Resolved and validated with 163 tests, a production rebuild, healthy containers, and an HTTP 200 login response.

---

## 2026-07-30 — Authorization lifecycle must update discovery and serialize cleanup

**Context:** Milestone 3 replaced owner-only project access with explicit project memberships and collaborator workspace discovery.

**Incorrect assumption or decision:** Treating authorization as only a per-project operation guard would leave owner-only discovery queries in place, while independently removing the same collaborator from two projects could race and leave an active workspace collaborator row after the final project access disappeared.

**Cost or risk:** Valid collaborators could be hidden from the dashboard, or stale workspace discovery access could survive concurrent project removals even though project authorization correctly denied access.

**Learning:** Authorization includes discovery and lifecycle maintenance, not only endpoint checks. Invariants spanning multiple resources need a stable serialization point in addition to unique constraints and optimistic versions.

**Prevention:** Workspace/project list queries resolve active effective access; project owner mutations lock the project; invitation acceptance serializes on the user; and collaborator cleanup locks the workspace membership before counting remaining project memberships. Integration tests cover collaborator visibility, immediate access loss, stable reactivation, and concurrency.

**Status:** Resolved in Milestone 3 and awaiting developer manual review.

---

## Current implementation learnings

The platform authorization foundation is implemented through Milestone 3 automated readiness. CMS-domain implementation has not started. Additional entries should be added only when a consequential decision causes drift or rework.
