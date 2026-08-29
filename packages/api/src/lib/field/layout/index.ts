// Validates bounded M6 editor layout independently from React, Effect, persistence, and delivery contracts.

import type {
  EditorLayout,
  FieldEditorMetadata,
  FieldNodeRole,
  FieldValidationIssue,
} from "../../../contracts/field";
import type { ProjectRole } from "../../../contracts/access";
import { fieldSystemLimits } from "../profile";

export interface LayoutFieldDefinition {
  readonly id: string;
  readonly nodeRole: FieldNodeRole;
  readonly editor: FieldEditorMetadata;
}

export interface EditorLayoutValidationResult {
  readonly valid: boolean;
  readonly issues: ReadonlyArray<FieldValidationIssue>;
  readonly capped: boolean;
}

interface MutableLayoutIssues {
  readonly issues: Array<FieldValidationIssue>;
  capped: boolean;
}

const layoutMaximumBytes = 32_768;
const projectRoleOrder: ReadonlyArray<ProjectRole> = [
  "owner",
  "developer",
  "content_admin",
  "editor",
  "reviewer",
  "client_editor",
  "read_only",
];
const projectRoleRank = new Map(projectRoleOrder.map((role, index) => [role, index]));
const contentWriteRoles = new Set<ProjectRole>([
  "owner",
  "developer",
  "content_admin",
  "editor",
  "client_editor",
]);
const textEncoder = new TextEncoder();

/** Appends one bounded safe layout issue. */
function addLayoutIssue(
  collector: MutableLayoutIssues,
  path: string,
  code: string,
  message: string,
): void {
  if (collector.issues.length >= fieldSystemLimits.issues) {
    collector.capped = true;
    return;
  }
  collector.issues.push({ path, code, message });
}

/** Returns the role intersection while retaining deterministic left-side order. */
function intersectRoles(
  left: ReadonlyArray<ProjectRole>,
  right: ReadonlyArray<ProjectRole>,
): ReadonlyArray<ProjectRole> {
  const allowed = new Set(right);
  const intersection: Array<ProjectRole> = [];
  for (const role of left) {
    if (allowed.has(role)) intersection.push(role);
  }
  return intersection;
}

/** Checks that positions are unique, dense, and begin at zero. */
function validateDensePositions(
  positions: ReadonlyArray<number>,
  collector: MutableLayoutIssues,
  path: string,
): void {
  const unique = new Set(positions);
  if (unique.size !== positions.length) {
    addLayoutIssue(
      collector,
      path,
      "layout_position_duplicate",
      "Layout positions must be unique.",
    );
    return;
  }
  for (let expected = 0; expected < positions.length; expected += 1) {
    if (!unique.has(expected)) {
      addLayoutIssue(
        collector,
        path,
        "layout_position_not_dense",
        "Layout positions must be dense and begin at zero.",
      );
      return;
    }
  }
}

/** Validates editor field-level role narrowing before applying layout visibility. */
function validateFieldRoles(field: LayoutFieldDefinition, collector: MutableLayoutIssues): void {
  const roleArrays: ReadonlyArray<
    readonly ["visibleToRoles" | "editableByRoles", ReadonlyArray<ProjectRole>]
  > = [
    ["visibleToRoles", field.editor.visibleToRoles],
    ["editableByRoles", field.editor.editableByRoles],
  ];
  for (const [key, roles] of roleArrays) {
    const canonical = [...roles].sort(
      (left, right) => (projectRoleRank.get(left) ?? 99) - (projectRoleRank.get(right) ?? 99),
    );
    if (canonical.some((role, index) => roles[index] !== role))
      addLayoutIssue(
        collector,
        `fields.${field.id}.editor.${key}`,
        "field_roles_not_canonical",
        "Field role arrays must use canonical project-role order.",
      );
  }
  const visible = new Set(field.editor.visibleToRoles);
  if (!visible.has("owner") || !visible.has("developer")) {
    addLayoutIssue(
      collector,
      `fields.${field.id}.editor.visibleToRoles`,
      "field_owner_visibility",
      "Owner and developer must remain able to inspect every field.",
    );
  }
  for (const role of field.editor.editableByRoles) {
    if (!visible.has(role))
      addLayoutIssue(
        collector,
        `fields.${field.id}.editor.editableByRoles`,
        "field_edit_visibility",
        "Editable roles must also be visible.",
      );
    if (!contentWriteRoles.has(role))
      addLayoutIssue(
        collector,
        `fields.${field.id}.editor.editableByRoles`,
        "field_edit_policy",
        "Editable roles must possess content write permission.",
      );
  }
  const editable = new Set(field.editor.editableByRoles);
  if (!editable.has("owner") || !editable.has("developer")) {
    addLayoutIssue(
      collector,
      `fields.${field.id}.editor.editableByRoles`,
      "field_owner_editability",
      "Owner and developer must remain able to edit every field.",
    );
  }
}

/** Validates complete placement coverage, hierarchy visibility, identity, order, and size. */
export function validateEditorLayout(
  layout: EditorLayout,
  fields: ReadonlyArray<LayoutFieldDefinition>,
): EditorLayoutValidationResult {
  const collector: MutableLayoutIssues = { issues: [], capped: false };
  const activeRoots = new Map<string, LayoutFieldDefinition>();
  for (const field of fields) {
    if (field.nodeRole === "root") activeRoots.set(field.id, field);
    validateFieldRoles(field, collector);
  }

  const layoutIds = new Set<string>();
  const placedFields = new Set<string>();
  const tabPositions: Array<number> = [];
  let placementCount = 0;

  for (let tabIndex = 0; tabIndex < layout.tabs.length; tabIndex += 1) {
    const tab = layout.tabs[tabIndex];
    if (!tab) continue;
    const tabPath = `layout.tabs.${tabIndex}`;
    tabPositions.push(tab.position);
    if (layoutIds.has(tab.id))
      addLayoutIssue(
        collector,
        `${tabPath}.id`,
        "layout_id_duplicate",
        "Layout node IDs must be unique.",
      );
    layoutIds.add(tab.id);

    const groupPositions: Array<number> = [];
    for (let groupIndex = 0; groupIndex < tab.groups.length; groupIndex += 1) {
      const group = tab.groups[groupIndex];
      if (!group) continue;
      const groupPath = `${tabPath}.groups.${groupIndex}`;
      groupPositions.push(group.position);
      if (layoutIds.has(group.id))
        addLayoutIssue(
          collector,
          `${groupPath}.id`,
          "layout_id_duplicate",
          "Layout node IDs must be unique.",
        );
      layoutIds.add(group.id);

      const placementPositions: Array<number> = [];
      for (let fieldIndex = 0; fieldIndex < group.fields.length; fieldIndex += 1) {
        const placement = group.fields[fieldIndex];
        if (!placement) continue;
        placementCount += 1;
        const placementPath = `${groupPath}.fields.${fieldIndex}`;
        placementPositions.push(placement.position);
        if (layoutIds.has(placement.id))
          addLayoutIssue(
            collector,
            `${placementPath}.id`,
            "layout_id_duplicate",
            "Layout node IDs must be unique.",
          );
        layoutIds.add(placement.id);

        const field = activeRoots.get(placement.fieldId);
        if (!field) {
          addLayoutIssue(
            collector,
            `${placementPath}.fieldId`,
            "layout_field_missing",
            "Layout placements must reference active root fields.",
          );
          continue;
        }
        if (placedFields.has(field.id))
          addLayoutIssue(
            collector,
            `${placementPath}.fieldId`,
            "layout_field_duplicate",
            "Each root field must appear exactly once.",
          );
        placedFields.add(field.id);

        const tabAndGroup = intersectRoles(tab.visibleToRoles, group.visibleToRoles);
        const withPlacement = intersectRoles(tabAndGroup, placement.visibleToRoles);
        const effective = intersectRoles(withPlacement, field.editor.visibleToRoles);
        if (effective.length === 0)
          addLayoutIssue(
            collector,
            `${placementPath}.visibleToRoles`,
            "layout_visibility_empty",
            "A field placement must be visible to at least one effective role.",
          );
        if (!effective.includes("owner") || !effective.includes("developer"))
          addLayoutIssue(
            collector,
            `${placementPath}.visibleToRoles`,
            "layout_owner_visibility",
            "Owner and developer must remain able to inspect every placement.",
          );
        const fieldVisible = new Set(field.editor.visibleToRoles);
        for (const role of placement.visibleToRoles) {
          if (!fieldVisible.has(role))
            addLayoutIssue(
              collector,
              `${placementPath}.visibleToRoles`,
              "layout_visibility_exceeds_field",
              "A placement cannot expose a role hidden by its field.",
            );
        }
      }
      validateDensePositions(placementPositions, collector, `${groupPath}.fields`);
    }
    validateDensePositions(groupPositions, collector, `${tabPath}.groups`);
  }
  validateDensePositions(tabPositions, collector, "layout.tabs");

  const sidebarPositions: Array<number> = [];
  for (let groupIndex = 0; groupIndex < layout.sidebarGroups.length; groupIndex += 1) {
    const group = layout.sidebarGroups[groupIndex];
    if (!group) continue;
    const groupPath = `layout.sidebarGroups.${groupIndex}`;
    sidebarPositions.push(group.position);
    if (layoutIds.has(group.id))
      addLayoutIssue(
        collector,
        `${groupPath}.id`,
        "layout_id_duplicate",
        "Layout node IDs must be unique.",
      );
    layoutIds.add(group.id);

    const placementPositions: Array<number> = [];
    for (let fieldIndex = 0; fieldIndex < group.fields.length; fieldIndex += 1) {
      const placement = group.fields[fieldIndex];
      if (!placement) continue;
      placementCount += 1;
      const placementPath = `${groupPath}.fields.${fieldIndex}`;
      placementPositions.push(placement.position);
      if (layoutIds.has(placement.id))
        addLayoutIssue(
          collector,
          `${placementPath}.id`,
          "layout_id_duplicate",
          "Layout node IDs must be unique.",
        );
      layoutIds.add(placement.id);
      const field = activeRoots.get(placement.fieldId);
      if (!field) {
        addLayoutIssue(
          collector,
          `${placementPath}.fieldId`,
          "layout_field_missing",
          "Layout placements must reference active root fields.",
        );
        continue;
      }
      if (placedFields.has(field.id))
        addLayoutIssue(
          collector,
          `${placementPath}.fieldId`,
          "layout_field_duplicate",
          "Each root field must appear exactly once.",
        );
      placedFields.add(field.id);
      const groupAndPlacement = intersectRoles(group.visibleToRoles, placement.visibleToRoles);
      const effective = intersectRoles(groupAndPlacement, field.editor.visibleToRoles);
      if (effective.length === 0)
        addLayoutIssue(
          collector,
          `${placementPath}.visibleToRoles`,
          "layout_visibility_empty",
          "A field placement must be visible to at least one effective role.",
        );
      if (!effective.includes("owner") || !effective.includes("developer"))
        addLayoutIssue(
          collector,
          `${placementPath}.visibleToRoles`,
          "layout_owner_visibility",
          "Owner and developer must remain able to inspect every placement.",
        );
    }
    validateDensePositions(placementPositions, collector, `${groupPath}.fields`);
  }
  validateDensePositions(sidebarPositions, collector, "layout.sidebarGroups");

  for (const fieldId of activeRoots.keys()) {
    if (!placedFields.has(fieldId))
      addLayoutIssue(
        collector,
        `fields.${fieldId}`,
        "layout_field_unplaced",
        "Every active root field must appear exactly once.",
      );
  }
  if (placementCount > fieldSystemLimits.fieldNodes)
    addLayoutIssue(
      collector,
      "layout",
      "layout_placements_exceeded",
      `A layout can contain at most ${fieldSystemLimits.fieldNodes} field placements.`,
    );
  if (textEncoder.encode(JSON.stringify(layout)).byteLength > layoutMaximumBytes)
    addLayoutIssue(
      collector,
      "layout",
      "layout_size_exceeded",
      `Editor layout cannot exceed ${layoutMaximumBytes} UTF-8 bytes.`,
    );

  return {
    valid: collector.issues.length === 0,
    issues: collector.issues,
    capped: collector.capped,
  };
}
