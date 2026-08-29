import { assert, describe, it } from "@effect/vitest";
import { Schema } from "effect";

import { EditorLayout } from "../../../contracts/field";
import { CollectionFieldDefinition, ContractHash } from "../../../contracts/schema";
import { generatedFormDefinition } from "./index";

const visibleId = "019fae8b-1234-7000-8000-000000000001";
const hiddenId = "019fae8b-1234-7000-8000-000000000002";
const visibleRoles = ["owner", "developer"] as const;

function field(id: string, apiKey: string, roles: ReadonlyArray<"owner" | "developer">) {
  return Schema.decodeUnknownSync(CollectionFieldDefinition)({
    id,
    parentFieldId: null,
    nodeRole: "root",
    apiKey,
    displayLabel: apiKey === "title" ? "Title" : "Secret",
    kind: "short_text",
    required: false,
    localization: "localized",
    deprecated: false,
    position: apiKey === "title" ? 0 : 1,
    editor: {
      helpText: null,
      placeholder: null,
      visibleToRoles: roles,
      editableByRoles: roles,
    },
    configuration: {},
    children: [],
  });
}

const layout = Schema.decodeUnknownSync(EditorLayout)({
  version: 1,
  tabs: [
    {
      id: "019fae8b-1234-7000-8000-000000000003",
      title: "Content",
      description: null,
      position: 0,
      visibleToRoles: visibleRoles,
      groups: [
        {
          id: "019fae8b-1234-7000-8000-000000000004",
          title: "Main",
          description: null,
          position: 0,
          columns: 1,
          visibleToRoles: visibleRoles,
          fields: [
            {
              id: "019fae8b-1234-7000-8000-000000000005",
              fieldId: visibleId,
              position: 0,
              helpTextOverride: null,
              visibleToRoles: visibleRoles,
            },
          ],
        },
      ],
    },
  ],
  sidebarGroups: [
    {
      id: "019fae8b-1234-7000-8000-000000000006",
      title: "Internal",
      description: null,
      position: 0,
      columns: 1,
      visibleToRoles: visibleRoles,
      fields: [
        {
          id: "019fae8b-1234-7000-8000-000000000007",
          fieldId: hiddenId,
          position: 0,
          helpTextOverride: null,
          visibleToRoles: visibleRoles,
        },
      ],
    },
  ],
});

describe("generated form definition", () => {
  it("removes hidden fields and placements while preserving projected sidebar authority", () => {
    const form = generatedFormDefinition({
      source: "published",
      collectionId: "019fae8b-1234-7000-8000-000000000010",
      revisionId: "019fae8b-1234-7000-8000-000000000011",
      formatVersion: 2,
      validationProfile: "ffd-fields@1",
      currencyRegistryProfile: null,
      contractHash: ContractHash.make("a".repeat(64)),
      role: "developer",
      canEdit: true,
      fields: [field(visibleId, "title", visibleRoles), field(hiddenId, "secret", ["owner"])],
      editorLayout: layout,
    });

    assert.deepStrictEqual(
      form.fields.map((item) => item.id),
      [visibleId],
    );
    assert.lengthOf(form.editableFieldIds, 1);
    assert.strictEqual(form.editableFieldIds[0], visibleId);
    assert.strictEqual(form.editorLayout.tabs[0]?.groups[0]?.fields[0]?.fieldId, visibleId);
    assert.deepStrictEqual(form.editorLayout.sidebarGroups[0]?.fields, []);
    assert.notInclude(JSON.stringify(form), "secret");
  });
});
