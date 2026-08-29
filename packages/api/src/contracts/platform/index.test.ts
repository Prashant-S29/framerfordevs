import { assert, describe, it } from "@effect/vitest";
import { Effect, Exit, Schema } from "effect";

import { EffectSchemaToJsonSchemaConverter } from "../response/effect-schema-converter";
import {
  decodeProjectCursor,
  decodeWorkspaceCursor,
  encodeProjectCursor,
  encodeWorkspaceCursor,
} from "../cursor";
import {
  CreateProjectInput,
  CreateWorkspaceInput,
  CreateWorkspaceInputSchema,
  Cursor,
  IsoDateTime,
  ProjectId,
  ProjectKey,
  ProjectName,
  WorkspaceId,
  WorkspaceMembershipId,
  WorkspaceName,
} from "./index";

const workspaceId = Schema.decodeUnknownSync(WorkspaceId)("019fae8b-1234-7000-8000-000000000001");
const membershipId = Schema.decodeUnknownSync(WorkspaceMembershipId)(
  "019fae8b-1234-7000-8000-000000000002",
);
const projectId = Schema.decodeUnknownSync(ProjectId)("019fae8b-1234-7000-8000-000000000003");
const createdAt = "2026-07-29T12:00:00.000Z";

describe("platform contracts", () => {
  it.effect("normalizes trimmed Unicode workspace and project names", () =>
    Effect.gen(function* () {
      const workspace = yield* Schema.decodeUnknown(CreateWorkspaceInput)({
        name: "  Cafe\u0301  ",
      });
      const project = yield* Schema.decodeUnknown(CreateProjectInput)({
        workspaceId,
        name: "  Product Site  ",
        key: "product-site",
        description: "  Main website  ",
      });

      assert.strictEqual(workspace.name, "Café");
      assert.strictEqual(project.name, "Product Site");
      assert.strictEqual(project.description, "Main website");
    }),
  );

  it.effect("rejects empty, oversized, and control-character names", () =>
    Effect.gen(function* () {
      const values = ["   ", "x".repeat(101), "unsafe\nname"];
      const exits = yield* Effect.forEach(values, (name) =>
        Effect.exit(Schema.decodeUnknown(WorkspaceName)(name)),
      );

      assert.isTrue(exits.every(Exit.isFailure));
    }),
  );

  it.effect("accepts bounded lowercase project keys and rejects ambiguous forms", () =>
    Effect.gen(function* () {
      const valid = ["a", "site-2", "product-docs"];
      const invalid = ["Site", "-site", "site-", "site--docs", "site_docs", "x".repeat(64)];

      const validExits = yield* Effect.forEach(valid, (key) =>
        Effect.exit(Schema.decodeUnknown(ProjectKey)(key)),
      );
      const invalidExits = yield* Effect.forEach(invalid, (key) =>
        Effect.exit(Schema.decodeUnknown(ProjectKey)(key)),
      );

      assert.isTrue(validExits.every(Exit.isSuccess));
      assert.isTrue(invalidExits.every(Exit.isFailure));
    }),
  );

  it.effect("rejects malformed branded IDs and timestamps", () =>
    Effect.gen(function* () {
      const invalidWorkspace = yield* Effect.exit(Schema.decodeUnknown(WorkspaceId)("workspace-1"));
      const invalidProject = yield* Effect.exit(Schema.decodeUnknown(ProjectId)(workspaceId));
      const invalidTimestamp = yield* Effect.exit(
        Schema.decodeUnknown(IsoDateTime)("2026-07-29T12:00:00+05:30"),
      );

      assert.isTrue(Exit.isFailure(invalidWorkspace));
      assert.isTrue(Exit.isSuccess(invalidProject));
      assert.isTrue(Exit.isFailure(invalidTimestamp));
    }),
  );

  it("converts Effect transport schemas into OpenAPI-compatible JSON Schema", async () => {
    const converter = new EffectSchemaToJsonSchemaConverter();

    assert.isTrue(await converter.condition(CreateWorkspaceInputSchema));
    const [required, jsonSchema] = await converter.convert(CreateWorkspaceInputSchema, {
      strategy: "input",
    });

    assert.isTrue(required);
    assert.include(JSON.stringify(jsonSchema), "properties");
    assert.include(JSON.stringify(jsonSchema), "name");
    assert.isFalse(await converter.condition(undefined));
    assert.throws(() => converter.convert(undefined, { strategy: "input" }));
  });

  it.effect.prop(
    "normalizes every accepted project name idempotently",
    [Schema.String],
    ([value]) =>
      Effect.gen(function* () {
        const first = yield* Effect.option(Schema.decodeUnknown(ProjectName)(value));
        if (first._tag === "Some") {
          const second = yield* Schema.decodeUnknown(ProjectName)(first.value);
          assert.strictEqual(second, first.value);
        }
      }),
  );
});

describe("platform cursor contracts", () => {
  it.effect("round trips workspace cursors", () =>
    Effect.gen(function* () {
      const cursor = yield* encodeWorkspaceCursor({ createdAt, membershipId });
      const decoded = yield* decodeWorkspaceCursor(cursor);

      assert.strictEqual(decoded.createdAt, createdAt);
      assert.strictEqual(decoded.membershipId, membershipId);
    }),
  );

  it.effect("round trips project cursors and binds them to the list filter", () =>
    Effect.gen(function* () {
      const cursor = yield* encodeProjectCursor({
        status: "active",
        sortAt: createdAt,
        projectId,
      });
      const decoded = yield* decodeProjectCursor(cursor, "active");
      const mismatched = yield* Effect.exit(decodeProjectCursor(cursor, "archived"));

      assert.strictEqual(decoded.projectId, projectId);
      assert.isTrue(Exit.isFailure(mismatched));
    }),
  );

  it.effect("rejects malformed, wrong-kind, and oversized cursor values", () =>
    Effect.gen(function* () {
      const malformed = yield* Schema.decodeUnknown(Cursor)("bm90LWpzb24");
      const projectCursor = yield* encodeProjectCursor({
        status: "active",
        sortAt: createdAt,
        projectId,
      });
      const malformedExit = yield* Effect.exit(decodeWorkspaceCursor(malformed));
      const wrongKindExit = yield* Effect.exit(decodeWorkspaceCursor(projectCursor));
      const oversizedExit = yield* Effect.exit(Schema.decodeUnknown(Cursor)("a".repeat(513)));

      assert.isTrue(Exit.isFailure(malformedExit));
      assert.isTrue(Exit.isFailure(wrongKindExit));
      assert.isTrue(Exit.isFailure(oversizedExit));
    }),
  );
});
