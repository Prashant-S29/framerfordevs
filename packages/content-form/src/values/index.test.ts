import { describe, expect, it } from "vitest";

import type { ContentFormDefinition, ContentFormField } from "../model";
import {
  apiKeyValuesToStableIds,
  applyGeneratedFormDefaults,
  applyNewEntryPartitionDefaults,
  fieldMutations,
  partitionContentFormDefinition,
  stableIdValuesToApiKeys,
} from "./index";

const editor = { helpText: null, placeholder: null };
const child = {
  id: "child",
  parentFieldId: "root",
  nodeRole: "object_property",
  apiKey: "title",
  displayLabel: "Title",
  kind: "short_text",
  required: false,
  localization: "localized",
  position: 0,
  editor,
  configuration: { default: "Default title" },
  children: [],
} satisfies ContentFormField;
const sharedChild = {
  ...child,
  id: "shared-child",
  apiKey: "theme",
  displayLabel: "Theme",
  localization: "shared",
  configuration: {},
} satisfies ContentFormField;
const root = {
  id: "root",
  parentFieldId: null,
  nodeRole: "root",
  apiKey: "hero",
  displayLabel: "Hero",
  kind: "object",
  required: null,
  localization: "mixed",
  position: 0,
  editor,
  configuration: {},
  children: [child, sharedChild],
} satisfies ContentFormField;
const listItem = {
  ...child,
  id: "item",
  parentFieldId: "list",
  nodeRole: "list_item",
  apiKey: null,
  localization: null,
  configuration: {},
} satisfies ContentFormField;
const list = {
  id: "list",
  parentFieldId: null,
  nodeRole: "root",
  apiKey: "items",
  displayLabel: "Items",
  kind: "list",
  required: false,
  localization: "localized",
  position: 1,
  editor,
  configuration: {},
  children: [listItem],
} satisfies ContentFormField;
const definition: ContentFormDefinition = {
  canEdit: true,
  fields: [root, list],
  editableFieldIds: [root.id, child.id, sharedChild.id, list.id, listItem.id],
  editorLayout: {
    version: 1,
    tabs: [
      {
        id: "tab",
        title: "Content",
        description: null,
        position: 0,
        groups: [
          {
            id: "group",
            title: "Main",
            description: null,
            position: 0,
            columns: 1,
            fields: [
              { id: "root-placement", fieldId: root.id, position: 0, helpTextOverride: null },
              { id: "list-placement", fieldId: list.id, position: 1, helpTextOverride: null },
            ],
          },
        ],
      },
    ],
    sidebarGroups: [],
  },
  currencyMinorUnits: {},
};

describe("content-form values", () => {
  it("projects recursive object/list values between API keys and stable IDs", () => {
    const stable = apiKeyValuesToStableIds([root, list], {
      hero: { title: "Hello", theme: "dark" },
      items: ["First", "Second"],
    });
    expect(stable).toEqual({
      root: { child: "Hello", "shared-child": "dark" },
      list: ["First", "Second"],
    });
    expect(stableIdValuesToApiKeys([root, list], stable)).toEqual({
      hero: { title: "Hello", theme: "dark" },
      items: ["First", "Second"],
    });
  });

  it("applies stable-ID defaults only to new unsaved partitions", () => {
    expect(applyGeneratedFormDefaults([root], {})).toEqual({
      root: { child: "Default title" },
    });
    expect(applyGeneratedFormDefaults([root], { root: { child: "Saved" } })).toEqual({
      root: { child: "Saved" },
    });
    expect(applyNewEntryPartitionDefaults([root], {}, 1)).toEqual({});
  });

  it("partitions mixed objects, editable IDs, and layouts by exact scope", () => {
    const localized = partitionContentFormDefinition(definition, "localized", true);
    expect(localized.fields).toEqual([{ ...root, children: [child] }, list]);
    expect(localized.editableFieldIds).toEqual([root.id, child.id, list.id, listItem.id]);
    expect(localized.editorLayout.tabs[0]?.groups[0]?.fields.map(({ fieldId }) => fieldId)).toEqual(
      [root.id, list.id],
    );

    const shared = partitionContentFormDefinition(definition, "shared", false);
    expect(shared.canEdit).toBe(false);
    expect(shared.fields).toEqual([{ ...root, children: [sharedChild] }]);
    expect(shared.editorLayout.tabs[0]?.groups[0]?.fields).toHaveLength(1);
  });

  it("emits nested mixed-object mutations and cleans undefined values", () => {
    expect(
      fieldMutations(
        { root: { child: "Next", "shared-child": undefined }, list: ["One", undefined] },
        { root: { child: "Before", "shared-child": "dark" }, list: [] },
        [root, list],
      ),
    ).toEqual([
      { operation: "set", path: ["root", "child"], value: "Next" },
      { operation: "unset", path: ["root", "shared-child"] },
      { operation: "set", path: ["list"], value: ["One"] },
    ]);
  });
});
