# Decision Record Index

Decision records preserve load-bearing rationale; they are not a chronological reading list. Start from current code/tests and read a record only when current work changes, consumes, or must preserve the listed authority. Follow real dependencies to additional records.

| Record                                                                                                                     | Read when current work touches                                                                       | Common dependencies                 |
| -------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ----------------------------------- |
| [`m1-effect-boundaries.md`](m1-effect-boundaries.md)                                                                       | Effect runtime, errors, Layers, API envelope, observability boundaries                               | None                                |
| [`m2-platform-kernel-design.md`](m2-platform-kernel-design.md)                                                             | Workspaces, projects, environments, capabilities, ownership, audits                                  | M1                                  |
| [`m3-access-and-credentials-design.md`](m3-access-and-credentials-design.md)                                               | Membership, roles, policy, invitations, credentials, actor/security authority                        | M1–M2                               |
| [`m4-project-locales-design.md`](m4-project-locales-design.md)                                                             | Locale identity/lifecycle/order/access or required English                                           | M2–M3                               |
| [`m5-versioned-schema-engine-design.md`](m5-versioned-schema-engine-design.md)                                             | Collections, schema drafts/revisions, stable field IDs, classification, acknowledgements             | M1–M4                               |
| [`m6-field-system-and-generated-forms-design.md`](m6-field-system-and-generated-forms-design.md)                           | Field kinds, recursive validation/localization, layout, generated forms, rich text/assets            | M4–M5                               |
| [`m7-entries-multilingual-drafts-and-revisions-design.md`](m7-entries-multilingual-drafts-and-revisions-design.md)         | Entries, shared/localized drafts, revisions, restore, optimistic saves                               | M3–M6                               |
| [`m8-independent-locale-publication-and-snapshots-design.md`](m8-independent-locale-publication-and-snapshots-design.md)   | Exact-locale publication, immutable snapshots/edges, staleness, outbox atomicity                     | M4, M6–M7                           |
| [`m9-production-delivery-api-design.md`](m9-production-delivery-api-design.md)                                             | Public Delivery, typed projections, cursors, cache/CORS/rate/query/load behavior                     | M3–M4, M6, M8                       |
| [`m10-preview-api-and-ux-design.md`](m10-preview-api-and-ux-design.md)                                                     | Preview credentials/API, current/history projection, draft-safe preview UX                           | M3–M4, M6–M9                        |
| [`m11-publication-events-webhooks-and-invalidation-design.md`](m11-publication-events-webhooks-and-invalidation-design.md) | Outbox projection, webhooks, invalidation, SSRF/signing/retries/workers                              | M3, M8–M10                          |
| [`m12-developer-portal-and-generated-tooling-design.md`](m12-developer-portal-and-generated-tooling-design.md)             | Public contracts, Tooling API, OAuth device flow, SDK/CLI/generation, portal/releases                | M3–M6, M9–M11 as actually consumed  |
| [`m13-code-first-authoring-and-local-editor-design.md`](m13-code-first-authoring-and-local-editor-design.md)               | Code-first schema, source reconciliation/hashes, Authoring API/SDK/CLI, local editor, Presentation   | M3–M8, M11–M12 as actually consumed |
| [`m14-control-plane-bootstrap-contracts-design.md`](m14-control-plane-bootstrap-contracts-design.md)                       | Portable workspace/project bootstrap, lifecycle, capabilities, Studio registration, Control Plane v1 | M2–M3, M12–M13 as actually consumed |
| [`public-http-cli-and-sdk-surface-boundary.md`](public-http-cli-and-sdk-surface-boundary.md)                               | Choosing stable HTTP, full agent/operator CLI, or scoped content/runtime SDK exposure                | M12–M14 as actually consumed        |
| [`repository-test-structure.md`](repository-test-structure.md)                                                             | Test placement, package ownership, test/build boundaries, test-directory refactors                   | None                                |

## Selection rules

- New milestone work reads its own approved decision first, then only dependency records required by touched code/contracts.
- A control-plane-only change does not require Delivery, Preview, webhook, or M13 editor decisions unless imports or behavior cross those domains.
- A Studio/content change usually needs M3 access, M4 locales, M6 forms/layout, M7 drafts, M8 publication, and the relevant M13 authoring boundary—not unrelated load/deployment rationale from every milestone.
- A future visual-binding change starts from stable identity/publication requirements in the PRD, then M5/M6/M8 and only the transport/Studio records it consumes.
- When a record is superseded, retain it for history, mark that status at its top, and route new work to the replacement here.
