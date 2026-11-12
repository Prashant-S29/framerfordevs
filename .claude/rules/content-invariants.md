---
paths:
  - "packages/api/src/**"
  - "packages/db/src/schema/**"
---

# Localization and publication invariants

Reject any change that breaks these, even if it looks simpler.

- `en` is required. Every content operation names an explicit locale. Delivery never falls back to another locale.
- Each locale publishes and unpublishes independently.
- Shared fields are copied into each locale's publication snapshot. Editing shared values never changes an existing publication.
- Drafts never affect public Delivery.
- Publication records and snapshots are immutable.
- Publication state and its outbox event are written in one transaction.
