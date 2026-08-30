# Public HTTP, CLI, and SDK surface boundary

**Status:** Approved by the developer on 2026-08-29

**Date:** 2026-08-29

## Decision summary

Stable HTTP, the CLI, and the public application SDK are intentionally different product surfaces. They share server authority but do not require feature parity.

- **Stable HTTP contracts** are the canonical machine boundary for every supported control-plane, project, content, and runtime operation.
- **The CLI** is the complete noninteractive developer/agent/operator surface over those contracts. It owns bootstrap, governance, credentials, webhooks, recovery, schema workflows, content automation, environments, and later operational workflows where authorized.
- **The public application SDK** is a deliberately smaller content/runtime integration surface for code that powers websites, trusted content integrations, preview, webhooks, invalidation, and later rendering. It is not a typed mirror of the control plane.
- **Hosted control plane and Studio** remain human clients over the same server-side policies, repositories, actor attribution, concurrency, audits, and HTTP/domain contracts.

The developer selected this scoped SDK model after reviewing the M14 proposal and the Sanity product split. This decision supersedes broad roadmap language requiring identical CLI/SDK parity for every operation.

## Product rationale and comparison

Sanity's primary JavaScript client is centered on Content Lake integration: querying and mutating documents, assets, and realtime content. Its CLI is the broader developer/operations tool for project setup, Studio development/build/deploy, datasets, webhooks, migrations, and scripts. Sanity has additional specialized application/Studio surfaces instead of making one website SDK the complete administration client.

Framer for Devs adopts the useful separation, not Sanity's exact API model:

- Application code gets stable, focused content/runtime packages.
- Agents and developers get the complete CLI.
- Every operation still has a stable HTTP contract, so the CLI and hosted clients do not depend on private UI behavior.
- Sensitive administration does not become an attractive, permanent import surface in website bundles or ordinary application code.

Primary references reviewed:

- Sanity, [“Getting started with `@sanity/client`”](https://www.sanity.io/docs/apis-and-sdks/js-client-getting-started): content query, mutation, asset, and realtime client responsibilities
- Sanity, [“Command Line Interface”](https://www.sanity.io/docs/apis-and-sdks/cli): project management/development/debugging/deployment, datasets, webhooks, migrations, and scripts

## Governing rules

1. UI-only business authority is incomplete: every meaningful operation requires a stable server-owned HTTP contract.
2. Every meaningful agent/developer automation operation requires a deterministic noninteractive CLI path unless the operation is runtime-only.
3. SDK inclusion is a separate product decision based on application/runtime need; HTTP or CLI existence does not imply an SDK method.
4. The SDK never exposes workspace/project lifecycle, memberships, invitations, role/policy administration, credential secret lifecycle, webhook destination administration, audits, recovery/operator controls, Studio registration administration, or environment lifecycle/promotion.
5. The SDK may expose content reads/writes, exact-locale drafts/publication, read-only schema/form metadata needed by content integrations, Delivery, Preview, webhook verification, invalidation helpers, managed content assets, live updates, and renderer contracts.
6. Schema structure export/plan/push, editorial Presentation mutation, bootstrap/linking, secret administration, deployment, and recovery remain HTTP/CLI/hosted-surface operations.
7. Sensitive SDK operations that remain, such as content writes or Preview, are trusted-server-only, require caller-supplied scoped authority, reject redirects, and never read environment variables or persist credentials themselves.
8. Browser-safe and server-only exports remain explicit and independently tree-shakeable. Control-plane contracts do not enter SDK bundles through shared convenience exports.
9. Public HTTP families may declare `sdkSupported: false`; canonical OpenAPI and CLI support do not require a corresponding SDK namespace.
10. New milestones must state which category each operation belongs to: HTTP+CLI, HTTP+CLI+hosted UI/Studio, or content/runtime SDK.

## Approved SDK scope

### Included

- Delivery reads and cache metadata
- Preview reads in trusted server boundaries
- Generated content types, Effect Schema validators, JSON Schema/OpenAPI-derived project artifacts, and immutable contract recognition
- Exact-locale content list/get/create/rename/draft-save/validate/publish/unpublish for trusted integrations
- Read-only role-projected generated-form and Presentation metadata needed to build content tools
- Webhook raw-body verification and invalidation normalization
- Future content asset consumption/upload where its milestone proves a website/content-integration need
- Future live content/runtime subscriptions if separately designed
- M30 renderer core and supported framework adapters, preferably as explicit renderer package boundaries

### Excluded

- Workspace or project create/list/update/archive/restore
- Capability enable/disable
- Studio registration administration
- Membership, invitation, role, policy, or locale administration
- Credential issue/list/rotate/revoke or one-time secret handling
- Webhook destination/subscription/mapping/attempt/replay administration
- Audit/security/operator/recovery administration
- Schema structure export/plan/apply/push
- Editorial Presentation publication/mutation
- Environment create/archive/promotion/configuration
- Workflow/schedule administration unless a later design proves a narrow content-integration SDK need
- Visual composition/publication administration
- Deployment, billing, analytics, plugin, or managed-host administration

## Existing package correction before publication

`@framerfordevs/sdk` and related packages remain version `0.0.0` and unpublished, so the staged M13 surface was not yet a compatibility promise.

The approved pre-publication correction is implemented in the current review worktree:

- Delivery, Preview, content-centric Authoring, webhook verification, invalidation, schemas, and generated helpers remain.
- Schema export/plan/apply methods and DTO exports plus Presentation publish methods/DTO exports are removed from public `./authoring`.
- Read-only generated-form/Presentation projection remains for trusted custom content tooling.
- Existing schema CLI/editor consumers use a strict CLI-owned Authoring operator client instead of preserving the accidental SDK methods.
- `ffd presentation get` emits a versioned credential-free exact-authority document; `ffd presentation publish --file` strictly validates and publishes it with a content-free retry journal.
- Runtime forbidden-method/symbol tests, strict file/transport tests, credential-blind pre-auth graph checks, and packaged schema/Presentation/content/editor workflows cover the corrected boundary.

This is an intentional pre-publication correction, not a breaking released-package change. It changes no Authoring HTTP route, server/domain behavior, database authority, accepted M13 data, or prior canonical public artifact.

## Roadmap consequences

- M14 Control Plane v1 has canonical HTTP, CLI, and dashboard support, but `sdkSupported: false` and no `@framerfordevs/sdk/control-plane` export.
- M15 governance and M16 operational administration have stable HTTP, complete CLI, and hosted UI support only.
- M17–M21 Studio uses server/BFF contracts and shared UI packages; it does not justify control-plane SDK expansion.
- M24 environment lifecycle and promotion remain HTTP/CLI/control-plane/Studio administration; SDK consumers receive only explicit environment selection inputs.
- M25 may add content asset SDK methods, but storage administration remains CLI/control-plane.
- M26 workflow/schedule administration defaults to HTTP/CLI/Studio, not SDK.
- M27 binding contracts may generate runtime types without publishing binding administration methods.
- M28–M29 visual composition/publication remain HTTP/CLI/Studio.
- M30 intentionally owns the renderer SDK baseline.

## Decision-standard review

### Product alignment

The CLI becomes the reliable primary agent interface while application developers receive a focused website/content SDK similar in responsibility—not exact implementation—to Sanity's content client.

### Correctness and reliability

Stable HTTP remains canonical, so narrowing SDK exports removes no server authority. CLI and hosted clients still share exact idempotency, concurrency, actor, audit, and tenant rules.

### Security

Secret and account administration are less likely to enter application bundles, examples, long-lived package compatibility, or browser code. The change does not rely on package omission for authorization; every HTTP route remains server-authorized.

### Performance and DX

A smaller SDK reduces bundle/API/docs surface and makes its purpose predictable. Agents get stable JSON CLI commands instead of generating application code around SDK methods.

### Maintainability

HTTP families, CLI commands, and SDK SemVer can evolve independently. Future SDK additions require demonstrated runtime/content value rather than automatic parity.

## Superseded language

Any previous requirement stating “HTTP plus CLI/SDK parity” or “complete CLI and SDK access to every operation” now means:

- canonical HTTP for every supported operation,
- complete noninteractive CLI parity for agent/developer automation,
- SDK exposure only for approved content/runtime integration.

Historical completed-milestone records remain accurate descriptions of what was implemented, but unpublished package surfaces must conform to this decision before release.
