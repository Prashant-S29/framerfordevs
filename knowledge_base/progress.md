# Progress

Status: `[A]` accepted, `[R]` in developer review, `[~]` in progress, `[P]` planned and not designed. Milestone scope is in `milestone.md`. Evidence lives in tests and commit history.

| #   | Milestone                               | Status | Commit    |
| --- | --------------------------------------- | ------ | --------- |
| 0   | Foundation validation                   | `[A]`  | `7d5a312` |
| 1   | Effect, errors, observability           | `[A]`  | `c28f6fa` |
| 2   | Platform kernel                         | `[A]`  | `60adb39` |
| 3   | Membership, policy, credentials         | `[A]`  | `a74aeb8` |
| 4   | Project locales                         | `[A]`  | `68b6f6e` |
| 5   | Versioned schema engine                 | `[A]`  | `28ca04d` |
| 6   | Field system and generated forms        | `[A]`  | `fbb4767` |
| 7   | Entries, multilingual drafts, revisions | `[A]`  | `60bd96f` |
| 8   | Per-locale publication and snapshots    | `[A]`  | `ad3cd5e` |
| 9   | Delivery API                            | `[A]`  | `8559aa4` |
| 10  | Preview API                             | `[A]`  | `aa177b5` |
| 11  | Events, webhooks, invalidation          | `[A]`  | `fef7205` |
| 12  | Developer portal and generated tooling  | `[A]`  | `4e87908` |
| 13  | Code-first authoring and local editor   | `[A]`  | `9c68942` |
| 14  | Control-plane bootstrap contracts       | `[A]`  | `6ba124a` |
| 15  | Governance automation parity            | `[A]`  | `5460c2b` |
| 16  | Operational administration and recovery | `[A]`  | `c3f9430` |
| 17  | Hosted surface separation               | `[A]`  | `d6b506d` |
| 18A | Studio platform authority               | `[A]`  | `317a295` |
| 18B | Studio mount and security runtime       | `[A]`  | `c38b7db` |
| 19A | Studio content protocol and BFF         | `[A]`  | `788b782` |
| 19B | Mounted Studio content experience       | `[A]`  | `ec37524` |
| 20A | Studio revisions and publication        | `[A]`  | `ebe2aa8` |
| 20B | Studio Preview and Presentation         | `[A]`  | `1e8fe9b` |
| 20C | Editor convergence and route retirement | `[A]`  | `94bd7f4` |
| 21  | Client handover and editorial safety    | `[P]`  | —         |
| 22  | Data durability and portability         | `[P]`  | —         |
| 23  | Production security and operations      | `[P]`  | —         |
| 24  | Environment lifecycle and promotion     | `[P]`  | —         |
| 25  | Managed assets and media                | `[P]`  | —         |
| 26  | Workflow automation and scheduling      | `[P]`  | —         |
| 27  | Visual-builder readiness contracts      | `[P]`  | —         |
| 28  | Visual Studio composition               | `[P]`  | —         |
| 29  | Visual publication and dependencies     | `[P]`  | —         |
| 30  | Renderer SDK and framework adapters     | `[P]`  | —         |

`ec37524` also moved the repository to Effect 4.1 and patched dependency security advisories.

## Open developer-controlled gates

- Migrations `0000`–`0024` are applied locally. The developer generates and applies every migration.
- The schema, SDK, CLI, and Studio packages are unpublished at `0.0.0`. Versioning and publication wait for the developer.
- Production OAuth, domains, configuration, and deployment are not set up.
- QuickJS issue #255 blocks production activation of the Tier 2 schema build. It does not block M21–M30.
