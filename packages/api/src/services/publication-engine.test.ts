// Verifies the replaceable publication engine delegates to the deterministic compiler.

import { assert, describe, it } from "@effect/vitest";
import { Effect, Schema } from "effect";

import { EntryValues } from "../contracts/entries";
import { CollectionFieldDefinition } from "../contracts/schemas";
import { PublicationEngine, PublicationEngineLive } from "./publication-engine";

const fieldId = "019fae8b-1234-7000-8000-000000000001";
const field = Schema.decodeUnknownSync(CollectionFieldDefinition)({
  id: fieldId,
  parentFieldId: null,
  nodeRole: "root",
  apiKey: "title",
  displayLabel: "Title",
  kind: "short_text",
  required: true,
  localization: "localized",
  deprecated: false,
  position: 0,
  editor: {
    helpText: null,
    placeholder: null,
    visibleToRoles: ["owner"],
    editableByRoles: ["owner"],
  },
  configuration: {},
  children: [],
});

const values = (value: unknown) => Schema.decodeUnknownSync(EntryValues)(value);

describe("PublicationEngine", () => {
  it.effect("compiles and compares immutable delivery roots through named operations", () =>
    Effect.gen(function* () {
      const engine = yield* PublicationEngine;
      const result = yield* engine.compile({
        fields: [field],
        sharedValues: values({}),
        localizedValues: values({ [fieldId]: "Hello" }),
        resolvedReferences: [],
        authority: {
          sharedRevisionId: null,
          sharedVersion: 0,
          localizedRevisionId: null,
          localizedVersion: 0,
        },
        document: {
          entryId: "019fae8b-1234-7000-8000-000000000002",
          collectionId: "019fae8b-1234-7000-8000-000000000003",
          locale: "en",
          schemaRevisionId: "019fae8b-1234-7000-8000-000000000004",
          contractHash: "a".repeat(64),
          publicationId: "019fae8b-1234-7000-8000-000000000005",
          publicationSequence: 1,
          publishedAt: "2026-08-09T12:00:00.000Z",
        },
      });
      const changed = yield* engine.changedFieldIds([field], { title: "Old" }, { title: "Hello" });

      assert.isTrue(result.valid);
      assert.deepEqual(result.candidate?.document.data, { title: "Hello" });
      assert.deepEqual(changed, [fieldId]);
    }).pipe(Effect.provide(PublicationEngineLive)),
  );
});
