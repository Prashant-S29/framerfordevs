import { assert, describe, it } from "@effect/vitest";
import { Schema } from "effect";

import { CollectionSourceKey, ProjectStructureManifestHash } from "../contracts/authoring";
import { computeSchemaPlanHash, validateCompleteProjectSchema } from "./authoring-schema-document";

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
            configuration: { maxLength: 160 },
          },
        ],
      },
    ],
  };
}

const postsSourceKey = Schema.decodeUnknownSync(CollectionSourceKey)("posts");
const pagesSourceKey = Schema.decodeUnknownSync(CollectionSourceKey)("pages");
const manifestHash = Schema.decodeUnknownSync(ProjectStructureManifestHash)("a".repeat(64));
const otherManifestHash = Schema.decodeUnknownSync(ProjectStructureManifestHash)("b".repeat(64));

describe("complete Authoring project schema documents", () => {
  it("returns a typed canonical document when every active collection is present", () => {
    const result = validateCompleteProjectSchema(project(), [postsSourceKey]);

    assert.isTrue(result.valid);
    if (result.valid) {
      assert.strictEqual(result.project.collections[0]?.sourceKey, "posts");
      assert.strictEqual(result.bytes, Buffer.byteLength(result.canonicalJson, "utf8"));
      assert.match(result.canonicalJson, /^\{"collections":/u);
    }
  });

  it("allows new collections but rejects omission of any active source identity", () => {
    const withNewCollection = project();
    withNewCollection.collections.push({
      sourceKey: "pages",
      apiKey: "pages",
      fields: [],
    });
    const accepted = validateCompleteProjectSchema(withNewCollection, [postsSourceKey]);
    const omitted = validateCompleteProjectSchema(project(), [postsSourceKey, pagesSourceKey]);

    assert.isTrue(accepted.valid);
    assert.isFalse(omitted.valid);
    if (!omitted.valid) {
      assert.deepStrictEqual(omitted.issues, [
        {
          path: "$.collections[sourceKey=pages]",
          code: "active_collection_omitted",
        },
      ]);
    }
  });

  it("rejects excess structural properties through the shared package validator", () => {
    const invalid = project();
    const collection = invalid.collections[0];
    if (!collection) throw new Error("Expected the project fixture collection.");
    const result = validateCompleteProjectSchema(
      {
        collections: [{ ...collection, displayName: "Posts" }],
      },
      [],
    );

    assert.isFalse(result.valid);
    if (!result.valid) {
      assert.include(
        result.issues.map((issue) => issue.code),
        "property_unknown",
      );
    }
  });

  it("binds deterministic plan hashes to both exact canonical bytes and current authority", () => {
    const first = validateCompleteProjectSchema(project(), [postsSourceKey]);
    const reorderedKeys = validateCompleteProjectSchema(
      {
        collections: [
          {
            fields: project().collections[0]?.fields,
            apiKey: "posts",
            sourceKey: "posts",
          },
        ],
      },
      [postsSourceKey],
    );
    if (!first.valid || !reorderedKeys.valid) throw new Error("Expected valid fixtures.");

    const firstHash = computeSchemaPlanHash(first.canonicalJson, manifestHash);
    const repeatedHash = computeSchemaPlanHash(reorderedKeys.canonicalJson, manifestHash);
    const staleAuthorityHash = computeSchemaPlanHash(first.canonicalJson, otherManifestHash);

    assert.strictEqual(firstHash, repeatedHash);
    assert.notStrictEqual(firstHash, staleAuthorityHash);
    assert.match(firstHash, /^[0-9a-f]{64}$/u);
  });
});
