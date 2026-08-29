import { assert, describe, it } from "@effect/vitest";
import { Effect, Exit, Schema } from "effect";

import { Cursor } from "../../platform";
import {
  decodeInvalidationMappingCursor,
  decodeWebhookAttemptCursor,
  decodeWebhookDeliveryCursor,
  decodeWebhookEndpointCursor,
  encodeInvalidationMappingCursor,
  encodeWebhookAttemptCursor,
  encodeWebhookDeliveryCursor,
  encodeWebhookEndpointCursor,
} from "./index";

const scope = {
  projectId: "019fae8b-1234-7000-8000-000000000001",
  environmentId: "019fae8b-1234-7000-8000-000000000002",
};
const ids = {
  endpoint: "019fae8b-1234-7000-8000-000000000003",
  mapping: "019fae8b-1234-7000-8000-000000000004",
  delivery: "019fae8b-1234-7000-8000-000000000005",
  attempt: "019fae8b-1234-7000-8000-000000000006",
};

const at = "2026-08-13T00:00:00.000Z";

describe("Webhook keyset cursors", () => {
  it.effect("round trips every scope- and filter-bound cursor kind", () =>
    Effect.gen(function* () {
      const endpoint = yield* encodeWebhookEndpointCursor({
        ...scope,
        createdAt: at,
        endpointId: ids.endpoint,
      });
      const mapping = yield* encodeInvalidationMappingCursor({
        ...scope,
        createdAt: at,
        mappingId: ids.mapping,
      });
      const delivery = yield* encodeWebhookDeliveryCursor({
        ...scope,
        endpointFilter: ids.endpoint,
        eventTypeFilter: "cms.entry.published",
        statusFilter: "dead_letter",
        createdAt: at,
        deliveryId: ids.delivery,
      });
      const attempt = yield* encodeWebhookAttemptCursor({
        ...scope,
        deliveryId: ids.delivery,
        attemptNumber: 2,
        attemptId: ids.attempt,
      });
      assert.strictEqual(
        (yield* decodeWebhookEndpointCursor(endpoint, scope)).endpointId,
        ids.endpoint,
      );
      assert.strictEqual(
        (yield* decodeInvalidationMappingCursor(mapping, scope)).mappingId,
        ids.mapping,
      );
      assert.strictEqual(
        (yield* decodeWebhookDeliveryCursor(delivery, {
          ...scope,
          endpointId: ids.endpoint,
          eventType: "cms.entry.published",
          status: "dead_letter",
        })).deliveryId,
        ids.delivery,
      );
      assert.strictEqual(
        (yield* decodeWebhookAttemptCursor(attempt, { ...scope, deliveryId: ids.delivery }))
          .attemptNumber,
        2,
      );
    }),
  );

  it.effect("rejects malformed, cross-scope, and changed-filter reuse", () =>
    Effect.gen(function* () {
      const endpoint = yield* encodeWebhookEndpointCursor({
        ...scope,
        createdAt: at,
        endpointId: ids.endpoint,
      });
      const delivery = yield* encodeWebhookDeliveryCursor({
        ...scope,
        endpointFilter: null,
        eventTypeFilter: null,
        statusFilter: null,
        createdAt: at,
        deliveryId: ids.delivery,
      });
      const malformed = Schema.decodeUnknownSync(Cursor)("not-json");
      assert.isTrue(
        Exit.isFailure(yield* Effect.exit(decodeWebhookEndpointCursor(malformed, scope))),
      );
      assert.isTrue(
        Exit.isFailure(
          yield* Effect.exit(
            decodeWebhookEndpointCursor(endpoint, {
              ...scope,
              environmentId: "019fae8b-1234-7000-8000-000000000099",
            }),
          ),
        ),
      );
      assert.isTrue(
        Exit.isFailure(
          yield* Effect.exit(
            decodeWebhookDeliveryCursor(delivery, {
              ...scope,
              endpointId: ids.endpoint,
              eventType: null,
              status: null,
            }),
          ),
        ),
      );
    }),
  );
});
