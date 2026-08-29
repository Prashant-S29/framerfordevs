// Verifies deterministic editor-layout coverage, ordering, role narrowing, and identity rules.

import { assert, describe, it } from "@effect/vitest";
import { Schema } from "effect";

import type { ProjectRole } from "../../../contracts/access";
import { EditorLayout, FieldEditorMetadata } from "../../../contracts/field";
import { type LayoutFieldDefinition, validateEditorLayout } from "./index";

const firstFieldId = "019fd0d2-e52b-7488-b062-e25722913e01";
const secondFieldId = "019fd0d2-e52b-7488-b062-e25722913e02";
const tabId = "019fd0d2-e52b-7488-b062-e25722913e03";
const groupId = "019fd0d2-e52b-7488-b062-e25722913e04";
const firstPlacementId = "019fd0d2-e52b-7488-b062-e25722913e05";
const secondPlacementId = "019fd0d2-e52b-7488-b062-e25722913e06";

const editableMetadata = Schema.decodeUnknownSync(FieldEditorMetadata)({
  helpText: null,
  placeholder: null,
  visibleToRoles: ["owner", "developer", "content_admin", "editor"],
  editableByRoles: ["owner", "developer", "content_admin", "editor"],
});

const fields: ReadonlyArray<LayoutFieldDefinition> = [
  { id: firstFieldId, nodeRole: "root", editor: editableMetadata },
  { id: secondFieldId, nodeRole: "root", editor: editableMetadata },
];

/** Builds a valid two-field layout fixture with optional placement overrides. */
function layoutFixture(
  secondField = secondFieldId,
  visibleToRoles: ReadonlyArray<ProjectRole> = ["owner", "developer", "content_admin", "editor"],
) {
  return Schema.decodeUnknownSync(EditorLayout)({
    version: 1,
    tabs: [
      {
        id: tabId,
        title: "Content",
        description: null,
        position: 0,
        visibleToRoles,
        groups: [
          {
            id: groupId,
            title: "Main",
            description: null,
            position: 0,
            columns: 1,
            visibleToRoles,
            fields: [
              {
                id: firstPlacementId,
                fieldId: firstFieldId,
                position: 0,
                helpTextOverride: null,
                visibleToRoles,
              },
              {
                id: secondPlacementId,
                fieldId: secondField,
                position: 1,
                helpTextOverride: null,
                visibleToRoles,
              },
            ],
          },
        ],
      },
    ],
    sidebarGroups: [],
  });
}

describe("editor layout validation", () => {
  it("accepts exact root coverage with dense ordering", () => {
    assert.isTrue(validateEditorLayout(layoutFixture(), fields).valid);
  });

  it("rejects duplicate placements and unplaced roots", () => {
    const result = validateEditorLayout(layoutFixture(firstFieldId), fields);
    assert.isFalse(result.valid);
    assert.isTrue(result.issues.some((issue) => issue.code === "layout_field_duplicate"));
    assert.isTrue(result.issues.some((issue) => issue.code === "layout_field_unplaced"));
  });

  it("keeps every placement inspectable by owner and developer", () => {
    const result = validateEditorLayout(layoutFixture(secondFieldId, ["owner"]), fields);
    assert.isFalse(result.valid);
    assert.isTrue(result.issues.some((issue) => issue.code === "layout_owner_visibility"));
  });

  it("prevents placements from widening field visibility", () => {
    const restrictedMetadata = Schema.decodeUnknownSync(FieldEditorMetadata)({
      helpText: null,
      placeholder: null,
      visibleToRoles: ["owner", "developer"],
      editableByRoles: ["owner", "developer"],
    });
    const restrictedFields: ReadonlyArray<LayoutFieldDefinition> = [
      { id: firstFieldId, nodeRole: "root", editor: restrictedMetadata },
      { id: secondFieldId, nodeRole: "root", editor: editableMetadata },
    ];

    const result = validateEditorLayout(layoutFixture(), restrictedFields);
    assert.isFalse(result.valid);
    assert.isTrue(result.issues.some((issue) => issue.code === "layout_visibility_exceeds_field"));
  });
});
