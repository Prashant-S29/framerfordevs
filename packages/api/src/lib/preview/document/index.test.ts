// Verifies permissive Preview projection, explicit partition authority, role redaction, and exact sizing.

import { assert, describe, it } from "@effect/vitest";
import { Schema } from "effect";

import { EntryValues } from "../../../contracts/entry";
import {
  CollectionFieldDefinition,
  type CollectionFieldDefinition as CollectionField,
} from "../../../contracts/schema";
import { compilePreviewDocument, type CompilePreviewDocumentInput } from "./index";

const ids = {
  entry: "019fae8b-1234-7000-8000-000000000001",
  collection: "019fae8b-1234-7000-8000-000000000002",
  schema: "019fae8b-1234-7000-8000-000000000003",
  localizedRevision: "019fae8b-1234-7000-8000-000000000004",
  title: "019fae8b-1234-7000-8000-000000000005",
  secret: "019fae8b-1234-7000-8000-000000000006",
  details: "019fae8b-1234-7000-8000-000000000007",
  sku: "019fae8b-1234-7000-8000-000000000008",
  description: "019fae8b-1234-7000-8000-000000000009",
  tags: "019fae8b-1234-7000-8000-000000000010",
  tagItem: "019fae8b-1234-7000-8000-000000000011",
};

const allRoles = [
  "owner",
  "developer",
  "content_admin",
  "editor",
  "reviewer",
  "client_editor",
  "read_only",
];
const allEditor = {
  helpText: null,
  placeholder: null,
  visibleToRoles: allRoles,
  editableByRoles: allRoles,
};
const ownerEditor = {
  helpText: null,
  placeholder: null,
  visibleToRoles: ["owner"],
  editableByRoles: ["owner"],
};

/** Decodes strict recursive field fixtures through the production schema. */
function decodeField(value: unknown): CollectionField {
  return Schema.decodeUnknownSync(CollectionFieldDefinition)(value);
}

/** Builds a representative visible, hidden, and mixed-localization contract. */
function fields(): ReadonlyArray<CollectionField> {
  return [
    decodeField({
      id: ids.title,
      parentFieldId: null,
      nodeRole: "root",
      apiKey: "title",
      displayLabel: "Title",
      kind: "short_text",
      required: true,
      localization: "localized",
      deprecated: false,
      position: 0,
      editor: allEditor,
      configuration: {},
      children: [],
    }),
    decodeField({
      id: ids.secret,
      parentFieldId: null,
      nodeRole: "root",
      apiKey: "internal_notes",
      displayLabel: "Internal notes",
      kind: "short_text",
      required: true,
      localization: "shared",
      deprecated: false,
      position: 1,
      editor: ownerEditor,
      configuration: {},
      children: [],
    }),
    decodeField({
      id: ids.details,
      parentFieldId: null,
      nodeRole: "root",
      apiKey: "details",
      displayLabel: "Details",
      kind: "object",
      required: null,
      localization: "mixed",
      deprecated: false,
      position: 2,
      editor: allEditor,
      configuration: {},
      children: [
        {
          id: ids.sku,
          parentFieldId: ids.details,
          nodeRole: "object_property",
          apiKey: "sku",
          displayLabel: "SKU",
          kind: "short_text",
          required: false,
          localization: "shared",
          deprecated: false,
          position: 0,
          editor: allEditor,
          configuration: { default: "default-sku" },
          children: [],
        },
        {
          id: ids.description,
          parentFieldId: ids.details,
          nodeRole: "object_property",
          apiKey: "description",
          displayLabel: "Description",
          kind: "long_text",
          required: true,
          localization: "localized",
          deprecated: false,
          position: 1,
          editor: allEditor,
          configuration: {},
          children: [],
        },
      ],
    }),
  ];
}

/** Decodes stable-ID sparse fragments through the production EntryValues contract. */
function values(value: unknown) {
  return Schema.decodeUnknownSync(EntryValues)(value);
}

/** Creates a deterministic compiler input with overrideable role and partitions. */
function input(overrides: Partial<CompilePreviewDocumentInput> = {}): CompilePreviewDocumentInput {
  return {
    entryId: ids.entry,
    collectionId: ids.collection,
    collectionKey: "articles",
    locale: "gu",
    fields: fields(),
    sharedValues: values({
      [ids.secret]: 42,
      [ids.details]: {},
    }),
    localizedValues: values({
      [ids.details]: { [ids.description]: "Gujarati description" },
    }),
    authority: {
      source: "current",
      schemaRevisionId: ids.schema,
      contractHash: "a".repeat(64),
      sharedRevisionId: null,
      sharedVersion: 0,
      localizedRevisionId: ids.localizedRevision,
      localizedVersion: 3,
    },
    role: null,
    ...overrides,
  };
}

describe("Preview document compiler", () => {
  it("preserves safe invalid values, applies defaults, and returns deterministic issues", () => {
    const result = compilePreviewDocument(input());
    assert.isTrue(result.ok);
    if (!result.ok) return;
    assert.strictEqual(result.item.data.internal_notes, 42);
    assert.deepEqual(result.item.data.details, {
      sku: "default-sku",
      description: "Gujarati description",
    });
    assert.isFalse(result.item.validation.valid);
    assert.deepEqual(
      result.item.validation.issues.map((issue) => issue.code),
      ["required", "string_required"],
    );
  });

  it("removes hidden values and coalesces hidden issues for dashboard roles", () => {
    const result = compilePreviewDocument(input({ role: "read_only" }));
    assert.isTrue(result.ok);
    if (!result.ok) return;
    assert.isFalse(Object.hasOwn(result.item.data, "internal_notes"));
    const hidden = result.item.validation.issues.find(
      (issue) => issue.code === "hidden_field_invalid",
    );
    assert.deepEqual(hidden, {
      fieldId: null,
      path: "data",
      code: "hidden_field_invalid",
      message: "One or more hidden fields have validation issues.",
    });
    assert.notInclude(JSON.stringify(result.item.validation), "internal_notes");
    assert.notInclude(JSON.stringify(result.item.validation), ids.secret);
  });

  it("role-projects atomic list items without changing their renderer-neutral values", () => {
    const tags = decodeField({
      id: ids.tags,
      parentFieldId: null,
      nodeRole: "root",
      apiKey: "tags",
      displayLabel: "Tags",
      kind: "list",
      required: false,
      localization: "localized",
      deprecated: false,
      position: 0,
      editor: allEditor,
      configuration: { maxItems: 10 },
      children: [
        {
          id: ids.tagItem,
          parentFieldId: ids.tags,
          nodeRole: "list_item",
          apiKey: null,
          displayLabel: null,
          kind: "short_text",
          required: null,
          localization: null,
          deprecated: false,
          position: 0,
          editor: allEditor,
          configuration: {},
          children: [],
        },
      ],
    });
    const result = compilePreviewDocument(
      input({
        fields: [tags],
        sharedValues: values({}),
        localizedValues: values({ [ids.tags]: ["ગુજરાતી", "preview"] }),
        role: "read_only",
      }),
    );
    assert.isTrue(result.ok);
    if (result.ok) assert.deepEqual(result.item.data.tags, ["ગુજરાતી", "preview"]);

    const tagItem = tags.children[0];
    if (!tagItem) throw new Error("The list fixture requires one item field.");
    const hiddenItem = decodeField({
      ...tags,
      children: [{ ...tagItem, editor: ownerEditor }],
    });
    const hidden = compilePreviewDocument(
      input({
        fields: [hiddenItem],
        sharedValues: values({}),
        localizedValues: values({ [ids.tags]: ["secret"] }),
        role: "read_only",
      }),
    );
    assert.isTrue(hidden.ok);
    if (hidden.ok) assert.isFalse(Object.hasOwn(hidden.item.data, "tags"));
  });

  it("caps hard schema-definition failures before inspecting content", () => {
    const duplicates = Array.from({ length: 60 }, (_, index) =>
      decodeField({
        id: `019fae8b-1234-7000-8000-${String(100_000 + index).padStart(12, "0")}`,
        parentFieldId: null,
        nodeRole: "root",
        apiKey: "duplicate_key",
        displayLabel: `Duplicate ${index}`,
        kind: "short_text",
        required: false,
        localization: "shared",
        deprecated: false,
        position: index,
        editor: allEditor,
        configuration: {},
        children: [],
      }),
    );
    const result = compilePreviewDocument(input({ fields: duplicates }));
    assert.isFalse(result.ok);
    if (!result.ok) {
      assert.lengthOf(result.issues, 50);
      assert.isTrue(result.capped);
    }
  });

  it("caps soft validation issues while preserving the invalid Preview", () => {
    const requiredFields = Array.from({ length: 60 }, (_, index) =>
      decodeField({
        id: `019fae8b-1234-7000-8000-${String(200_000 + index).padStart(12, "0")}`,
        parentFieldId: null,
        nodeRole: "root",
        apiKey: `required_${index}`,
        displayLabel: `Required ${index}`,
        kind: "short_text",
        required: true,
        localization: "shared",
        deprecated: false,
        position: index,
        editor: allEditor,
        configuration: {},
        children: [],
      }),
    );
    const result = compilePreviewDocument(
      input({ fields: requiredFields, sharedValues: values({}), localizedValues: values({}) }),
    );
    assert.isTrue(result.ok);
    if (result.ok) {
      assert.lengthOf(result.item.validation.issues, 50);
      assert.isTrue(result.item.validation.capped);
    }
  });

  it("fails hard when both partitions claim one terminal field", () => {
    const result = compilePreviewDocument(
      input({ localizedValues: values({ [ids.secret]: "localized collision" }) }),
    );
    assert.isFalse(result.ok);
    if (result.ok) return;
    assert.strictEqual(result.issues[0]?.code, "entry_fragment_collision");
  });

  it("measures the exact success envelope bytes without truncation", () => {
    const result = compilePreviewDocument(input());
    assert.isTrue(result.ok);
    if (!result.ok) return;
    const bytes = new TextEncoder().encode(
      JSON.stringify({
        ok: true,
        data: result.item,
        error: null,
        message: "Preview entry loaded.",
      }),
    ).byteLength;
    assert.strictEqual(result.responseBytes, bytes);
  });
});
