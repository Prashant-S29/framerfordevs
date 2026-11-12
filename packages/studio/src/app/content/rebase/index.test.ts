import { describe, expect, it } from "vitest";
import type { ContentFormDefinition, ContentFormField } from "@framerfordevs/content-form";

import { keepStudioUnresolvedChange, rebaseStudioValues, validateStudioValues } from "./index";

const editor = { helpText: null, placeholder: null };
const text = {
  id: "title",
  parentFieldId: null,
  nodeRole: "root",
  apiKey: null,
  displayLabel: "Title",
  kind: "short_text",
  required: false,
  localization: "localized",
  position: 0,
  editor,
  configuration: { maxLength: 20 },
  children: [],
} satisfies ContentFormField;
const list = {
  id: "items",
  parentFieldId: null,
  nodeRole: "root",
  apiKey: null,
  displayLabel: "Items",
  kind: "list",
  required: false,
  localization: "localized",
  position: 1,
  editor,
  configuration: { maxItems: 5 },
  children: [
    {
      ...text,
      id: "item",
      parentFieldId: "items",
      nodeRole: "list_item",
      localization: null,
    },
  ],
} satisfies ContentFormField;

function definition(
  fields: ReadonlyArray<ContentFormField> = [text, list],
  editableFieldIds: ReadonlyArray<string> = fields.flatMap((field) => [
    field.id,
    ...field.children.map((child) => child.id),
  ]),
): ContentFormDefinition {
  return {
    canEdit: true,
    fields,
    editableFieldIds,
    editorLayout: { version: 1, tabs: [], sidebarGroups: [] },
    currencyMinorUnits: {},
  };
}

function rebase(
  latestDefinition = definition(),
  latestValues: Readonly<Record<string, unknown>> = { title: "Before", items: ["A"] },
) {
  return rebaseStudioValues({
    oldDefinition: definition(),
    oldBaseline: { title: "Before", items: ["A"] },
    localValues: { title: "Local", items: ["B"] },
    latestDefinition,
    latestValues,
  });
}

describe("Studio stable-ID rebase", () => {
  it("advises only on invalid editable projected values", () => {
    expect(
      validateStudioValues(
        definition([{ ...text, required: true, configuration: { minLength: 2 } }]),
        { title: "x" },
      ),
    ).toEqual([{ fieldId: "title", message: "This field value is invalid." }]);
    expect(
      validateStudioValues(definition([{ ...text, required: true }], []), { title: "" }),
    ).toEqual([]);
  });

  it("carries only compatible uncontested atomic changes and never carries changed lists", () => {
    expect(rebase()).toEqual({
      values: { title: "Local", items: ["A"] },
      carriedCount: 1,
      unresolved: [
        expect.objectContaining({
          fieldId: "items",
          label: "Items",
          section: "localized",
          reason: "list_changed",
          canKeep: false,
        }),
      ],
    });
  });

  it("classifies every incompatible authority transition without exposing it in labels", () => {
    const cases: ReadonlyArray<{
      readonly expected: string;
      readonly latest: ContentFormDefinition;
      readonly values?: Readonly<Record<string, unknown>>;
    }> = [
      { expected: "removed_or_hidden", latest: definition([list]) },
      { expected: "read_only", latest: definition([text, list], [list.id, "item"]) },
      {
        expected: "kind_changed",
        latest: definition([{ ...text, kind: "boolean", configuration: {} }, list]),
      },
      {
        expected: "localization_changed",
        latest: definition([{ ...text, localization: "shared" }, list]),
      },
      {
        expected: "invalid_value",
        latest: definition([{ ...text, configuration: { maxLength: 2 } }, list]),
      },
      {
        expected: "parent_changed",
        latest: definition([
          {
            id: "container",
            parentFieldId: null,
            nodeRole: "root",
            apiKey: null,
            displayLabel: "Container",
            kind: "object",
            required: false,
            localization: "localized",
            position: 0,
            editor,
            configuration: {},
            children: [
              {
                ...text,
                parentFieldId: "container",
                nodeRole: "object_property",
                localization: null,
              },
            ],
          },
          list,
        ]),
      },
      {
        expected: "concurrent_change",
        latest: definition(),
        values: { title: "Remote", items: ["A"] },
      },
    ];

    for (const candidate of cases) {
      const result = rebase(
        candidate.latest,
        candidate.values ?? { title: "Before", items: ["A"] },
      );
      expect(result.unresolved.find((issue) => issue.fieldId === "title")).toEqual(
        expect.objectContaining({ label: "Title", reason: candidate.expected }),
      );
    }
  });

  it("allows only an explicitly reviewed compatible concurrent value to be reapplied", () => {
    const result = rebase(definition(), { title: "Remote", items: ["A"] });
    const concurrent = result.unresolved.find((issue) => issue.fieldId === "title");
    expect(concurrent?.canKeep).toBe(true);
    expect(concurrent && keepStudioUnresolvedChange(result.values, concurrent)).toEqual({
      title: "Local",
      items: ["A"],
    });
    const listChange = result.unresolved.find((issue) => issue.fieldId === "items");
    expect(listChange && keepStudioUnresolvedChange(result.values, listChange)).toEqual(
      result.values,
    );
  });
});
