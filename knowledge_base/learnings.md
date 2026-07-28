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

## Current implementation learnings

No CMS-domain implementation has started. Additional entries should be added only when a consequential product or architecture decision causes drift or rework.
