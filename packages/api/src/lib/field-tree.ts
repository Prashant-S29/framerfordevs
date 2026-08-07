// Reconstructs and flattens bounded recursive field definitions without server or Effect dependencies.

import type { FieldValidationIssue } from "../contracts/field-system";
import type { CollectionFieldDefinition } from "../contracts/schemas";
import { fieldSystemLimits } from "./field-system-profile";

export interface FieldTreeResult {
  readonly valid: boolean;
  readonly roots: ReadonlyArray<CollectionFieldDefinition>;
  readonly issues: ReadonlyArray<FieldValidationIssue>;
}

/** Orders sibling definitions by stable schema position and identity. */
function compareFields(left: CollectionFieldDefinition, right: CollectionFieldDefinition): number {
  return left.position - right.position || left.id.localeCompare(right.id);
}

/** Copies a discriminated field definition with its reconstructed children. */
function withChildren(
  node: CollectionFieldDefinition,
  children: ReadonlyArray<CollectionFieldDefinition>,
): CollectionFieldDefinition {
  return { ...node, children };
}

/** Reconstructs a checked recursive tree from decoded flat persistence nodes. */
export function reconstructFieldTree(
  nodes: ReadonlyArray<CollectionFieldDefinition>,
): FieldTreeResult {
  const issues: Array<FieldValidationIssue> = [];
  const byId = new Map<string, CollectionFieldDefinition>();
  const childIds = new Map<string | null, Array<string>>();

  for (const node of nodes) {
    if (byId.has(node.id)) {
      issues.push({
        path: `fields.${node.id}`,
        code: "field_id_duplicate",
        message: "Field IDs must be unique.",
      });
      continue;
    }
    byId.set(node.id, node);
    const siblings = childIds.get(node.parentFieldId) ?? [];
    siblings.push(node.id);
    childIds.set(node.parentFieldId, siblings);
  }

  for (const node of nodes) {
    if (node.parentFieldId !== null && !byId.has(node.parentFieldId)) {
      issues.push({
        path: `fields.${node.id}.parentFieldId`,
        code: "field_parent_missing",
        message: "A field parent must exist in the same schema.",
      });
    }
  }

  const state = new Map<string, "visiting" | "visited">();
  for (const node of nodes) {
    if (state.has(node.id)) continue;
    const stack: Array<{ readonly id: string; readonly leaving: boolean }> = [
      { id: node.id, leaving: false },
    ];
    while (stack.length > 0) {
      const current = stack.pop();
      if (!current) break;
      if (current.leaving) {
        state.set(current.id, "visited");
        continue;
      }
      const currentState = state.get(current.id);
      if (currentState === "visited") continue;
      if (currentState === "visiting") {
        issues.push({
          path: `fields.${current.id}.parentFieldId`,
          code: "field_parent_cycle",
          message: "Field parent relationships cannot form a cycle.",
        });
        continue;
      }
      state.set(current.id, "visiting");
      stack.push({ id: current.id, leaving: true });
      const parentId = byId.get(current.id)?.parentFieldId;
      if (parentId !== null && parentId !== undefined) {
        stack.push({ id: parentId, leaving: false });
      }
    }
  }

  if (issues.length > 0) return { valid: false, roots: [], issues };

  const built = new Map<string, CollectionFieldDefinition>();
  const build = (id: string): CollectionFieldDefinition | undefined => {
    const existing = built.get(id);
    if (existing) return existing;
    const node = byId.get(id);
    if (!node) return undefined;
    const children: Array<CollectionFieldDefinition> = [];
    const orderedChildren = (childIds.get(id) ?? [])
      .map((childId) => byId.get(childId))
      .filter((child): child is CollectionFieldDefinition => child !== undefined)
      .sort(compareFields);
    for (const child of orderedChildren) {
      const builtChild = build(child.id);
      if (builtChild) children.push(builtChild);
    }
    const result = withChildren(node, children);
    built.set(id, result);
    return result;
  };

  const roots: Array<CollectionFieldDefinition> = [];
  const orderedRoots = (childIds.get(null) ?? [])
    .map((id) => byId.get(id))
    .filter((node): node is CollectionFieldDefinition => node !== undefined)
    .sort(compareFields);
  for (const root of orderedRoots) {
    const builtRoot = build(root.id);
    if (builtRoot) roots.push(builtRoot);
  }
  if (built.size !== nodes.length) {
    issues.push({
      path: "fields",
      code: "field_tree_disconnected",
      message: "Every field must be connected to one root definition.",
    });
  }
  if (nodes.length > fieldSystemLimits.fieldNodes) {
    issues.push({
      path: "fields",
      code: "field_count_exceeded",
      message: `A schema can contain at most ${fieldSystemLimits.fieldNodes} field nodes.`,
    });
  }
  return { valid: issues.length === 0, roots, issues };
}

/** Flattens a validated recursive tree in deterministic parent-before-child order. */
export function flattenFieldTree(
  roots: ReadonlyArray<CollectionFieldDefinition>,
): ReadonlyArray<CollectionFieldDefinition> {
  const flattened: Array<CollectionFieldDefinition> = [];
  const stack = [...roots].sort(compareFields).reverse();
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) break;
    flattened.push(current);
    const children = [...current.children].sort(compareFields);
    for (let index = children.length - 1; index >= 0; index -= 1) {
      const child = children[index];
      if (child) stack.push(child);
    }
  }
  return flattened;
}
