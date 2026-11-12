// Verifies bounded M11 webhook inputs, event discrimination, invalidation rules, and OpenAPI conversion.

import { assert, describe, it } from "@effect/vitest";
import { Effect, Exit } from "effect";

import { EffectSchemaToJsonSchemaConverter } from "../response/effect-schema-converter";
import {
  ChangeWebhookSecretRotationInputSchema,
  CreateInvalidationRouteMappingInputSchema,
  CreateWebhookEndpointInput,
  CreateWebhookEndpointInputSchema,
  GetWebhookEndpointInputSchema,
  InvalidationRouteMappingOutputSchema,
  IssuedWebhookEndpointOutputSchema,
  ListInvalidationRouteMappingsInputSchema,
  ListWebhookAttemptsInputSchema,
  ListWebhookDeliveriesInputSchema,
  ListWebhookEndpointsInputSchema,
  PublicationWebhookEvent,
  ReplayWebhookEventInputSchema,
  ReplayWebhookEventResultOutputSchema,
  ReplaceWebhookSubscriptionsInputSchema,
  RotatedWebhookSecretOutputSchema,
  SemanticInvalidationTag,
  SetInvalidationRouteMappingStateInputSchema,
  SetWebhookEndpointStateInputSchema,
  StartWebhookSecretRotationInputSchema,
  UpdateInvalidationRouteMappingInputSchema,
  UpdateWebhookEndpointInputSchema,
  WebhookAttemptPageOutputSchema,
  WebhookChangeAuthority,
  WebhookDeliveryPageOutputSchema,
  WebhookDestinationUrl,
  WebhookEndpointOutputSchema,
  WebhookEndpointPageOutputSchema,
  WebhookEventTypes,
  WebhookInvalidationAuthority,
  InvalidationRoutePath,
} from "./index";

import * as SchemaStrict from "../../lib/schema-strict";
const projectId = "019fae8b-1234-7000-8000-000000000001";
const environmentId = "019fae8b-1234-7000-8000-000000000002";
const collectionId = "019fae8b-1234-7000-8000-000000000003";
const schemaRevisionId = "019fae8b-1234-7000-8000-000000000004";
const eventId = "019fae8b-1234-7000-8000-000000000005";

const invalidation = {
  systemTags: [`project:${projectId}`, `environment:${environmentId}`],
  semanticTags: ["site:homepage"],
  routes: ["/"],
};

const commonEvent = {
  specversion: "1.0",
  id: eventId,
  source: `urn:framerfordevs:project:${projectId}:environment:${environmentId}`,
  subject: `cms.collection/${collectionId}`,
  time: "2026-08-13T12:34:56.789Z",
  datacontenttype: "application/json",
};

describe("webhook contracts", () => {
  it.effect("accepts bounded endpoint authority and normalizes human metadata", () =>
    Effect.gen(function* () {
      const decoded = yield* SchemaStrict.decodeUnknownEffect(CreateWebhookEndpointInput)({
        projectId,
        environmentId,
        name: "  Production rebuild  ",
        destination: "https://hooks.example.com/build/opaque?token=redacted",
        subscriptions: ["cms.entry.published", "cms.entry.unpublished"],
        authorityAcknowledged: true,
      });

      assert.strictEqual(decoded.name, "Production rebuild");
      assert.strictEqual(decoded.subscriptions.length, 2);
    }),
  );

  it.effect("rejects unsafe destination syntax before the DNS security service", () =>
    Effect.gen(function* () {
      const http = yield* Effect.exit(
        SchemaStrict.decodeUnknownEffect(WebhookDestinationUrl)("http://hooks.example.com/build"),
      );
      const customPort = yield* Effect.exit(
        SchemaStrict.decodeUnknownEffect(WebhookDestinationUrl)(
          "https://hooks.example.com:8443/build",
        ),
      );
      const credentials = yield* Effect.exit(
        SchemaStrict.decodeUnknownEffect(WebhookDestinationUrl)(
          "https://user:pass@hooks.example.com/build",
        ),
      );

      assert.isTrue(Exit.isFailure(http));
      assert.isTrue(Exit.isFailure(customPort));
      assert.isTrue(Exit.isFailure(credentials));
    }),
  );

  it.effect("rejects duplicate subscriptions, reserved semantic tags, and unsafe routes", () =>
    Effect.gen(function* () {
      const duplicateTypes = yield* Effect.exit(
        SchemaStrict.decodeUnknownEffect(WebhookEventTypes)([
          "cms.entry.published",
          "cms.entry.published",
        ]),
      );
      const reservedTag = yield* Effect.exit(
        SchemaStrict.decodeUnknownEffect(SemanticInvalidationTag)("entry:homepage"),
      );
      const traversal = yield* Effect.exit(
        SchemaStrict.decodeUnknownEffect(InvalidationRoutePath)("/posts/../admin"),
      );
      const query = yield* Effect.exit(
        SchemaStrict.decodeUnknownEffect(InvalidationRoutePath)("/posts?draft=true"),
      );
      const encodedTraversal = yield* Effect.exit(
        SchemaStrict.decodeUnknownEffect(InvalidationRoutePath)("/posts/%2e%2e/admin"),
      );
      const wildcard = yield* Effect.exit(
        SchemaStrict.decodeUnknownEffect(InvalidationRoutePath)("/posts/*"),
      );

      assert.isTrue(Exit.isFailure(duplicateTypes));
      assert.isTrue(Exit.isFailure(reservedTag));
      assert.isTrue(Exit.isFailure(traversal));
      assert.isTrue(Exit.isFailure(query));
      assert.isTrue(Exit.isFailure(encodedTraversal));
      assert.isTrue(Exit.isFailure(wildcard));
    }),
  );

  it.effect("accepts the recursive-schema field boundary and rejects one node above it", () =>
    Effect.gen(function* () {
      const fieldIds = Array.from(
        { length: 1_001 },
        (_, index) => `00000000-0000-4000-8000-${index.toString(16).padStart(12, "0")}`,
      );
      const acceptedChanges = yield* SchemaStrict.decodeUnknownEffect(WebhookChangeAuthority)({
        fieldIds: fieldIds.slice(0, 1_000),
      });
      const acceptedInvalidation = yield* SchemaStrict.decodeUnknownEffect(
        WebhookInvalidationAuthority,
      )({
        systemTags: fieldIds.slice(0, 1_000).map((id) => `field:${id}`),
        semanticTags: [],
        routes: [],
      });
      assert.strictEqual(acceptedChanges.fieldIds.length, 1_000);
      assert.strictEqual(acceptedInvalidation.systemTags.length, 1_000);
      assert.isTrue(
        Exit.isFailure(
          yield* Effect.exit(
            SchemaStrict.decodeUnknownEffect(WebhookChangeAuthority)({ fieldIds }),
          ),
        ),
      );
    }),
  );

  it.effect("keeps event type and event data as one discriminated authority", () =>
    Effect.gen(function* () {
      const valid = yield* SchemaStrict.decodeUnknownEffect(PublicationWebhookEvent)({
        ...commonEvent,
        type: "cms.schema.published",
        data: {
          version: 1,
          projectId,
          environmentId,
          collectionId,
          aggregate: { type: "cms.collection", id: collectionId, sequence: 3 },
          schema: {
            revisionId: schemaRevisionId,
            schemaHash: "a".repeat(64),
            contractHash: "b".repeat(64),
          },
          changes: { fieldIds: [] },
          invalidation,
        },
      });
      const mismatched = yield* Effect.exit(
        SchemaStrict.decodeUnknownEffect(PublicationWebhookEvent)({
          ...valid,
          type: "cms.entry.published",
        }),
      );

      assert.strictEqual(valid.type, "cms.schema.published");
      assert.isTrue(Exit.isFailure(mismatched));
    }),
  );

  it("converts every foundational management input and output for OpenAPI", () => {
    const converter = new EffectSchemaToJsonSchemaConverter();
    for (const schema of [
      CreateWebhookEndpointInputSchema,
      ListWebhookEndpointsInputSchema,
      GetWebhookEndpointInputSchema,
      UpdateWebhookEndpointInputSchema,
      SetWebhookEndpointStateInputSchema,
      ReplaceWebhookSubscriptionsInputSchema,
      StartWebhookSecretRotationInputSchema,
      ChangeWebhookSecretRotationInputSchema,
      CreateInvalidationRouteMappingInputSchema,
      UpdateInvalidationRouteMappingInputSchema,
      SetInvalidationRouteMappingStateInputSchema,
      ListInvalidationRouteMappingsInputSchema,
      ListWebhookDeliveriesInputSchema,
      ListWebhookAttemptsInputSchema,
      ReplayWebhookEventInputSchema,
    ]) {
      assert.doesNotThrow(() => converter.convert(schema, { strategy: "input" }));
    }
    for (const schema of [
      WebhookEndpointOutputSchema,
      IssuedWebhookEndpointOutputSchema,
      RotatedWebhookSecretOutputSchema,
      WebhookEndpointPageOutputSchema,
      InvalidationRouteMappingOutputSchema,
      WebhookDeliveryPageOutputSchema,
      WebhookAttemptPageOutputSchema,
      ReplayWebhookEventResultOutputSchema,
    ]) {
      assert.doesNotThrow(() => converter.convert(schema, { strategy: "output" }));
    }
  });
});
