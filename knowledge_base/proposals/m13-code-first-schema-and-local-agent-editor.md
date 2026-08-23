# Proposal: Code-first schema & content authoring, and a local agent-first editor

**Status:** Proposal only — not a design. The actual design remains the agent's work,
produced after M12 ships, with full repository context, following the same process
M12's design record used (goal, deliverables, automated criteria, manual review,
explicit approval-requested list).

**Where this fits:** Formalized as Milestone 13, sequenced immediately after M12.
The previous M13 client handover, M14 production hardening, and M15 visual-builder
readiness milestones are now M14, M15, and M16.

## Why this exists

The product's goal since day one has been the best agent-first CMS, not merely a
CMS with an API. Reviewing M12 against that goal surfaced a real gap: our schema is
currently authored through a GUI (dashboard field-tree builder), which an agent can
only operate by driving a browser. That's in direct tension with the product's own
north star.

We looked at how Sanity's developer experience works, since it's widely regarded as
the best agent/developer-first CMS experience available. Two things came out of that:

- **What to adopt:** schema defined as code in the developer's own repo, and a local
  editor (an npm-distributed app running on localhost) that renders content-editing
  forms against that schema while talking directly to the developer's live hosted
  project — never to a local sandbox, never storing content on the developer's machine.
- **What to explicitly not adopt:** Sanity has no versioned schema revisions, no
  breaking-change classification, and no acknowledgment gate — a schema change just
  goes live on deploy, with only a passive after-the-fact mismatch warning. Our M5
  schema engine already does this better, and none of that safety is being given up.

## What changes, and what doesn't

- **Stays exactly as-is:** the versioned schema engine — immutable revisions, stable
  ID / API key / label separation, breaking-change classification, acknowledgment-gated
  publish, atomic publication + outbox events, per-locale independent publish/unpublish,
  exact decimal/money handling. This is backend logic, unaffected by how schema is authored.
- **Retired:** the dashboard's schema-_building_ GUI — the visual field-tree inspector
  and the schema-JSON authoring view built around it in M6. This is the one thing
  Sanity doesn't have an equivalent of, and it's the one thing being removed in favor of code.
- **Promoted, not rebuilt:** the generated content-_form_ renderer from M6 (the thing
  that turns a schema into an actual entry-editing form). This becomes the local
  editor's editing surface. It's extracted and reused, not thrown away.
- **Stays GUI-editable:** editor layout — field order, groups, tabs, help text, role
  visibility. Non-breaking and cosmetic per the PRD's existing separation (8.7), and a
  real quality-of-life win for non-developer team members to keep editable directly.

## The developer/agent flow we're aiming for

- Schema is defined as code, in the developer's own repo, version-controlled by them.
- A CLI push sends that schema through the _same_ validate → classify →
  acknowledge-if-breaking → publish lifecycle the dashboard already uses — the safety
  gate doesn't change based on which door the change came through.
- Entries can be created/updated, locale values set, and locales published/unpublished
  via CLI or script — not only through the dashboard.
- A local editor (npm package, runs on localhost) gives a full content-editing
  experience against the real live project, and reflects local schema-as-code live —
  it does not offer its own schema GUI; schema only ever lives in code.
- The whole loop — define schema, push, author content, publish, verify — should be
  usable non-interactively by an agent end to end, with no dashboard click required
  beyond the one-time OAuth approval M12 already designs.

## Authorization

Tokens should carry separate, explicit grants — read, create/update draft, publish,
and schema push — rather than one broad write scope. Whatever grants a token has is
exactly what an agent holding it can do. Extend the existing credential-family model
from M3 rather than inventing a parallel one.

## Schema and content authority

Schema has exactly one path of authority: code, pushed via CLI through the existing
validate → classify → acknowledge-if-breaking → publish engine. No other surface
creates or changes collection structure once the dashboard schema-builder is retired.
A developer with stale local schema files is ordinary version-control staleness,
resolved by pulling latest — not something the CMS detects or reconciles.

Content has exactly one path of authority — the database — reached through two
equally valid clients: the local editor (interactive, human or agent-driven) and
CLI/scripted writes (bulk import, seeding, or agent-scripted entry creation). Neither
client outranks the other. Both are simply callers of the same entries/publication
engine (M7/M8) that already exists, under the same optimistic-concurrency conflict
handling already applied to two concurrent dashboard sessions today. A content
script is a write operation, not a persistent declarative source; once it runs, the
database is what's true, exactly as with Sanity's migration/seed scripts.

Every write — from either content client — is validated server-side against the
current published schema revision at save/publish time. This is a deliberate
divergence from Sanity, whose Content Lake is schemaless and skips server-side
validation on programmatic writes; our engine's existing validation gate stays in
place regardless of which client is writing.

## Non-goals of this document

- No implementation detail, package names, routes, database schema, or OAuth scope
  names — that's the agent's design work.
- Does not reopen M9/M10/M11 or expand the proposed M12 design; M12 approval and implementation remain a separate gate.
- Does not change what content administrators, editors, reviewers, or client editors
  can do — this is entirely about how the Developer role authors schema and content.
