# Localization and Publication Rules

- English (`en`) is required.
- Every content API operation requires explicit locale context.
- Delivery never silently falls back to another locale.
- Each locale publishes and unpublishes independently.
- Shared fields are captured into each locale publication snapshot.
- Editing shared values never mutates existing publications.
- Draft changes never affect public delivery.
- Publication records and snapshots are immutable.
- Publication state and outbox event creation are atomic.

Reject any implementation that violates these invariants even if it appears simpler.
