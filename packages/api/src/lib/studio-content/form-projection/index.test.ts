import { assert, describe, it } from "@effect/vitest";
import { Schema } from "effect";

import { EditorLayout } from "../../../contracts/field";
import {
  CollectionFieldDefinition,
  CollectionFieldId,
  ContractHash,
  GeneratedFormDefinition,
} from "../../../contracts/schema";
import { projectStudioForm, projectStudioValues } from ".";

const fieldId = CollectionFieldId.make("019fae8b-1234-7000-8000-000000000001");
const unplacedFieldId = CollectionFieldId.make("019fae8b-1234-7000-8000-000000000007");
const readOnlyFieldId = CollectionFieldId.make("019fae8b-1234-7000-8000-000000000008");
const invalidPlacementFieldId = CollectionFieldId.make("019fae8b-1234-7000-8000-000000000018");
const roles = ["owner", "developer"] as const;

describe("Studio form projection", () => {
  it("keeps stable editing authority while removing source keys and role arrays", () => {
    const field = Schema.decodeUnknownSync(CollectionFieldDefinition)({
      id: fieldId,
      parentFieldId: null,
      nodeRole: "root",
      apiKey: "secret_source_key",
      displayLabel: "Title",
      kind: "short_text",
      required: false,
      localization: "localized",
      deprecated: false,
      position: 0,
      editor: {
        helpText: "Visible help",
        placeholder: "Visible placeholder",
        visibleToRoles: roles,
        editableByRoles: roles,
      },
      configuration: { maxLength: 100 },
      children: [],
    });
    const unplacedField = Schema.decodeUnknownSync(CollectionFieldDefinition)({
      ...field,
      id: unplacedFieldId,
      apiKey: "unplaced_source_key",
      displayLabel: "Unplaced",
      position: 1,
    });
    const readOnlyField = Schema.decodeUnknownSync(CollectionFieldDefinition)({
      ...field,
      id: readOnlyFieldId,
      apiKey: "read_only_source_key",
      displayLabel: "Read only",
      position: 2,
      editor: { ...field.editor, editableByRoles: [] },
    });
    const layout = Schema.decodeUnknownSync(EditorLayout)({
      version: 1,
      tabs: [
        {
          id: "019fae8b-1234-7000-8000-000000000002",
          title: "Content",
          description: null,
          position: 0,
          visibleToRoles: roles,
          groups: [
            {
              id: "019fae8b-1234-7000-8000-000000000003",
              title: "Main",
              description: null,
              position: 0,
              columns: 1,
              visibleToRoles: roles,
              fields: [
                {
                  id: "019fae8b-1234-7000-8000-000000000004",
                  fieldId,
                  position: 0,
                  helpTextOverride: null,
                  visibleToRoles: roles,
                },
                {
                  id: "019fae8b-1234-7000-8000-000000000009",
                  fieldId: readOnlyFieldId,
                  position: 1,
                  helpTextOverride: null,
                  visibleToRoles: roles,
                },
              ],
            },
            {
              id: "019fae8b-1234-7000-8000-000000000010",
              title: "Invalid duplicate placements",
              description: null,
              position: 1,
              columns: 1,
              visibleToRoles: roles,
              fields: [
                {
                  id: "019fae8b-1234-7000-8000-000000000011",
                  fieldId,
                  position: 0,
                  helpTextOverride: null,
                  visibleToRoles: roles,
                },
                {
                  id: "019fae8b-1234-7000-8000-000000000012",
                  fieldId: invalidPlacementFieldId,
                  position: 1,
                  helpTextOverride: null,
                  visibleToRoles: roles,
                },
              ],
            },
          ],
        },
        {
          id: "019fae8b-1234-7000-8000-000000000013",
          title: "Hidden tab",
          description: null,
          position: 1,
          visibleToRoles: ["developer"],
          groups: [
            {
              id: "019fae8b-1234-7000-8000-000000000014",
              title: "Invalid",
              description: null,
              position: 0,
              columns: 1,
              visibleToRoles: roles,
              fields: [
                {
                  id: "019fae8b-1234-7000-8000-000000000015",
                  fieldId: unplacedFieldId,
                  position: 0,
                  helpTextOverride: null,
                  visibleToRoles: roles,
                },
              ],
            },
          ],
        },
      ],
      sidebarGroups: [
        {
          id: "019fae8b-1234-7000-8000-000000000016",
          title: "Invalid sidebar",
          description: null,
          position: 0,
          columns: 1,
          visibleToRoles: roles,
          fields: [
            {
              id: "019fae8b-1234-7000-8000-000000000017",
              fieldId: invalidPlacementFieldId,
              position: 0,
              helpTextOverride: null,
              visibleToRoles: roles,
            },
          ],
        },
      ],
    });
    const form = Schema.decodeUnknownSync(GeneratedFormDefinition)({
      source: "published",
      collectionId: "019fae8b-1234-7000-8000-000000000005",
      revisionId: "019fae8b-1234-7000-8000-000000000006",
      formatVersion: 2,
      validationProfile: "field-system@1",
      currencyRegistryProfile: "iso-4217@2026-01-01",
      contractHash: ContractHash.make("a".repeat(64)),
      role: "owner",
      canEdit: true,
      fields: [field, unplacedField, readOnlyField],
      editableFieldIds: [fieldId, unplacedFieldId],
      editorLayout: layout,
      currencyMinorUnits: {},
    });

    const projected = projectStudioForm(form);
    const serialized = JSON.stringify(projected);
    assert.strictEqual(projected.fields[0]?.id, fieldId);
    assert.strictEqual(projected.fields[0]?.helpText, "Visible help");
    assert.deepStrictEqual(projected.editableFieldIds, [fieldId]);
    assert.deepStrictEqual(
      projected.fields.map(({ id }) => id),
      [fieldId, readOnlyFieldId],
    );
    assert.strictEqual(projected.tabs.length, 1);
    assert.strictEqual(projected.tabs[0]?.groups.length, 1);
    assert.strictEqual(projected.tabs[0]?.groups[0]?.fields.length, 2);
    assert.deepStrictEqual(projected.sidebarGroups, []);
    assert.notInclude(serialized, unplacedFieldId);
    assert.notInclude(serialized, "secret_source_key");
    assert.notInclude(serialized, "visibleToRoles");
    assert.notInclude(serialized, "editableByRoles");
    assert.notInclude(serialized, '"role"');
    assert.notInclude(serialized, '"source"');

    const values = projectStudioValues(
      { [fieldId]: "visible", [unplacedFieldId]: "must-not-leak" },
      projected.fields,
    );
    assert.deepStrictEqual(values, { [fieldId]: "visible" });
  });

  it("projects all 18 field kinds without source or role authority", () => {
    const kinds = [
      "short_text",
      "long_text",
      "rich_text",
      "number",
      "decimal",
      "money",
      "boolean",
      "date",
      "date_time",
      "enum",
      "url",
      "email",
      "slug",
      "json",
      "object",
      "list",
      "reference",
      "external_asset",
    ] as const;
    const id = (index: number) => `019fae8b-1234-7000-8000-${String(index).padStart(12, "0")}`;
    const configuration = (kind: (typeof kinds)[number]): unknown => {
      if (kind === "money") return { currencies: ["USD"] };
      if (kind === "enum") {
        return {
          options: [{ id: id(90), value: "draft", label: "Draft", position: 0 }],
        };
      }
      if (kind === "reference") return { targetCollectionId: id(91) };
      return {};
    };
    const fields = kinds.map((kind, index) => {
      const rootId = id(index + 20);
      const children =
        kind === "object" || kind === "list"
          ? [
              {
                id: id(index + 60),
                parentFieldId: rootId,
                nodeRole: kind === "object" ? "object_property" : "list_item",
                apiKey: kind === "object" ? "hidden_child" : null,
                displayLabel: kind === "object" ? "Hidden child" : null,
                kind: "short_text",
                required: null,
                localization: kind === "object" ? "localized" : null,
                deprecated: false,
                position: 0,
                editor: {
                  helpText: null,
                  placeholder: null,
                  visibleToRoles: kind === "object" ? ["owner"] : roles,
                  editableByRoles: kind === "object" ? ["owner"] : roles,
                },
                configuration: {},
                children: [],
              },
              ...(kind === "object"
                ? [
                    {
                      id: id(index + 80),
                      parentFieldId: rootId,
                      nodeRole: "object_property",
                      apiKey: "visible_child",
                      displayLabel: "Visible child",
                      kind: "short_text",
                      required: null,
                      localization: "shared",
                      deprecated: false,
                      position: 1,
                      editor: {
                        helpText: null,
                        placeholder: null,
                        visibleToRoles: roles,
                        editableByRoles: roles,
                      },
                      configuration: {},
                      children: [],
                    },
                  ]
                : []),
            ]
          : [];
      return Schema.decodeUnknownSync(CollectionFieldDefinition)({
        id: rootId,
        parentFieldId: null,
        nodeRole: "root",
        apiKey: `field_${index}`,
        displayLabel: `Field ${index}`,
        kind,
        required: false,
        localization: kind === "object" ? "mixed" : "localized",
        deprecated: false,
        position: index,
        editor: {
          helpText: null,
          placeholder: null,
          visibleToRoles: roles,
          editableByRoles: roles,
        },
        configuration: configuration(kind),
        children,
      });
    });
    const editorLayout = Schema.decodeUnknownSync(EditorLayout)({
      version: 1,
      tabs: [
        {
          id: id(100),
          title: "Content",
          description: null,
          position: 0,
          visibleToRoles: roles,
          groups: [
            {
              id: id(101),
              title: "Fields",
              description: null,
              position: 0,
              columns: 1,
              visibleToRoles: roles,
              fields: fields.map((field, position) => ({
                id: id(110 + position),
                fieldId: field.id,
                position,
                helpTextOverride: null,
                visibleToRoles: roles,
              })),
            },
          ],
        },
      ],
      sidebarGroups: [],
    });
    const form = Schema.decodeUnknownSync(GeneratedFormDefinition)({
      source: "published",
      collectionId: id(1),
      revisionId: id(2),
      formatVersion: 2,
      validationProfile: "field-system@1",
      currencyRegistryProfile: "iso-4217@2026-01-01",
      contractHash: ContractHash.make("b".repeat(64)),
      role: "developer",
      canEdit: true,
      fields,
      editableFieldIds: fields.flatMap((field) => [
        field.id,
        ...field.children.map((child) => child.id),
      ]),
      editorLayout,
      currencyMinorUnits: { USD: 2 },
    });

    const projected = projectStudioForm(form);
    const projectedKinds = new Set(
      projected.fields.flatMap((field) => [
        field.kind,
        ...field.children.map((child) => child.kind),
      ]),
    );
    assert.deepStrictEqual([...projectedKinds].toSorted(), [...kinds].toSorted());
    assert.strictEqual(projected.fields.length, kinds.length);
    const objectField = projected.fields.find((field) => field.kind === "object");
    assert.strictEqual(objectField?.localization, "mixed");
    assert.strictEqual(objectField?.children.length, 1);
    assert.strictEqual(objectField?.children[0]?.id, id(94));
    assert.strictEqual(objectField?.children[0]?.localization, "shared");
    const listField = projected.fields.find((field) => field.kind === "list");
    assert.strictEqual(listField?.children.length, 1);
    const serialized = JSON.stringify(projected);
    assert.notInclude(serialized, id(74));
    assert.notInclude(serialized, "apiKey");
    assert.notInclude(serialized, "visibleToRoles");
    assert.notInclude(serialized, "editableByRoles");
    assert.notInclude(serialized, '"role"');
    assert.notInclude(serialized, '"source"');
  });
});
