// Compiles bounded current or historical draft fragments into renderer-neutral Preview documents.

import type { ProjectRole } from "../contracts/access";
import type { EntryValues } from "../contracts/entries";
import { previewLimits } from "../contracts/preview";
import type { CollectionFieldDefinition } from "../contracts/schemas";
import {
  addEntryDocumentProjectionIssue,
  isPlainEntryRecord,
  makeEntryDocumentProjectionIssueCollector,
  pruneEmptyProjectedObjects,
  selectEntryFieldValue,
  type EntryDocumentProjectionIssue,
} from "./entry-document-projection";
import { validateEntryDocument } from "./entry-values";
import { validateDefinitionTree, validateFieldValue } from "./field-validation";

export interface PreviewDocumentAuthority {
  readonly source: "current" | "revision";
  readonly schemaRevisionId: string;
  readonly contractHash: string;
  readonly sharedRevisionId: string | null;
  readonly sharedVersion: number;
  readonly localizedRevisionId: string | null;
  readonly localizedVersion: number;
}

export interface CompilePreviewDocumentInput {
  readonly entryId: string;
  readonly collectionId: string;
  readonly collectionKey: string;
  readonly locale: string;
  readonly fields: ReadonlyArray<CollectionFieldDefinition>;
  readonly sharedValues: EntryValues;
  readonly localizedValues: EntryValues;
  readonly authority: PreviewDocumentAuthority;
  readonly role: ProjectRole | null;
}

export interface PreviewDocumentCandidate {
  readonly id: string;
  readonly collectionId: string;
  readonly collection: string;
  readonly locale: string;
  readonly preview: { readonly version: 1 } & PreviewDocumentAuthority;
  readonly data: Readonly<Record<string, unknown>>;
  readonly validation: {
    readonly valid: boolean;
    readonly issues: ReadonlyArray<EntryDocumentProjectionIssue>;
    readonly capped: boolean;
  };
}

export type PreviewDocumentCompilationResult =
  | {
      readonly ok: false;
      readonly issues: ReadonlyArray<EntryDocumentProjectionIssue>;
      readonly capped: boolean;
    }
  | {
      readonly ok: true;
      readonly item: PreviewDocumentCandidate;
      readonly responseBytes: number;
    };

const textEncoder = new TextEncoder();

/** Returns whether the authenticated dashboard role may observe one field contract. */
function isFieldVisible(field: CollectionFieldDefinition, role: ProjectRole | null): boolean {
  return role === null || field.editor.visibleToRoles.includes(role);
}

/** Removes server-hidden values recursively without exposing list length or nested structure. */
function projectVisibleValue(
  field: CollectionFieldDefinition,
  value: unknown,
  role: ProjectRole | null,
): unknown {
  if (!isFieldVisible(field, role)) return undefined;
  if (field.kind === "object" && isPlainEntryRecord(value)) {
    const projected: Record<string, unknown> = {};
    for (const child of field.children) {
      if (child.apiKey === null) continue;
      const childValue = projectVisibleValue(child, Reflect.get(value, child.apiKey), role);
      if (childValue !== undefined) Reflect.set(projected, child.apiKey, childValue);
    }
    return projected;
  }
  const item = field.children[0];
  if (field.kind === "list" && item && Array.isArray(value)) {
    if (!isFieldVisible(item, role)) return undefined;
    return value.map((itemValue) => projectVisibleValue(item, itemValue, role));
  }
  return value;
}

/** Collects API-path prefixes hidden from one dashboard role. */
function collectHiddenPaths(
  fields: ReadonlyArray<CollectionFieldDefinition>,
  role: ProjectRole,
): ReadonlyArray<string> {
  const hidden: Array<string> = [];
  /** Stops at hidden containers so descendant identities never enter dashboard feedback. */
  const visit = (field: CollectionFieldDefinition, path: string): void => {
    if (!isFieldVisible(field, role)) {
      hidden.push(path);
      return;
    }
    if (field.kind !== "object") return;
    for (const child of field.children) {
      if (child.apiKey !== null) visit(child, `${path}.${child.apiKey}`);
    }
  };
  for (const field of fields) {
    if (field.apiKey !== null) visit(field, field.apiKey);
  }
  return hidden;
}

/** Checks whether a validation path falls inside a field hidden from the dashboard role. */
function isHiddenIssuePath(path: string, hiddenPaths: ReadonlyArray<string>): boolean {
  return hiddenPaths.some(
    (hidden) => path === hidden || path.startsWith(`${hidden}.`) || path.startsWith(`${hidden}[`),
  );
}

/** Projects full machine issues or coalesced role-safe dashboard feedback. */
function projectValidationIssues(
  issues: ReadonlyArray<EntryDocumentProjectionIssue>,
  fields: ReadonlyArray<CollectionFieldDefinition>,
  role: ProjectRole | null,
  sourceCapped: boolean,
) {
  if (role === null) return { issues, capped: sourceCapped };
  const hiddenPaths = collectHiddenPaths(fields, role);
  const collector = makeEntryDocumentProjectionIssueCollector(previewLimits.issues);
  let hiddenIssueFound = false;
  for (const issue of issues) {
    if (isHiddenIssuePath(issue.path, hiddenPaths)) {
      hiddenIssueFound = true;
      continue;
    }
    addEntryDocumentProjectionIssue(collector, issue);
  }
  if (hiddenIssueFound) {
    addEntryDocumentProjectionIssue(collector, {
      fieldId: null,
      path: "data",
      code: "hidden_field_invalid",
      message: "One or more hidden fields have validation issues.",
    });
  }
  return { issues: collector.issues, capped: sourceCapped || collector.capped };
}

/** Compiles one safe persisted source selection without requiring publication or reference expansion. */
export function compilePreviewDocument(
  input: CompilePreviewDocumentInput,
): PreviewDocumentCompilationResult {
  const hard = makeEntryDocumentProjectionIssueCollector(previewLimits.issues);
  const definition = validateDefinitionTree(input.fields);
  for (const issue of definition.issues) {
    addEntryDocumentProjectionIssue(hard, { fieldId: null, ...issue });
  }
  if (definition.capped) hard.capped = true;
  for (const issue of [
    ...validateEntryDocument(input.sharedValues),
    ...validateEntryDocument(input.localizedValues),
  ]) {
    addEntryDocumentProjectionIssue(hard, { fieldId: null, ...issue });
  }
  if (hard.issues.length > 0) return { ok: false, issues: hard.issues, capped: hard.capped };

  const soft = makeEntryDocumentProjectionIssueCollector(previewLimits.issues);
  const projectedData: Record<string, unknown> = {};
  for (const field of input.fields) {
    if (field.apiKey === null) continue;
    const selected = selectEntryFieldValue(
      field,
      Reflect.get(input.sharedValues, field.id),
      Reflect.get(input.localizedValues, field.id),
      null,
      hard,
      field.apiKey,
    );
    const validation = validateFieldValue(field, selected, field.apiKey);
    for (const issue of validation.issues) {
      addEntryDocumentProjectionIssue(soft, { fieldId: field.id, ...issue });
    }
    if (validation.capped) soft.capped = true;
    const pruned = pruneEmptyProjectedObjects(field, validation.value, null);
    const visible = projectVisibleValue(field, pruned, input.role);
    if (visible !== undefined) Reflect.set(projectedData, field.apiKey, visible);
  }
  if (hard.issues.length > 0) return { ok: false, issues: hard.issues, capped: hard.capped };

  const validation = projectValidationIssues(soft.issues, input.fields, input.role, soft.capped);
  const item: PreviewDocumentCandidate = {
    id: input.entryId,
    collectionId: input.collectionId,
    collection: input.collectionKey,
    locale: input.locale,
    preview: { version: 1, ...input.authority },
    data: projectedData,
    validation: {
      valid: soft.issues.length === 0,
      issues: validation.issues,
      capped: validation.capped,
    },
  };
  const responseBytes = textEncoder.encode(
    JSON.stringify({
      ok: true,
      data: item,
      error: null,
      message: "Preview entry loaded.",
    }),
  ).byteLength;
  return { ok: true, item, responseBytes };
}
