import { assert, describe, it } from "@effect/vitest";
import { Schema } from "effect";

import { EditorLayout, EditorLayoutNodeId } from "../../../contracts/field";
import {
  CollectionFieldApiKey,
  CollectionFieldDefinition,
  CollectionFieldDisplayLabel,
  CollectionFieldId,
  defaultFieldEditorMetadata,
} from "../../../contracts/schema";
import { reconcileCodeEditorLayout } from "./index";

const titleId = CollectionFieldId.make("019fae8b-1234-7000-8000-000000000501");
const obsoleteId = CollectionFieldId.make("019fae8b-1234-7000-8000-000000000502");
const summaryId = CollectionFieldId.make("019fae8b-1234-7000-8000-000000000503");
const tabId = EditorLayoutNodeId.make("019fae8b-1234-7000-8000-000000000504");
const groupId = EditorLayoutNodeId.make("019fae8b-1234-7000-8000-000000000505");
const titlePlacementId = EditorLayoutNodeId.make("019fae8b-1234-7000-8000-000000000506");
const obsoletePlacementId = EditorLayoutNodeId.make("019fae8b-1234-7000-8000-000000000507");
const summaryPlacementId = EditorLayoutNodeId.make("019fae8b-1234-7000-8000-000000000508");

function field(id: CollectionFieldId, apiKey: string, position: number) {
  return Schema.decodeUnknownSync(CollectionFieldDefinition)({
    id,
    parentFieldId: null,
    nodeRole: "root",
    apiKey: CollectionFieldApiKey.make(apiKey),
    displayLabel: CollectionFieldDisplayLabel.make(apiKey),
    kind: "short_text",
    required: false,
    localization: "localized",
    deprecated: false,
    position,
    editor: defaultFieldEditorMetadata,
    configuration: {},
    children: [],
  });
}

const title = field(titleId, "title", 0);
const summary = field(summaryId, "summary", 1);

function currentLayout() {
  return Schema.decodeUnknownSync(EditorLayout)({
    version: 1,
    tabs: [
      {
        id: tabId,
        title: "Writing",
        description: "Custom tab",
        position: 0,
        visibleToRoles: defaultFieldEditorMetadata.visibleToRoles,
        groups: [
          {
            id: groupId,
            title: "Primary",
            description: "Custom group",
            position: 0,
            columns: 2,
            visibleToRoles: defaultFieldEditorMetadata.visibleToRoles,
            fields: [
              {
                id: titlePlacementId,
                fieldId: titleId,
                position: 0,
                helpTextOverride: "Custom title help",
                visibleToRoles: defaultFieldEditorMetadata.visibleToRoles,
              },
              {
                id: obsoletePlacementId,
                fieldId: obsoleteId,
                position: 1,
                helpTextOverride: null,
                visibleToRoles: defaultFieldEditorMetadata.visibleToRoles,
              },
            ],
          },
        ],
      },
    ],
    sidebarGroups: [],
  });
}

describe("code schema editor-layout reconciliation", () => {
  it("preserves surviving GUI presentation, removes omitted roots, and appends new roots", () => {
    const result = reconcileCodeEditorLayout(currentLayout(), [title, summary], {
      tabId: null,
      groupId: null,
      placementIds: new Map([[summaryId, summaryPlacementId]]),
    });

    assert.isTrue(result.valid);
    if (result.valid) {
      const tab = result.editorLayout.tabs[0];
      const group = tab?.groups[0];
      assert.strictEqual(tab?.title, "Writing");
      assert.strictEqual(group?.columns, 2);
      assert.deepStrictEqual(group?.fields, [
        {
          id: titlePlacementId,
          fieldId: titleId,
          position: 0,
          helpTextOverride: "Custom title help",
          visibleToRoles: defaultFieldEditorMetadata.visibleToRoles,
        },
        {
          id: summaryPlacementId,
          fieldId: summaryId,
          position: 1,
          helpTextOverride: null,
          visibleToRoles: defaultFieldEditorMetadata.visibleToRoles,
        },
      ]);
    }
  });

  it("builds deterministic default presentation only from server-allocated layout IDs", () => {
    const result = reconcileCodeEditorLayout(null, [title, summary], {
      tabId,
      groupId,
      placementIds: new Map([
        [titleId, titlePlacementId],
        [summaryId, summaryPlacementId],
      ]),
    });

    assert.isTrue(result.valid);
    if (result.valid) {
      assert.strictEqual(result.editorLayout.tabs[0]?.id, tabId);
      assert.strictEqual(result.editorLayout.tabs[0]?.groups[0]?.id, groupId);
      assert.deepStrictEqual(
        result.editorLayout.tabs[0]?.groups[0]?.fields.map((placement) => placement.id),
        [titlePlacementId, summaryPlacementId],
      );
    }
  });

  it("fails closed rather than generating client or random placement IDs", () => {
    const existing = reconcileCodeEditorLayout(currentLayout(), [title, summary], {
      tabId: null,
      groupId: null,
      placementIds: new Map(),
    });
    const fresh = reconcileCodeEditorLayout(null, [title], {
      tabId: null,
      groupId: null,
      placementIds: new Map(),
    });

    assert.isFalse(existing.valid);
    assert.isFalse(fresh.valid);
    if (!existing.valid) assert.strictEqual(existing.issues[0]?.code, "layout_identity_missing");
    if (!fresh.valid) assert.strictEqual(fresh.issues[0]?.code, "layout_identity_missing");
  });
});
