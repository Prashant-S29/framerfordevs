// Verifies the replaceable projector preserves typed invalid-event failures.

import { assert, describe, it } from "@effect/vitest";
import { Effect, Exit } from "effect";

import { WebhookEventProjector, WebhookEventProjectorLive } from "./webhook-event-projector";

describe("WebhookEventProjector", () => {
  it.effect("fails unknown outbox authority closed through its named service", () =>
    Effect.gen(function* () {
      const projector = yield* WebhookEventProjector;
      const exit = yield* Effect.exit(
        projector.project({
          id: "019fae8b-1234-7000-8000-000000000001",
          projectId: "019fae8b-1234-7000-8000-000000000002",
          environmentId: "019fae8b-1234-7000-8000-000000000003",
          eventType: "unknown.event",
          subjectType: "cms.entry",
          subjectId: "019fae8b-1234-7000-8000-000000000004",
          schemaRevisionId: null,
          localeId: null,
          entryPublicationId: null,
          aggregateSequence: 1,
          payload: {},
          occurredAt: new Date(),
        }),
      );
      assert.isTrue(Exit.isFailure(exit));
    }).pipe(Effect.provide(WebhookEventProjectorLive)),
  );
});
