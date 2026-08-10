// Verifies bounded M8 publication authority contracts and OpenAPI conversion.

import { assert, describe, it } from "@effect/vitest";
import { Effect, Exit, Schema } from "effect";

import { EffectSchemaToJsonSchemaConverter } from "./effect-schema-converter";
import {
  EntryPublicationHash,
  EntryPublicationPageOutputSchema,
  EntryPublicationPlanOutputSchema,
  EntryPublicationStateVersion,
  EntryPublicationStatusOutputSchema,
  GetEntryPublicationStatusInputSchema,
  ListEntryPublicationsInputSchema,
  PublishEntryInput,
  PublishEntryInputSchema,
  PublishEntryResultOutputSchema,
  UnpublishEntryInputSchema,
  UnpublishEntryResultOutputSchema,
  ValidateEntryPublicationInputSchema,
} from "./publications";

const scope = {
  projectId: "019fae8b-1234-7000-8000-000000000001",
  environmentId: "019fae8b-1234-7000-8000-000000000002",
  collectionId: "019fae8b-1234-7000-8000-000000000003",
  entryId: "019fae8b-1234-7000-8000-000000000004",
  locale: "hi",
};

describe("publication contracts", () => {
  it.effect("accepts exact authority and rejects malformed hashes or negative state versions", () =>
    Effect.gen(function* () {
      const input = yield* Schema.decodeUnknown(PublishEntryInput)({
        ...scope,
        commandId: "019fae8b-1234-7000-8000-000000000005",
        authorityHash: "a".repeat(64),
        expectedStateVersion: 0,
        expectedPublicationId: null,
        expectedSchemaRevisionId: "019fae8b-1234-7000-8000-000000000006",
        expectedContractHash: "b".repeat(64),
        expectedSharedVersion: 0,
        expectedSharedRevisionId: null,
        expectedLocalizedVersion: 2,
        expectedLocalizedRevisionId: "019fae8b-1234-7000-8000-000000000007",
      });
      const invalidHash = yield* Effect.exit(Schema.decodeUnknown(EntryPublicationHash)("short"));
      const invalidVersion = yield* Effect.exit(
        Schema.decodeUnknown(EntryPublicationStateVersion)(-1),
      );

      assert.strictEqual(input.locale, "hi");
      assert.strictEqual(input.expectedStateVersion, 0);
      assert.isTrue(Exit.isFailure(invalidHash));
      assert.isTrue(Exit.isFailure(invalidVersion));
    }),
  );

  it("converts every M8 management input and output contract for OpenAPI", () => {
    const converter = new EffectSchemaToJsonSchemaConverter();
    for (const schema of [
      GetEntryPublicationStatusInputSchema,
      ValidateEntryPublicationInputSchema,
      PublishEntryInputSchema,
      UnpublishEntryInputSchema,
      ListEntryPublicationsInputSchema,
    ]) {
      assert.doesNotThrow(() => converter.convert(schema, { strategy: "input" }));
    }
    for (const schema of [
      EntryPublicationStatusOutputSchema,
      EntryPublicationPlanOutputSchema,
      PublishEntryResultOutputSchema,
      UnpublishEntryResultOutputSchema,
      EntryPublicationPageOutputSchema,
    ]) {
      assert.doesNotThrow(() => converter.convert(schema, { strategy: "output" }));
    }
  });
});
