// Reconciles GUI-owned editor layout around code-added and code-removed root fields.

import { Either, ParseResult, Schema } from "effect";

import { EditorLayout, type EditorLayoutNodeId } from "../../../contracts/field";
import type { CollectionFieldDefinition } from "../../../contracts/schema";

export interface CodeLayoutAllocations {
  readonly tabId: EditorLayoutNodeId | null;
  readonly groupId: EditorLayoutNodeId | null;
  readonly placementIds: ReadonlyMap<string, EditorLayoutNodeId>;
}

export interface CodeEditorLayoutIssue {
  readonly path: string;
  readonly code: "layout_identity_missing" | "layout_candidate_invalid";
  readonly message: string;
}

export type ReconcileCodeEditorLayoutResult =
  | { readonly valid: true; readonly editorLayout: EditorLayout }
  | { readonly valid: false; readonly issues: ReadonlyArray<CodeEditorLayoutIssue> };

const allRoles = [
  "owner",
  "developer",
  "content_admin",
  "editor",
  "reviewer",
  "client_editor",
  "read_only",
] as const;

function decodeLayout(value: unknown): ReconcileCodeEditorLayoutResult {
  const decoded = Schema.decodeUnknownEither(EditorLayout, {
    errors: "all",
    onExcessProperty: "error",
  })(value);
  return Either.isRight(decoded)
    ? { valid: true, editorLayout: decoded.right }
    : {
        valid: false,
        issues: [
          {
            path: "editorLayout",
            code: "layout_candidate_invalid",
            message: ParseResult.TreeFormatter.formatErrorSync(decoded.left).slice(0, 512),
          },
        ],
      };
}

function createLayout(
  roots: ReadonlyArray<CollectionFieldDefinition>,
  allocations: CodeLayoutAllocations,
): ReconcileCodeEditorLayoutResult {
  if (!allocations.tabId || !allocations.groupId) {
    return {
      valid: false,
      issues: [
        {
          path: "editorLayout",
          code: "layout_identity_missing",
          message: "New collection layout identities must be allocated by the server.",
        },
      ],
    };
  }
  const missing = roots.filter((field) => !allocations.placementIds.has(field.id));
  if (missing.length > 0) {
    return {
      valid: false,
      issues: missing.slice(0, 50).map((field) => ({
        path: `editorLayout.fields.${field.id}`,
        code: "layout_identity_missing" as const,
        message: "A new root field placement identity must be allocated by the server.",
      })),
    };
  }
  return decodeLayout({
    version: 1,
    tabs: [
      {
        id: allocations.tabId,
        title: "Content",
        description: null,
        position: 0,
        visibleToRoles: allRoles,
        groups: [
          {
            id: allocations.groupId,
            title: "Main",
            description: null,
            position: 0,
            columns: 1,
            visibleToRoles: allRoles,
            fields: roots.map((field, position) => ({
              id: allocations.placementIds.get(field.id),
              fieldId: field.id,
              position,
              helpTextOverride: null,
              visibleToRoles: field.editor.visibleToRoles,
            })),
          },
        ],
      },
    ],
    sidebarGroups: [],
  });
}

/**
 * Preserves all surviving GUI layout metadata, removes placements for omitted roots, and appends
 * newly allocated roots to the final main-area group. It never allocates IDs itself.
 */
export function reconcileCodeEditorLayout(
  current: EditorLayout | null,
  candidateRoots: ReadonlyArray<CollectionFieldDefinition>,
  allocations: CodeLayoutAllocations,
): ReconcileCodeEditorLayoutResult {
  if (current === null) return createLayout(candidateRoots, allocations);

  const candidateIds = new Set<string>(candidateRoots.map((field) => field.id));
  const placedIds = new Set<string>();
  const tabs = current.tabs.map((tab) => ({
    ...tab,
    groups: tab.groups.map((group) => ({
      ...group,
      fields: group.fields
        .filter((placement) => candidateIds.has(placement.fieldId))
        .map((placement, position) => {
          placedIds.add(placement.fieldId);
          return { ...placement, position };
        }),
    })),
  }));
  const sidebarGroups = current.sidebarGroups.map((group) => ({
    ...group,
    fields: group.fields
      .filter((placement) => candidateIds.has(placement.fieldId))
      .map((placement, position) => {
        placedIds.add(placement.fieldId);
        return { ...placement, position };
      }),
  }));
  const added = candidateRoots.filter((field) => !placedIds.has(field.id));
  const missing = added.filter((field) => !allocations.placementIds.has(field.id));
  if (missing.length > 0) {
    return {
      valid: false,
      issues: missing.slice(0, 50).map((field) => ({
        path: `editorLayout.fields.${field.id}`,
        code: "layout_identity_missing" as const,
        message: "A new root field placement identity must be allocated by the server.",
      })),
    };
  }

  const lastTab = tabs.at(-1);
  const lastGroup = lastTab?.groups.at(-1);
  if (added.length > 0 && (!lastTab || !lastGroup)) {
    return {
      valid: false,
      issues: [
        {
          path: "editorLayout.tabs",
          code: "layout_candidate_invalid",
          message: "The current layout has no main-area group for new root fields.",
        },
      ],
    };
  }
  const nextTabs = tabs.map((tab) =>
    tab.id !== lastTab?.id
      ? tab
      : {
          ...tab,
          groups: tab.groups.map((group) =>
            group.id !== lastGroup?.id
              ? group
              : {
                  ...group,
                  fields: [
                    ...group.fields,
                    ...added.map((field, offset) => ({
                      id: allocations.placementIds.get(field.id),
                      fieldId: field.id,
                      position: group.fields.length + offset,
                      helpTextOverride: null,
                      visibleToRoles: field.editor.visibleToRoles,
                    })),
                  ],
                },
          ),
        },
  );
  return decodeLayout({ ...current, tabs: nextTabs, sidebarGroups });
}
