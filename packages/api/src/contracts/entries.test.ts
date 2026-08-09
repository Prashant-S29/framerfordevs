// Verifies bounded M7 entry inputs, stable identities, conflict metadata, and OpenAPI conversion.

import { assert, describe, it } from "@effect/vitest";
import { Effect, Exit, Schema } from "effect";

import { ApiErrorDetail } from "./api-response";
import { EffectSchemaToJsonSchemaConverter } from "./effect-schema-converter";
import {
  CmsEntryDraftOutputSchema,
  CmsEntryOutputSchema,
  CmsEntryPageOutputSchema,
  CreateEntryInput,
  CreateEntryInputSchema,
  EntryCommandId,
  EntryDisplayName,
  EntryDraftVersion,
  EntryId,
  EntryRevisionPageOutputSchema,
  EntryValueMutation,
  ListEntriesInput,
  ListEntriesInputSchema,
  ListEntryRevisionsInputSchema,
  RenameEntryInput,
  RenameEntryInputSchema,
  RestoreEntryRevisionInputSchema,
  SaveEntryDraftInput,
  SaveEntryDraftInputSchema,
  SaveEntryDraftResultOutputSchema,
} from "./entries";

const projectId = "019fae8b-1234-7000-8000-000000000001";
const environmentId = "019fae8b-1234-7000-8000-000000000002";
const collectionId = "019fae8b-1234-7000-8000-000000000003";
const entryId = "019fae8b-1234-7000-8000-000000000004";
const schemaRevisionId = "019fae8b-1234-7000-8000-000000000005";
const fieldId = "019fae8b-1234-7000-8000-000000000006";
const commandId = "019fae8b-1234-7000-8000-000000000007";
const contractHash = "a".repeat(64);

const scope = {
  projectId,
  environmentId,
  collectionId,
  locale: "hi",
};

describe("entry contracts", () => {
  it.effect("brands entry identities and permits missing-head version zero", () =>
    Effect.gen(function* () {
      assert.strictEqual(yield* Schema.decodeUnknown(EntryId)(entryId), entryId);
      assert.strictEqual(yield* Schema.decodeUnknown(EntryCommandId)(commandId), commandId);
      assert.strictEqual(yield* Schema.decodeUnknown(EntryDraftVersion)(0), 0);
      assert.isTrue(
        Exit.isFailure(yield* Effect.exit(Schema.decodeUnknown(EntryDraftVersion)(-1))),
      );
    }),
  );

  it.effect("accepts bounded stable-path mutations for both draft partitions", () =>
    Effect.gen(function* () {
      const decoded = yield* Schema.decodeUnknown(SaveEntryDraftInput)({
        ...scope,
        entryId,
        schemaRevisionId,
        contractHash,
        commandId,
        expectedSharedVersion: 0,
        expectedLocalizedVersion: 0,
        sharedMutations: [{ operation: "set", path: [fieldId], value: "shared" }],
        localizedMutations: [
          { operation: "list_insert", path: [fieldId], index: 0, value: "localized" },
        ],
      });

      assert.strictEqual(decoded.sharedMutations.length, 1);
      assert.strictEqual(decoded.localizedMutations.length, 1);
    }),
  );

  it.effect("rejects malformed paths, list indexes, and unsupported mutation operations", () =>
    Effect.gen(function* () {
      const inputs = [
        { operation: "set", path: [], value: "x" },
        { operation: "set", path: [fieldId, 101], value: "x" },
        { operation: "list_remove", path: [fieldId], index: 100 },
        { operation: "merge", path: [fieldId], value: "x" },
      ];
      const exits = yield* Effect.forEach(inputs, (input) =>
        Effect.exit(Schema.decodeUnknown(EntryValueMutation)(input)),
      );

      assert.isTrue(exits.every(Exit.isFailure));
    }),
  );

  it.effect("retains the shared PageLimit ceiling for entries and revisions", () =>
    Effect.gen(function* () {
      const accepted = yield* Schema.decodeUnknown(ListEntriesInput)({
        ...scope,
        cursor: null,
        limit: 50,
      });
      const rejected = yield* Effect.exit(
        Schema.decodeUnknown(ListEntriesInput)({ ...scope, cursor: null, limit: 51 }),
      );

      assert.strictEqual(accepted.limit, 50);
      assert.isTrue(Exit.isFailure(rejected));
    }),
  );

  it.effect("rejects more than 500 mutations and oversized stable paths", () =>
    Effect.gen(function* () {
      const mutation = { operation: "unset", path: [fieldId] } as const;
      const tooMany = yield* Effect.exit(
        Schema.decodeUnknown(SaveEntryDraftInput)({
          ...scope,
          entryId,
          schemaRevisionId,
          contractHash,
          commandId,
          expectedSharedVersion: 0,
          expectedLocalizedVersion: 0,
          sharedMutations: Array.from({ length: 501 }, () => mutation),
          localizedMutations: [],
        }),
      );
      const tooDeep = yield* Effect.exit(
        Schema.decodeUnknown(EntryValueMutation)({
          operation: "unset",
          path: Array.from({ length: 17 }, () => fieldId),
        }),
      );

      assert.isTrue(Exit.isFailure(tooMany));
      assert.isTrue(Exit.isFailure(tooDeep));
    }),
  );

  it.effect("decodes create authority and structured draft-conflict metadata", () =>
    Effect.gen(function* () {
      const created = yield* Schema.decodeUnknown(CreateEntryInput)({
        ...scope,
        displayName: "  Homepage é  ",
        schemaRevisionId,
        contractHash,
        commandId,
      });
      const detail = yield* Schema.decodeUnknown(ApiErrorDetail)({
        path: "sharedVersion",
        code: "stale_shared_version",
        message: "The shared draft changed.",
        scope: "shared",
        expectedVersion: 1,
        currentVersion: 2,
        currentRevisionId: schemaRevisionId,
      });

      const renamed = yield* Schema.decodeUnknown(RenameEntryInput)({
        ...scope,
        entryId,
        displayName: "Homepage",
        expectedNameVersion: 1,
      });
      const invalidName = yield* Effect.exit(
        Schema.decodeUnknown(EntryDisplayName)("Bad\u0000name"),
      );

      assert.strictEqual(created.locale, "hi");
      assert.strictEqual(created.displayName, "Homepage é");
      assert.strictEqual(renamed.expectedNameVersion, 1);
      assert.isTrue(Exit.isFailure(invalidName));
      assert.strictEqual(detail.scope, "shared");
      assert.strictEqual(detail.currentVersion, 2);
    }),
  );

  it("converts every M7 input and output contract for OpenAPI", () => {
    const converter = new EffectSchemaToJsonSchemaConverter();
    const inputSchemas = [
      ListEntriesInputSchema,
      CreateEntryInputSchema,
      RenameEntryInputSchema,
      SaveEntryDraftInputSchema,
      ListEntryRevisionsInputSchema,
      RestoreEntryRevisionInputSchema,
    ];
    const outputSchemas = [
      CmsEntryOutputSchema,
      CmsEntryPageOutputSchema,
      CmsEntryDraftOutputSchema,
      SaveEntryDraftResultOutputSchema,
      EntryRevisionPageOutputSchema,
    ];

    for (const schema of inputSchemas) {
      assert.doesNotThrow(() => converter.convert(schema, { strategy: "input" }));
    }
    for (const schema of outputSchemas) {
      assert.doesNotThrow(() => converter.convert(schema, { strategy: "output" }));
    }
  });
});
