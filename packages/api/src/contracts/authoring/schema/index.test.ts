import { assert, describe, it } from "@effect/vitest";
import { Effect, Exit, Schema } from "effect";

import {
  AcknowledgedAuthoringSchemaChangeIds,
  AuthoringProjectSchemaDocument,
  AuthoringSchemaCandidate,
  AuthoringSchemaPlan,
  AuthoringSchemaPlanRequest,
} from "./index";

const collectionId = "019fae8b-1234-7000-8000-000000000301";
const revisionId = "019fae8b-1234-7000-8000-000000000302";
const structureHash = "a".repeat(64);
const contractHash = "b".repeat(64);
const manifestHash = "c".repeat(64);
const planHash = "d".repeat(64);

const current = {
  projectManifestHash: manifestHash,
  revisionIds: { posts: revisionId },
};

function project() {
  return {
    collections: [
      {
        sourceKey: "posts",
        apiKey: "posts",
        fields: [
          {
            sourceKey: "title",
            apiKey: "title",
            kind: "short_text",
            required: true,
            localization: "localized",
            configuration: {},
          },
        ],
      },
    ],
  };
}

describe("Authoring schema plan/apply contracts", () => {
  it.effect("uses the complete shared project validator at the public contract boundary", () =>
    Effect.gen(function* () {
      const accepted = yield* Schema.decodeUnknown(AuthoringProjectSchemaDocument)(project());
      const excess = yield* Effect.exit(
        Schema.decodeUnknown(AuthoringProjectSchemaDocument)({
          collections: [{ ...project().collections[0], displayName: "Posts" }],
        }),
      );

      assert.strictEqual(accepted.collections[0]?.sourceKey, "posts");
      assert.isTrue(Exit.isFailure(excess));
    }),
  );

  it.effect("rejects internal scope and excess properties in the public plan body", () =>
    Effect.gen(function* () {
      const accepted = yield* Schema.decodeUnknown(AuthoringSchemaPlanRequest)({
        project: project(),
      });
      const excess = yield* Effect.exit(
        Schema.decodeUnknown(AuthoringSchemaPlanRequest)({
          project: project(),
          workspaceId: "internal",
        }),
      );

      assert.strictEqual(accepted.project.collections[0]?.sourceKey, "posts");
      assert.isTrue(Exit.isFailure(excess));
    }),
  );

  it.effect("requires an always-present null candidateStructureHash for unallocated IDs", () =>
    Effect.gen(function* () {
      const candidate = {
        collectionSourceKey: "posts",
        collectionId: null,
        currentRevisionId: null,
        containsUnallocatedIdentities: true,
        candidateStructureHash: null,
        candidateContractHash: null,
      };
      const accepted = yield* Schema.decodeUnknown(AuthoringSchemaCandidate)(candidate);
      const omitted = yield* Effect.exit(
        Schema.decodeUnknown(AuthoringSchemaCandidate)(
          Object.fromEntries(
            Object.entries(candidate).filter(([key]) => key !== "candidateStructureHash"),
          ),
        ),
      );
      const falseHash = yield* Effect.exit(
        Schema.decodeUnknown(AuthoringSchemaCandidate)({
          ...candidate,
          candidateStructureHash: structureHash,
        }),
      );

      assert.strictEqual(accepted.candidateStructureHash, null);
      assert.isTrue(Exit.isFailure(omitted));
      assert.isTrue(Exit.isFailure(falseHash));
    }),
  );

  it.effect("requires a real candidate hash when every identity is allocated", () =>
    Effect.gen(function* () {
      const accepted = yield* Schema.decodeUnknown(AuthoringSchemaCandidate)({
        collectionSourceKey: "posts",
        collectionId,
        currentRevisionId: revisionId,
        containsUnallocatedIdentities: false,
        candidateStructureHash: structureHash,
        candidateContractHash: contractHash,
      });
      const missingHash = yield* Effect.exit(
        Schema.decodeUnknown(AuthoringSchemaCandidate)({
          ...accepted,
          candidateStructureHash: null,
        }),
      );

      assert.strictEqual(accepted.candidateStructureHash, structureHash);
      assert.isTrue(Exit.isFailure(missingHash));
    }),
  );

  it.effect("correlates valid plans with a plan hash and invalid plans with explicit issues", () =>
    Effect.gen(function* () {
      const valid = yield* Schema.decodeUnknown(AuthoringSchemaPlan)({
        valid: true,
        current,
        planHash,
        issues: [],
        changes: [],
        candidates: [],
      });
      const invalid = yield* Schema.decodeUnknown(AuthoringSchemaPlan)({
        valid: false,
        current,
        planHash: null,
        issues: [{ path: "$.collections", code: "schema_invalid", message: "Invalid schema." }],
        changes: [],
        candidates: [],
      });
      const ambiguous = yield* Effect.exit(
        Schema.decodeUnknown(AuthoringSchemaPlan)({
          valid: true,
          current,
          planHash: null,
          issues: [],
          changes: [],
          candidates: [],
        }),
      );

      assert.strictEqual(valid.planHash, planHash);
      assert.strictEqual(invalid.planHash, null);
      assert.isTrue(Exit.isFailure(ambiguous));
    }),
  );

  it.effect("rejects duplicate risky-change acknowledgements", () =>
    Effect.gen(function* () {
      const changeId = "e".repeat(64);
      const unique = yield* Schema.decodeUnknown(AcknowledgedAuthoringSchemaChangeIds)([changeId]);
      const duplicate = yield* Effect.exit(
        Schema.decodeUnknown(AcknowledgedAuthoringSchemaChangeIds)([changeId, changeId]),
      );

      assert.strictEqual(unique[0], changeId);
      assert.isTrue(Exit.isFailure(duplicate));
    }),
  );
});
