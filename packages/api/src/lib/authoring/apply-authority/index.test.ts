import { assert, describe, it } from "@effect/vitest";
import { Schema } from "effect";

import {
  AuthoringSchemaAuthority,
  CmsActor,
  CollectionSourceKey,
  ProjectStructureManifestHash,
  SchemaApplyCommandId,
  SchemaPlanHash,
} from "../../../contracts/authoring";
import { AcknowledgedAuthoringSchemaChangeIds } from "../../../contracts/authoring/schema";
import { ApiCredentialId } from "../../../contracts/access";
import { AuthUserId, EnvironmentId, ProjectId } from "../../../contracts/platform";
import {
  CollectionFieldId,
  SchemaChange,
  SchemaChangeId,
  SchemaChangeSet,
  SchemaRevisionId,
} from "../../../contracts/schema";
import {
  fingerprintAuthoringSchemaApply,
  hasExactProjectSchemaAcknowledgements,
  qualifyProjectSchemaChanges,
} from "./index";

const fieldId = CollectionFieldId.make("019fae8b-1234-7000-8000-000000000701");
const collectionChangeId = SchemaChangeId.make("a".repeat(64));

function changeSet(changeId = collectionChangeId) {
  return SchemaChangeSet.make({
    items: [
      SchemaChange.make({
        changeId,
        code: "field.required.enabled",
        classification: "breaking",
        fieldId,
        summary: "A field became required.",
      }),
    ],
    nonBreakingCount: 0,
    potentiallyBreakingCount: 0,
    breakingCount: 1,
    requiresAcknowledgement: true,
  });
}

describe("Authoring project apply authority", () => {
  it("qualifies collection change IDs so identical collection-local changes cannot collide", () => {
    const fields = new Map([[fieldId, "title"]]);
    const posts = qualifyProjectSchemaChanges("posts", changeSet(), fields);
    const pages = qualifyProjectSchemaChanges("pages", changeSet(), fields);
    const afterAllocation = qualifyProjectSchemaChanges(
      "posts",
      changeSet(SchemaChangeId.make("b".repeat(64))),
      fields,
    );

    assert.isTrue(posts.valid);
    assert.isTrue(pages.valid);
    assert.isTrue(afterAllocation.valid);
    if (posts.valid && pages.valid && afterAllocation.valid) {
      assert.notStrictEqual(posts.changes[0]?.changeId, pages.changes[0]?.changeId);
      assert.strictEqual(posts.changes[0]?.changeId, afterAllocation.changes[0]?.changeId);
      assert.strictEqual(posts.changes[0]?.fieldSourceKey, "title");
      assert.strictEqual(posts.changes[0]?.collectionSourceKey, "posts");
    }
  });

  it("requires exactly all risky project change IDs with no missing or extra acknowledgement", () => {
    const qualified = qualifyProjectSchemaChanges(
      "posts",
      changeSet(),
      new Map([[fieldId, "title"]]),
    );
    if (!qualified.valid) throw new Error("Expected qualified changes.");
    const changeId = qualified.changes[0]?.changeId;
    if (!changeId) throw new Error("Expected one qualified change.");
    const exact = Schema.decodeUnknownSync(AcknowledgedAuthoringSchemaChangeIds)([changeId]);
    const missing = Schema.decodeUnknownSync(AcknowledgedAuthoringSchemaChangeIds)([]);
    const extra = Schema.decodeUnknownSync(AcknowledgedAuthoringSchemaChangeIds)([
      changeId,
      SchemaChangeId.make("b".repeat(64)),
    ]);

    assert.isTrue(hasExactProjectSchemaAcknowledgements(qualified.changes, exact));
    assert.isFalse(hasExactProjectSchemaAcknowledgements(qualified.changes, missing));
    assert.isFalse(hasExactProjectSchemaAcknowledgements(qualified.changes, extra));
  });

  it("fails qualification when a stable field cannot resolve back to its source identity", () => {
    const result = qualifyProjectSchemaChanges("posts", changeSet(), new Map());

    assert.isFalse(result.valid);
    if (!result.valid) assert.strictEqual(result.issues[0]?.code, "source_identity_missing");
  });

  it("fingerprints actual actor identity and canonical acknowledgement authority", () => {
    const projectId = ProjectId.make("019fae8b-1234-7000-8000-000000000702");
    const environmentId = EnvironmentId.make("019fae8b-1234-7000-8000-000000000703");
    const commandId = SchemaApplyCommandId.make("019fae8b-1234-7000-8000-000000000704");
    const postsSourceKey = CollectionSourceKey.make("posts");
    const expectedCurrent = AuthoringSchemaAuthority.make({
      projectManifestHash: ProjectStructureManifestHash.make("c".repeat(64)),
      revisionIds: {
        [postsSourceKey]: SchemaRevisionId.make("019fae8b-1234-7000-8000-000000000705"),
      },
    });
    const expectedPlanHash = SchemaPlanHash.make("d".repeat(64));
    const firstChange = SchemaChangeId.make("e".repeat(64));
    const secondChange = SchemaChangeId.make("f".repeat(64));
    const forward = Schema.decodeUnknownSync(AcknowledgedAuthoringSchemaChangeIds)([
      firstChange,
      secondChange,
    ]);
    const reversed = Schema.decodeUnknownSync(AcknowledgedAuthoringSchemaChangeIds)([
      secondChange,
      firstChange,
    ]);
    const user = Schema.decodeUnknownSync(CmsActor)({
      kind: "user",
      id: AuthUserId.make("user-apply"),
    });
    const credential = Schema.decodeUnknownSync(CmsActor)({
      kind: "credential",
      id: ApiCredentialId.make("019fae8b-1234-7000-8000-000000000706"),
    });
    const options = {
      projectId,
      environmentId,
      commandId,
      canonicalProjectJson: '{"collections":[]}',
      expectedCurrent,
      expectedPlanHash,
      acknowledgedChangeIds: forward,
    } as const;
    const first = fingerprintAuthoringSchemaApply({ ...options, actor: user });
    const reordered = fingerprintAuthoringSchemaApply({
      ...options,
      actor: user,
      acknowledgedChangeIds: reversed,
    });
    const otherActor = fingerprintAuthoringSchemaApply({ ...options, actor: credential });

    assert.strictEqual(first, reordered);
    assert.notStrictEqual(first, otherActor);
    assert.match(first, /^[0-9a-f]{64}$/u);
  });
});
