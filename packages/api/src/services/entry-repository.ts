// Persists tenant-scoped named entries, independent draft heads, immutable revisions, receipts, and audits.

import { createHash } from "node:crypto";

import { db } from "@framerfordevs/db";
import { and, desc, eq, inArray, lt, or, sql } from "@framerfordevs/db/query";
import {
  cmsCollectionSchemaHead,
  cmsEntry,
  cmsEntryDraftCommand,
  cmsEntryLocaleDraft,
  cmsEntryLocaleRevision,
  cmsEntrySharedDraft,
  cmsEntrySharedRevision,
  cmsSchemaRevision,
  cmsSchemaRevisionField,
} from "@framerfordevs/db/schema/cms";
import { projectLocale } from "@framerfordevs/db/schema/locale";
import { auditEvent, environment, projectCapability } from "@framerfordevs/db/schema/platform";
import { Context, Effect, Layer, Schema } from "effect";

import { ProjectRole } from "../contracts/access";
import { ApiErrorDetail } from "../contracts/api-response";
import {
  CmsEntry,
  CmsEntryDraft,
  EntryId,
  CmsEntryPage,
  EntryRevisionPage,
  EntryRevisionSummary,
  EntryValidation,
  EntryValidationIssue,
  SaveEntryDraftResult,
  type CreateEntryInput,
  type EntryValueMutation,
  type EntryValues,
  type GetEntryDraftInput,
  type ListEntriesInput,
  type ListEntryRevisionsInput,
  type RenameEntryInput,
  type RestoreEntryRevisionInput,
  type SaveEntryDraftInput,
} from "../contracts/entries";
import {
  CmsCapabilityRequiredFailure,
  ConflictFailure,
  DatabaseFailure,
  EntryCommandConflictFailure,
  EntryDraftConflictFailure,
  EntryRevisionIncompatibleFailure,
  ForbiddenFailure,
  InvalidStateTransitionFailure,
  LocaleUnavailableFailure,
  NotFoundFailure,
  PublishedSchemaRequiredFailure,
  ValidationFailure,
  VersionConflictFailure,
} from "../contracts/errors";
import {
  decodeEntryCursor,
  decodeEntryRevisionCursor,
  encodeEntryCursor,
  encodeEntryRevisionCursor,
} from "../contracts/entry-cursor";
import type { AuthUserId } from "../contracts/platform";
import {
  CollectionFieldDefinition,
  ContractHash,
  defaultFieldEditorMetadata,
  type CollectionFieldDefinition as CollectionField,
} from "../contracts/schemas";
import { flattenFieldTree, reconstructFieldTree } from "../lib/field-tree";
import { validateFieldValue } from "../lib/field-validation";
import { applyEntryMutations, canonicalizeEntryValue } from "../lib/entry-values";
import {
  type ApplicationDb,
  type ApplicationExecutor,
  authorizeUserProject,
  selectUserProjectAccess,
} from "./project-access";
import { isRoleAllowed } from "./policy";
import { hashSchemaContract } from "./schema-engine";

function outcome<K extends string>(kind: K): { readonly kind: K } {
  return { kind };
}

function outcomeWith<K extends string, A extends object>(
  kind: K,
  value: A,
): { readonly kind: K } & A {
  return { kind, ...value };
}

function databaseFailure(operation: string, cause: unknown) {
  return DatabaseFailure.make({ operation, cause });
}

function toIso(value: Date): string {
  return value.toISOString();
}

function digest(value: unknown): string {
  return createHash("sha256").update(canonicalizeEntryValue(value)).digest("hex");
}

function fingerprintJson(value: unknown): string {
  return digest(JSON.parse(JSON.stringify(value)));
}

function entryValue(row: typeof cmsEntry.$inferSelect) {
  return Schema.decodeUnknownSync(CmsEntry)({
    id: row.id,
    workspaceId: row.workspaceId,
    projectId: row.projectId,
    environmentId: row.environmentId,
    collectionId: row.collectionId,
    displayName: row.displayName,
    nameVersion: row.nameVersion,
    createdByUserId: row.createdByUserId,
    changedByUserId: row.changedByUserId,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  });
}

function entryValues(value: unknown): EntryValues {
  return Schema.decodeUnknownSync(Schema.Record({ key: Schema.UUID, value: Schema.Unknown }))(
    value,
  );
}

function fieldValue(row: typeof cmsSchemaRevisionField.$inferSelect): CollectionField {
  return Schema.decodeUnknownSync(CollectionFieldDefinition)({
    id: row.fieldId,
    parentFieldId: row.parentFieldId,
    nodeRole: row.nodeRole,
    apiKey: row.apiKey,
    displayLabel: row.displayLabel,
    kind: row.kind,
    required: row.required,
    localization: row.localization,
    deprecated: row.deprecated,
    position: row.position,
    editor:
      Object.keys(row.editorMetadata).length === 0
        ? defaultFieldEditorMetadata
        : row.editorMetadata,
    configuration: row.configuration,
    children: [],
  });
}

interface PublishedContract {
  readonly revision: typeof cmsSchemaRevision.$inferSelect;
  readonly fields: ReadonlyArray<CollectionField>;
  readonly contractHash: ContractHash;
}

async function loadPublishedContract(
  executor: ApplicationExecutor,
  input: {
    readonly projectId: string;
    readonly environmentId: string;
    readonly collectionId: string;
  },
): Promise<PublishedContract | null | undefined> {
  const [head] = await executor
    .select({
      revisionId: cmsCollectionSchemaHead.currentPublishedRevisionId,
      workspaceId: cmsCollectionSchemaHead.workspaceId,
    })
    .from(cmsCollectionSchemaHead)
    .where(
      and(
        eq(cmsCollectionSchemaHead.collectionId, input.collectionId),
        eq(cmsCollectionSchemaHead.projectId, input.projectId),
        eq(cmsCollectionSchemaHead.environmentId, input.environmentId),
      ),
    )
    .limit(1);
  if (!head) return undefined;
  if (head.revisionId === null) return null;
  const [revision] = await executor
    .select()
    .from(cmsSchemaRevision)
    .where(
      and(
        eq(cmsSchemaRevision.id, head.revisionId),
        eq(cmsSchemaRevision.collectionId, input.collectionId),
        eq(cmsSchemaRevision.projectId, input.projectId),
        eq(cmsSchemaRevision.environmentId, input.environmentId),
        eq(cmsSchemaRevision.workspaceId, head.workspaceId),
      ),
    )
    .limit(1);
  if (!revision) throw new Error("Published schema head does not resolve to a revision.");
  const rows = await executor
    .select()
    .from(cmsSchemaRevisionField)
    .where(
      and(
        eq(cmsSchemaRevisionField.revisionId, revision.id),
        eq(cmsSchemaRevisionField.collectionId, input.collectionId),
        eq(cmsSchemaRevisionField.projectId, input.projectId),
        eq(cmsSchemaRevisionField.environmentId, input.environmentId),
        eq(cmsSchemaRevisionField.workspaceId, head.workspaceId),
      ),
    )
    .orderBy(
      cmsSchemaRevisionField.parentFieldId,
      cmsSchemaRevisionField.position,
      cmsSchemaRevisionField.fieldId,
    );
  const tree = reconstructFieldTree(rows.map(fieldValue));
  if (!tree.valid) throw new Error("Published field tree is invalid.");
  return {
    revision,
    fields: tree.roots,
    contractHash: hashSchemaContract({
      formatVersion: revision.formatVersion,
      validationProfile: revision.validationProfile,
      currencyRegistryProfile: revision.currencyRegistryProfile,
      collectionApiKey: revision.collectionApiKey,
      fields: tree.roots,
    }),
  };
}

async function lockProjectShared(executor: ApplicationExecutor, projectId: string) {
  await executor.execute(sql`select id from project where id = ${projectId} for share`);
}

async function lockCollectionShared(executor: ApplicationExecutor, collectionId: string) {
  await executor.execute(sql`select id from cms_collection where id = ${collectionId} for share`);
}

async function lockEntry(executor: ApplicationExecutor, entryId: string) {
  await executor.execute(sql`select id from cms_entry where id = ${entryId} for update`);
}

async function lockCreateCommand(
  executor: ApplicationExecutor,
  collectionId: string,
  commandId: string,
) {
  await executor.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${`${collectionId}:${commandId}`}, 0))`,
  );
}

interface ScopeAccess {
  readonly workspaceId: string;
  readonly role: typeof ProjectRole.Type;
  readonly locale: typeof projectLocale.$inferSelect;
  readonly localeAccessMode: string;
}

type ScopeResult =
  | { readonly kind: "success"; readonly access: ScopeAccess }
  | { readonly kind: "not_found" }
  | { readonly kind: "forbidden" }
  | { readonly kind: "locale_unavailable" }
  | { readonly kind: "cms_required" }
  | { readonly kind: "invalid_state" };

async function authorizeScope(
  executor: ApplicationExecutor,
  actorId: AuthUserId,
  input: { readonly projectId: string; readonly environmentId: string; readonly locale: string },
  action: "content.read" | "content.write",
): Promise<ScopeResult> {
  const access = await selectUserProjectAccess(executor, actorId, input.projectId);
  if (!access) return outcome("not_found");
  const [locale] = await executor
    .select()
    .from(projectLocale)
    .where(
      and(
        eq(projectLocale.workspaceId, access.project.workspaceId),
        eq(projectLocale.projectId, input.projectId),
        sql`lower(${projectLocale.tag}) = lower(${input.locale})`,
        eq(projectLocale.status, "enabled"),
      ),
    )
    .limit(1);
  if (!locale) return outcome("locale_unavailable");
  const authorization = await authorizeUserProject(
    executor,
    actorId,
    input.projectId,
    action,
    locale.id,
  );
  if (authorization.kind === "not_found") return outcome("not_found");
  if (authorization.kind === "forbidden") return outcome("forbidden");
  if (authorization.access.project.archivedAt) return outcome("invalid_state");
  const [environmentRow] = await executor
    .select({ id: environment.id })
    .from(environment)
    .where(
      and(
        eq(environment.id, input.environmentId),
        eq(environment.projectId, input.projectId),
        eq(environment.workspaceId, access.project.workspaceId),
      ),
    )
    .limit(1);
  if (!environmentRow) return outcome("not_found");
  const [capability] = await executor
    .select({ id: projectCapability.id })
    .from(projectCapability)
    .where(
      and(
        eq(projectCapability.workspaceId, access.project.workspaceId),
        eq(projectCapability.projectId, input.projectId),
        eq(projectCapability.key, "cms"),
        eq(projectCapability.status, "enabled"),
      ),
    )
    .limit(1);
  if (!capability) return outcome("cms_required");
  const role = Schema.decodeUnknownSync(ProjectRole)(access.role);
  return outcomeWith("success", {
    access: {
      workspaceId: access.project.workspaceId,
      role,
      locale,
      localeAccessMode: access.localeAccessMode,
    },
  });
}

function visible(field: CollectionField, role: string): boolean {
  return field.editor.visibleToRoles.some((candidate) => candidate === role);
}

function editable(field: CollectionField, role: string): boolean {
  return (
    visible(field, role) && field.editor.editableByRoles.some((candidate) => candidate === role)
  );
}

interface FieldIndexItem {
  readonly field: CollectionField;
  readonly effectiveLocalization: "shared" | "localized" | "mixed" | null;
  readonly parent: CollectionField | null;
}

function indexFields(fields: ReadonlyArray<CollectionField>): ReadonlyMap<string, FieldIndexItem> {
  const index = new Map<string, FieldIndexItem>();
  const stack: Array<{
    readonly field: CollectionField;
    readonly inherited: "shared" | "localized" | null;
    readonly parent: CollectionField | null;
  }> = fields.map((field) => ({ field, inherited: null, parent: null }));
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) break;
    const effective = current.inherited ?? current.field.localization;
    index.set(current.field.id, {
      field: current.field,
      effectiveLocalization: effective,
      parent: current.parent,
    });
    const inherited =
      current.field.kind === "list" || effective !== "mixed"
        ? effective === "mixed"
          ? null
          : effective
        : null;
    for (const child of current.field.children)
      stack.push({ field: child, inherited, parent: current.field });
  }
  return index;
}

function mutationRootIds(mutations: ReadonlyArray<EntryValueMutation>): Array<string> {
  return [
    ...new Set(
      mutations.flatMap((mutation) =>
        typeof mutation.path[0] === "string" ? [mutation.path[0]] : [],
      ),
    ),
  ].sort();
}

function mutationAuthorizationIssues(
  mutations: ReadonlyArray<EntryValueMutation>,
  fields: ReadonlyArray<CollectionField>,
  role: string,
  scope: "shared" | "localized",
): ReadonlyArray<ApiErrorDetail> {
  const byId = indexFields(fields);
  const issues: Array<ApiErrorDetail> = [];
  for (const mutation of mutations) {
    let current: CollectionField | null = null;
    let valid = true;
    for (const segment of mutation.path) {
      if (typeof segment === "number") {
        if (current?.kind !== "list" || current.children.length !== 1) {
          valid = false;
          break;
        }
        current = current.children[0] ?? null;
        if (!current || !editable(current, role)) {
          valid = false;
          break;
        }
        continue;
      }
      const indexed = byId.get(segment);
      if (!indexed || !editable(indexed.field, role)) {
        valid = false;
        break;
      }
      if (current === null) {
        if (indexed.parent !== null) {
          valid = false;
          break;
        }
      } else if (current.kind === "object") {
        if (indexed.parent?.id !== current.id) {
          valid = false;
          break;
        }
      } else {
        valid = false;
        break;
      }
      current = indexed.field;
    }
    const indexed = current ? byId.get(current.id) : undefined;
    if (!valid || !current || !indexed || indexed.effectiveLocalization !== scope) {
      issues.push(
        ApiErrorDetail.make({
          path: "mutations",
          code: "entry_path_unavailable",
          message: "One or more mutation paths are unavailable for this draft partition.",
        }),
      );
      break;
    }
    if (
      (mutation.operation === "list_insert" || mutation.operation === "list_remove") &&
      current.kind !== "list"
    ) {
      issues.push(
        ApiErrorDetail.make({
          path: "mutations",
          code: "entry_path_unavailable",
          message: "One or more mutation paths are unavailable for this draft partition.",
        }),
      );
      break;
    }
  }
  return issues;
}

function snapshotEditable(
  values: Readonly<Record<string, unknown>>,
  fields: ReadonlyArray<CollectionField>,
  role: string,
  scope: "shared" | "localized",
): boolean {
  const indexed = indexFields(fields);
  const roots = new Map<string, CollectionField>(fields.map((field) => [field.id, field]));
  const visit = (field: CollectionField, value: unknown): boolean => {
    if (!editable(field, role)) return false;
    const effective = indexed.get(field.id)?.effectiveLocalization;
    if (effective === "mixed") {
      if (
        field.kind !== "object" ||
        typeof value !== "object" ||
        value === null ||
        Array.isArray(value)
      )
        return false;
      const children = new Map<string, CollectionField>(
        field.children.map((child) => [child.id, child]),
      );
      return Object.keys(value).every((id) => {
        const child = children.get(id);
        return child !== undefined && visit(child, Reflect.get(value, id));
      });
    }
    if (effective !== scope) return false;
    if (
      field.kind === "object" &&
      typeof value === "object" &&
      value !== null &&
      !Array.isArray(value)
    ) {
      const children = new Map<string, CollectionField>(
        field.children.map((child) => [child.id, child]),
      );
      return Object.keys(value).every((id) => {
        const child = children.get(id);
        return child !== undefined && visit(child, Reflect.get(value, id));
      });
    }
    const item = field.children[0];
    if (field.kind === "list" && item && Array.isArray(value))
      return value.every((itemValue) => visit(item, itemValue));
    return true;
  };
  return Object.keys(values).every((id) => {
    const field = roots.get(id);
    return field !== undefined && visit(field, Reflect.get(values, id));
  });
}

function projectValues(
  values: Readonly<Record<string, unknown>>,
  fields: ReadonlyArray<CollectionField>,
  role: string,
): EntryValues {
  const projectField = (field: CollectionField, value: unknown): unknown => {
    if (!visible(field, role)) return undefined;
    if (
      field.kind === "object" &&
      typeof value === "object" &&
      value !== null &&
      !Array.isArray(value)
    ) {
      const result: Record<string, unknown> = {};
      for (const child of field.children) {
        const childValue = Reflect.get(value, child.id);
        const projected = projectField(child, childValue);
        if (projected !== undefined) Reflect.set(result, child.id, projected);
      }
      return Object.keys(result).length > 0 ? result : undefined;
    }
    const listItem = field.children[0];
    if (field.kind === "list" && Array.isArray(value) && listItem) {
      return value.map((item) => projectField(listItem, item));
    }
    return value;
  };
  const result: Record<string, unknown> = {};
  for (const field of fields) {
    const projected = projectField(field, Reflect.get(values, field.id));
    if (projected !== undefined) Reflect.set(result, field.id, projected);
  }
  return entryValues(result);
}

/** Maps stable-ID management values to the API-key shape expected by field validation. */
function toFieldContractValue(field: CollectionField, value: unknown): unknown {
  if (
    field.kind === "object" &&
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  ) {
    const result: Record<string, unknown> = {};
    for (const child of field.children) {
      if (child.apiKey === null) continue;
      const childValue = Reflect.get(value, child.id);
      if (childValue !== undefined)
        Reflect.set(result, child.apiKey, toFieldContractValue(child, childValue));
    }
    return result;
  }
  const item = field.children[0];
  if (field.kind === "list" && Array.isArray(value) && item)
    return value.map((itemValue) => toFieldContractValue(item, itemValue));
  return value;
}

/** Validates merged shared/localized values while preserving stable-ID persistence. */
function validateDraftValues(options: {
  readonly fields: ReadonlyArray<CollectionField>;
  readonly sharedValues: EntryValues;
  readonly localizedValues: EntryValues;
  readonly locale: typeof projectLocale.$inferSelect;
}): EntryValidation {
  const fieldIndex = indexFields(options.fields);
  const issues: Array<EntryValidationIssue> = [];
  let capped = false;
  const childValue = (value: unknown, fieldId: string) =>
    typeof value === "object" && value !== null && !Array.isArray(value)
      ? Reflect.get(value, fieldId)
      : undefined;
  const visit = (
    field: CollectionField,
    sharedValue: unknown,
    localizedValue: unknown,
    path: string,
    inherited: "shared" | "localized" | null,
  ) => {
    if (issues.length >= 50) {
      capped = true;
      return;
    }
    const effective = inherited ?? field.localization;
    if (effective === "mixed" && field.kind === "object") {
      for (const child of field.children) {
        const childEffective = fieldIndex.get(child.id)?.effectiveLocalization;
        visit(
          child,
          childValue(sharedValue, child.id),
          childValue(localizedValue, child.id),
          `${path}.${child.apiKey ?? child.id}`,
          childEffective === "shared" || childEffective === "localized" ? childEffective : null,
        );
      }
      return;
    }
    const value = effective === "shared" ? sharedValue : localizedValue;
    const validation = validateFieldValue(field, toFieldContractValue(field, value), path);
    for (const issue of validation.issues) {
      if (issues.length >= 50) {
        capped = true;
        break;
      }
      issues.push(
        Schema.decodeUnknownSync(EntryValidationIssue)({
          fieldId: field.id,
          path: issue.path,
          scope: effective === "shared" ? "shared" : "localized",
          localeId: effective === "shared" ? null : options.locale.id,
          locale: effective === "shared" ? null : options.locale.tag,
          code: issue.code,
          message: issue.message,
        }),
      );
    }
  };
  for (const field of options.fields) {
    visit(
      field,
      Reflect.get(options.sharedValues, field.id),
      Reflect.get(options.localizedValues, field.id),
      field.apiKey ?? field.id,
      null,
    );
  }
  return EntryValidation.make({ valid: issues.length === 0, issues, capped });
}

const hardDraftIssueCodes = new Set([
  "null_unsupported",
  "string_required",
  "short_text_control",
  "long_text_control",
  "number_invalid",
  "boolean_invalid",
  "money_invalid",
  "money_keys_invalid",
  "object_invalid",
  "object_key_unknown",
  "list_invalid",
  "list_item_missing",
  "json_cycle",
  "json_depth_exceeded",
  "json_key_unsafe",
  "json_nodes_exceeded",
  "json_number_invalid",
  "json_object_invalid",
  "json_serialization_failed",
  "json_size_exceeded",
  "json_sparse_array",
  "json_type_invalid",
  "reference_invalid",
  "external_asset_invalid",
  "external_asset_key_unknown",
  "external_asset_source",
  "external_asset_url",
]);

function hardDraftIssues(validation: EntryValidation): ReadonlyArray<ApiErrorDetail> {
  return validation.issues
    .filter(
      (issue) =>
        hardDraftIssueCodes.has(issue.code) ||
        (issue.code.startsWith("rich_text_") && issue.code !== "rich_text_length_invalid"),
    )
    .map((issue) =>
      ApiErrorDetail.make({ path: issue.path, code: issue.code, message: issue.message }),
    );
}

interface ReferenceUse {
  readonly entryId: string;
  readonly targetCollectionId: string;
  readonly fieldId: string;
  readonly path: string;
  readonly scope: "shared" | "localized";
}

function collectReferenceUses(options: {
  readonly fields: ReadonlyArray<CollectionField>;
  readonly sharedValues: EntryValues;
  readonly localizedValues: EntryValues;
}): ReadonlyArray<ReferenceUse> {
  const uses: Array<ReferenceUse> = [];
  const indexed = indexFields(options.fields);
  const visit = (
    field: CollectionField,
    value: unknown,
    path: string,
    effective: "shared" | "localized",
  ) => {
    if (field.kind === "reference" && Schema.is(EntryId)(value)) {
      uses.push({
        entryId: value,
        targetCollectionId: field.configuration.targetCollectionId,
        fieldId: field.id,
        path,
        scope: effective,
      });
      return;
    }
    if (
      field.kind === "object" &&
      typeof value === "object" &&
      value !== null &&
      !Array.isArray(value)
    ) {
      for (const child of field.children) {
        visit(
          child,
          Reflect.get(value, child.id),
          `${path}.${child.apiKey ?? child.id}`,
          effective,
        );
      }
      return;
    }
    const item = field.children[0];
    if (field.kind === "list" && item && Array.isArray(value)) {
      value.forEach((itemValue, index) => visit(item, itemValue, `${path}[${index}]`, effective));
    }
  };
  for (const field of options.fields) {
    const effective = indexed.get(field.id)?.effectiveLocalization;
    if (effective === "shared" || effective === "localized") {
      const values = effective === "shared" ? options.sharedValues : options.localizedValues;
      visit(field, Reflect.get(values, field.id), field.apiKey ?? field.id, effective);
      continue;
    }
    if (effective === "mixed" && field.kind === "object") {
      const sharedRoot = Reflect.get(options.sharedValues, field.id);
      const localizedRoot = Reflect.get(options.localizedValues, field.id);
      for (const child of field.children) {
        const childEffective = indexed.get(child.id)?.effectiveLocalization;
        if (childEffective !== "shared" && childEffective !== "localized") continue;
        const root = childEffective === "shared" ? sharedRoot : localizedRoot;
        const childValue =
          typeof root === "object" && root !== null && !Array.isArray(root)
            ? Reflect.get(root, child.id)
            : undefined;
        visit(
          child,
          childValue,
          `${field.apiKey ?? field.id}.${child.apiKey ?? child.id}`,
          childEffective,
        );
      }
    }
  }
  return uses;
}

async function validateReferenceAvailability(
  executor: ApplicationExecutor,
  options: {
    readonly workspaceId: string;
    readonly projectId: string;
    readonly environmentId: string;
    readonly locale: typeof projectLocale.$inferSelect;
    readonly fields: ReadonlyArray<CollectionField>;
    readonly sharedValues: EntryValues;
    readonly localizedValues: EntryValues;
    readonly validation: EntryValidation;
  },
): Promise<{ readonly validation: EntryValidation; readonly limitExceeded: boolean }> {
  const uses = collectReferenceUses(options);
  const uniqueIds = new Set(uses.map((use) => use.entryId));
  if (uniqueIds.size > 1_000) return { validation: options.validation, limitExceeded: true };
  const available = new Set<string>();
  const groups = new Map<string, Array<string>>();
  for (const use of uses) {
    const ids = groups.get(use.targetCollectionId) ?? [];
    if (!ids.includes(use.entryId)) ids.push(use.entryId);
    groups.set(use.targetCollectionId, ids);
  }
  for (const [targetCollectionId, ids] of groups) {
    if (ids.length === 0) continue;
    const rows = await executor
      .select({ id: cmsEntry.id })
      .from(cmsEntry)
      .where(
        and(
          eq(cmsEntry.workspaceId, options.workspaceId),
          eq(cmsEntry.projectId, options.projectId),
          eq(cmsEntry.environmentId, options.environmentId),
          eq(cmsEntry.collectionId, targetCollectionId),
          inArray(cmsEntry.id, ids),
        ),
      );
    for (const row of rows) available.add(`${targetCollectionId}:${row.id}`);
  }
  const issues = [...options.validation.issues];
  let capped = options.validation.capped;
  for (const use of uses) {
    if (available.has(`${use.targetCollectionId}:${use.entryId}`)) continue;
    if (issues.length >= 50) {
      capped = true;
      break;
    }
    issues.push(
      Schema.decodeUnknownSync(EntryValidationIssue)({
        fieldId: use.fieldId,
        path: use.path,
        scope: use.scope,
        localeId: use.scope === "shared" ? null : options.locale.id,
        locale: use.scope === "shared" ? null : options.locale.tag,
        code: "reference_unavailable",
        message: "The referenced entry is unavailable in the configured collection.",
      }),
    );
  }
  return {
    validation: EntryValidation.make({ valid: issues.length === 0, issues, capped }),
    limitExceeded: false,
  };
}

function referenceLimitFailure() {
  return ApiErrorDetail.make({
    path: "values",
    code: "entry_references_exceeded",
    message: "One selected-locale draft cannot exceed 1000 unique references.",
  });
}

function validationFailureFromKernel(
  issues: ReadonlyArray<{ readonly path: string; readonly code: string; readonly message: string }>,
) {
  return ValidationFailure.make({
    details: issues.slice(0, 50).map((issue) => ApiErrorDetail.make(issue)),
  });
}

function conflictDetails(options: {
  readonly expectedShared: number;
  readonly currentShared: number;
  readonly sharedRevisionId: string | null;
  readonly expectedLocalized: number;
  readonly currentLocalized: number;
  readonly localizedRevisionId: string | null;
  readonly sharedTouched: boolean;
  readonly localizedTouched: boolean;
}) {
  const details: Array<ApiErrorDetail> = [];
  if (options.sharedTouched && options.expectedShared !== options.currentShared) {
    details.push(
      ApiErrorDetail.make({
        path: "expectedSharedVersion",
        code: "entry_draft_stale",
        message: "The shared draft changed.",
        scope: "shared",
        expectedVersion: options.expectedShared,
        currentVersion: options.currentShared,
        currentRevisionId: options.sharedRevisionId,
      }),
    );
  }
  if (options.localizedTouched && options.expectedLocalized !== options.currentLocalized) {
    details.push(
      ApiErrorDetail.make({
        path: "expectedLocalizedVersion",
        code: "entry_draft_stale",
        message: "The localized draft changed.",
        scope: "localized",
        expectedVersion: options.expectedLocalized,
        currentVersion: options.currentLocalized,
        currentRevisionId: options.localizedRevisionId,
      }),
    );
  }
  return details;
}

function makeAuditValues(options: {
  readonly workspaceId: string;
  readonly projectId: string;
  readonly environmentId: string;
  readonly actorId: AuthUserId;
  readonly action: string;
  readonly resourceType: string;
  readonly resourceId: string;
  readonly requestId: string;
}) {
  return { ...options, actorType: "user" };
}

type EntryFailureStage = "revision" | "head" | "audit" | "receipt";

interface RepositoryOptions {
  readonly database?: ApplicationDb;
  readonly failAfter?: EntryFailureStage;
}

export function makeEntryRepository(options: RepositoryOptions = {}) {
  const database = options.database ?? db;
  const failAfter = (stage: EntryFailureStage) => {
    if (options.failAfter === stage) throw new Error(`Injected entry failure after ${stage}.`);
  };

  return {
    createEntry: Effect.fn("EntryRepository.createEntry")(function* (
      actorId: AuthUserId,
      input: CreateEntryInput,
      now: Date,
      requestId: string,
    ) {
      const result = yield* Effect.tryPromise({
        try: () =>
          database.transaction(async (transaction) => {
            await lockProjectShared(transaction, input.projectId);
            const scope = await authorizeScope(transaction, actorId, input, "content.write");
            if (scope.kind !== "success") return scope;
            await lockCollectionShared(transaction, input.collectionId);
            await lockCreateCommand(transaction, input.collectionId, input.commandId);
            const contract = await loadPublishedContract(transaction, input);
            if (contract === undefined) return outcome("not_found");
            if (contract === null) return outcome("published_required");
            if (contract.revision.workspaceId !== scope.access.workspaceId)
              return outcome("not_found");
            if (
              contract.revision.id !== input.schemaRevisionId ||
              contract.contractHash !== input.contractHash
            )
              return outcome("conflict");
            const fingerprint = fingerprintJson({
              operation: "create",
              actorId,
              workspaceId: scope.access.workspaceId,
              ...input,
              localeId: scope.access.locale.id,
            });
            const [existing] = await transaction
              .select()
              .from(cmsEntry)
              .where(
                and(
                  eq(cmsEntry.collectionId, input.collectionId),
                  eq(cmsEntry.createCommandId, input.commandId),
                  eq(cmsEntry.workspaceId, scope.access.workspaceId),
                  eq(cmsEntry.projectId, input.projectId),
                  eq(cmsEntry.environmentId, input.environmentId),
                ),
              )
              .limit(1);
            if (existing)
              return existing.createCommandFingerprint === fingerprint
                ? outcomeWith("success", { row: existing })
                : outcome("command_conflict");
            const [row] = await transaction
              .insert(cmsEntry)
              .values({
                workspaceId: scope.access.workspaceId,
                projectId: input.projectId,
                environmentId: input.environmentId,
                collectionId: input.collectionId,
                displayName: input.displayName,
                nameVersion: 1,
                createCommandId: input.commandId,
                createCommandFingerprint: fingerprint,
                createdByUserId: actorId,
                changedByUserId: actorId,
                createdAt: now,
                updatedAt: now,
              })
              .returning();
            if (!row) throw new Error("Entry insert returned no row.");
            await transaction.insert(auditEvent).values(
              makeAuditValues({
                workspaceId: row.workspaceId,
                projectId: row.projectId,
                environmentId: row.environmentId,
                actorId,
                action: "cms.entry.created",
                resourceType: "cms_entry",
                resourceId: row.id,
                requestId,
              }),
            );
            failAfter("audit");
            return outcomeWith("success", { row });
          }),
        catch: (cause) => databaseFailure("entry.create", cause),
      });
      if (result.kind === "not_found")
        return yield* NotFoundFailure.make({ resource: "collection" });
      if (result.kind === "forbidden") return yield* ForbiddenFailure.make();
      if (result.kind === "locale_unavailable") return yield* LocaleUnavailableFailure.make();
      if (result.kind === "cms_required") return yield* CmsCapabilityRequiredFailure.make();
      if (result.kind === "invalid_state") return yield* InvalidStateTransitionFailure.make();
      if (result.kind === "published_required") return yield* PublishedSchemaRequiredFailure.make();
      if (result.kind === "conflict") return yield* ConflictFailure.make();
      if (result.kind === "command_conflict") return yield* EntryCommandConflictFailure.make();
      return entryValue(result.row);
    }),

    listEntries: Effect.fn("EntryRepository.listEntries")(function* (
      actorId: AuthUserId,
      input: ListEntriesInput,
    ) {
      const cursor = input.cursor === null ? null : yield* decodeEntryCursor(input.cursor, input);
      const result = yield* Effect.tryPromise({
        try: async () => {
          const scope = await authorizeScope(database, actorId, input, "content.read");
          if (scope.kind !== "success") return scope;
          const rows = await database
            .select({ entry: cmsEntry })
            .from(cmsEntry)
            .where(
              and(
                eq(cmsEntry.workspaceId, scope.access.workspaceId),
                eq(cmsEntry.projectId, input.projectId),
                eq(cmsEntry.environmentId, input.environmentId),
                eq(cmsEntry.collectionId, input.collectionId),
                cursor === null
                  ? undefined
                  : or(
                      lt(cmsEntry.createdAt, new Date(cursor.createdAt)),
                      and(
                        eq(cmsEntry.createdAt, new Date(cursor.createdAt)),
                        lt(cmsEntry.id, cursor.entryId),
                      ),
                    ),
              ),
            )
            .orderBy(desc(cmsEntry.createdAt), desc(cmsEntry.id))
            .limit(input.limit + 1);
          return outcomeWith("success", { rows });
        },
        catch: (cause) => databaseFailure("entry.list", cause),
      });
      if (result.kind === "not_found")
        return yield* NotFoundFailure.make({ resource: "collection" });
      if (result.kind === "forbidden") return yield* ForbiddenFailure.make();
      if (result.kind === "locale_unavailable") return yield* LocaleUnavailableFailure.make();
      if (result.kind === "cms_required") return yield* CmsCapabilityRequiredFailure.make();
      if (result.kind === "invalid_state") return yield* InvalidStateTransitionFailure.make();
      const pageRows = result.rows.slice(0, input.limit);
      const items = pageRows.map((row) => ({
        entry: entryValue(row.entry),
        displayName: row.entry.displayName ?? `Entry ${row.entry.id}`,
      }));
      const last = pageRows.at(-1);
      const nextCursor =
        result.rows.length > input.limit && last
          ? yield* encodeEntryCursor({
              projectId: input.projectId,
              environmentId: input.environmentId,
              collectionId: input.collectionId,
              locale: input.locale,
              createdAt: toIso(last.entry.createdAt),
              entryId: Schema.decodeUnknownSync(CmsEntry)(entryValue(last.entry)).id,
            })
          : null;
      return Schema.decodeUnknownSync(CmsEntryPage)({ items, nextCursor });
    }),

    /** Renames management-only entry metadata with tenant scope and optimistic concurrency. */
    renameEntry: Effect.fn("EntryRepository.renameEntry")(function* (
      actorId: AuthUserId,
      input: RenameEntryInput,
      now: Date,
      requestId: string,
    ) {
      const result = yield* Effect.tryPromise({
        try: () =>
          database.transaction(async (transaction) => {
            await lockProjectShared(transaction, input.projectId);
            const scope = await authorizeScope(transaction, actorId, input, "content.write");
            if (scope.kind !== "success") return scope;
            await lockCollectionShared(transaction, input.collectionId);
            await lockEntry(transaction, input.entryId);
            const [row] = await transaction
              .select()
              .from(cmsEntry)
              .where(
                and(
                  eq(cmsEntry.id, input.entryId),
                  eq(cmsEntry.workspaceId, scope.access.workspaceId),
                  eq(cmsEntry.projectId, input.projectId),
                  eq(cmsEntry.environmentId, input.environmentId),
                  eq(cmsEntry.collectionId, input.collectionId),
                ),
              )
              .limit(1);
            if (!row) return outcome("entry_not_found");
            if (row.nameVersion !== input.expectedNameVersion) return outcome("version_conflict");
            if (row.displayName === input.displayName) return outcomeWith("success", { row });
            const [updated] = await transaction
              .update(cmsEntry)
              .set({
                displayName: input.displayName,
                nameVersion: row.nameVersion + 1,
                changedByUserId: actorId,
                updatedAt: now,
              })
              .where(
                and(
                  eq(cmsEntry.id, row.id),
                  eq(cmsEntry.workspaceId, row.workspaceId),
                  eq(cmsEntry.projectId, row.projectId),
                  eq(cmsEntry.environmentId, row.environmentId),
                  eq(cmsEntry.collectionId, row.collectionId),
                  eq(cmsEntry.nameVersion, input.expectedNameVersion),
                ),
              )
              .returning();
            if (!updated) return outcome("version_conflict");
            await transaction.insert(auditEvent).values(
              makeAuditValues({
                workspaceId: updated.workspaceId,
                projectId: updated.projectId,
                environmentId: updated.environmentId,
                actorId,
                action: "cms.entry.name.updated",
                resourceType: "cms_entry",
                resourceId: updated.id,
                requestId,
              }),
            );
            failAfter("audit");
            return outcomeWith("success", { row: updated });
          }),
        catch: (cause) => databaseFailure("entry.rename", cause),
      });
      if (result.kind === "not_found" || result.kind === "entry_not_found")
        return yield* NotFoundFailure.make({ resource: "entry" });
      if (result.kind === "forbidden") return yield* ForbiddenFailure.make();
      if (result.kind === "locale_unavailable") return yield* LocaleUnavailableFailure.make();
      if (result.kind === "cms_required") return yield* CmsCapabilityRequiredFailure.make();
      if (result.kind === "invalid_state") return yield* InvalidStateTransitionFailure.make();
      if (result.kind === "version_conflict") return yield* VersionConflictFailure.make();
      return entryValue(result.row);
    }),

    getDraft: Effect.fn("EntryRepository.getDraft")(function* (
      actorId: AuthUserId,
      input: GetEntryDraftInput,
    ) {
      const result = yield* Effect.tryPromise({
        try: async () => {
          const scope = await authorizeScope(database, actorId, input, "content.read");
          if (scope.kind !== "success") return scope;
          const contract = await loadPublishedContract(database, input);
          if (contract === undefined) return outcome("not_found");
          if (contract === null) return outcome("published_required");
          if (contract.revision.workspaceId !== scope.access.workspaceId)
            return outcome("not_found");
          const [row] = await database
            .select()
            .from(cmsEntry)
            .where(
              and(
                eq(cmsEntry.id, input.entryId),
                eq(cmsEntry.workspaceId, scope.access.workspaceId),
                eq(cmsEntry.projectId, input.projectId),
                eq(cmsEntry.environmentId, input.environmentId),
                eq(cmsEntry.collectionId, input.collectionId),
              ),
            )
            .limit(1);
          if (!row) return outcome("entry_not_found");
          const [sharedHead] = await database
            .select()
            .from(cmsEntrySharedDraft)
            .where(
              and(
                eq(cmsEntrySharedDraft.entryId, row.id),
                eq(cmsEntrySharedDraft.workspaceId, row.workspaceId),
                eq(cmsEntrySharedDraft.collectionId, row.collectionId),
              ),
            )
            .limit(1);
          const [localeHead] = await database
            .select()
            .from(cmsEntryLocaleDraft)
            .where(
              and(
                eq(cmsEntryLocaleDraft.entryId, row.id),
                eq(cmsEntryLocaleDraft.localeId, scope.access.locale.id),
                eq(cmsEntryLocaleDraft.workspaceId, row.workspaceId),
                eq(cmsEntryLocaleDraft.collectionId, row.collectionId),
              ),
            )
            .limit(1);
          const [sharedRevision] = sharedHead
            ? await database
                .select()
                .from(cmsEntrySharedRevision)
                .where(
                  and(
                    eq(cmsEntrySharedRevision.id, sharedHead.currentRevisionId),
                    eq(cmsEntrySharedRevision.entryId, row.id),
                    eq(cmsEntrySharedRevision.workspaceId, row.workspaceId),
                    eq(cmsEntrySharedRevision.collectionId, row.collectionId),
                  ),
                )
                .limit(1)
            : [];
          const [localeRevision] = localeHead
            ? await database
                .select()
                .from(cmsEntryLocaleRevision)
                .where(
                  and(
                    eq(cmsEntryLocaleRevision.id, localeHead.currentRevisionId),
                    eq(cmsEntryLocaleRevision.entryId, row.id),
                    eq(cmsEntryLocaleRevision.localeId, scope.access.locale.id),
                    eq(cmsEntryLocaleRevision.workspaceId, row.workspaceId),
                    eq(cmsEntryLocaleRevision.collectionId, row.collectionId),
                  ),
                )
                .limit(1)
            : [];
          const sharedValues = entryValues(sharedRevision?.values ?? {});
          const localizedValues = entryValues(localeRevision?.values ?? {});
          const references = await validateReferenceAvailability(database, {
            workspaceId: row.workspaceId,
            projectId: row.projectId,
            environmentId: row.environmentId,
            locale: scope.access.locale,
            fields: contract.fields,
            sharedValues,
            localizedValues,
            validation: validateDraftValues({
              fields: contract.fields,
              sharedValues,
              localizedValues,
              locale: scope.access.locale,
            }),
          });
          return outcomeWith("success", {
            row,
            scope,
            contract,
            sharedHead,
            localeHead,
            sharedRevision,
            localeRevision,
            sharedValues,
            localizedValues,
            validation: references.validation,
          });
        },
        catch: (cause) => databaseFailure("entry.get_draft", cause),
      });
      if (result.kind === "not_found")
        return yield* NotFoundFailure.make({ resource: "collection" });
      if (result.kind === "entry_not_found")
        return yield* NotFoundFailure.make({ resource: "entry" });
      if (result.kind === "forbidden") return yield* ForbiddenFailure.make();
      if (result.kind === "locale_unavailable") return yield* LocaleUnavailableFailure.make();
      if (result.kind === "cms_required") return yield* CmsCapabilityRequiredFailure.make();
      if (result.kind === "invalid_state") return yield* InvalidStateTransitionFailure.make();
      if (result.kind === "published_required") return yield* PublishedSchemaRequiredFailure.make();
      return Schema.decodeUnknownSync(CmsEntryDraft)({
        entry: entryValue(result.row),
        localeId: result.scope.access.locale.id,
        locale: result.scope.access.locale.tag,
        schemaRevisionId: result.contract.revision.id,
        contractHash: result.contract.contractHash,
        sharedVersion: result.sharedHead?.version ?? 0,
        sharedRevisionId: result.sharedRevision?.id ?? null,
        sharedValues: projectValues(
          result.sharedValues,
          result.contract.fields,
          result.scope.access.role,
        ),
        localizedVersion: result.localeHead?.version ?? 0,
        localizedRevisionId: result.localeRevision?.id ?? null,
        localizedValues: projectValues(
          result.localizedValues,
          result.contract.fields,
          result.scope.access.role,
        ),
        canEditShared:
          isRoleAllowed(result.scope.access.role, "content.write") &&
          result.scope.access.localeAccessMode === "all",
        validation: result.validation,
      });
    }),

    saveDraft: Effect.fn("EntryRepository.saveDraft")(function* (
      actorId: AuthUserId,
      input: SaveEntryDraftInput,
      now: Date,
      requestId: string,
    ) {
      const result = yield* Effect.tryPromise({
        try: () =>
          database.transaction(async (transaction) => {
            await lockProjectShared(transaction, input.projectId);
            const scope = await authorizeScope(transaction, actorId, input, "content.write");
            if (scope.kind !== "success") return scope;
            await lockCollectionShared(transaction, input.collectionId);
            const contract = await loadPublishedContract(transaction, input);
            if (contract === undefined) return outcome("not_found");
            if (contract === null) return outcome("published_required");
            if (contract.revision.workspaceId !== scope.access.workspaceId)
              return outcome("not_found");
            if (
              contract.revision.id !== input.schemaRevisionId ||
              contract.contractHash !== input.contractHash
            )
              return outcome("conflict");
            await lockEntry(transaction, input.entryId);
            const [row] = await transaction
              .select()
              .from(cmsEntry)
              .where(
                and(
                  eq(cmsEntry.id, input.entryId),
                  eq(cmsEntry.workspaceId, scope.access.workspaceId),
                  eq(cmsEntry.projectId, input.projectId),
                  eq(cmsEntry.environmentId, input.environmentId),
                  eq(cmsEntry.collectionId, input.collectionId),
                ),
              )
              .limit(1);
            if (!row) return outcome("entry_not_found");
            const fingerprint = fingerprintJson({
              operation: "save",
              actorId,
              workspaceId: scope.access.workspaceId,
              localeId: scope.access.locale.id,
              ...input,
            });
            const [receipt] = await transaction
              .select()
              .from(cmsEntryDraftCommand)
              .where(
                and(
                  eq(cmsEntryDraftCommand.entryId, row.id),
                  eq(cmsEntryDraftCommand.commandId, input.commandId),
                  eq(cmsEntryDraftCommand.workspaceId, row.workspaceId),
                  eq(cmsEntryDraftCommand.collectionId, row.collectionId),
                ),
              )
              .limit(1);
            if (receipt)
              return receipt.commandFingerprint === fingerprint
                ? outcomeWith("replay", { receipt, row, scope, contract })
                : outcome("command_conflict");
            if (input.sharedMutations.length > 0 && scope.access.localeAccessMode !== "all")
              return outcome("forbidden");
            const authorizationIssues = [
              ...mutationAuthorizationIssues(
                input.sharedMutations,
                contract.fields,
                scope.access.role,
                "shared",
              ),
              ...mutationAuthorizationIssues(
                input.localizedMutations,
                contract.fields,
                scope.access.role,
                "localized",
              ),
            ];
            if (authorizationIssues.length > 0)
              return outcomeWith("validation_failure", { details: authorizationIssues });
            const [sharedHead] = await transaction
              .select()
              .from(cmsEntrySharedDraft)
              .where(
                and(
                  eq(cmsEntrySharedDraft.entryId, row.id),
                  eq(cmsEntrySharedDraft.workspaceId, row.workspaceId),
                  eq(cmsEntrySharedDraft.collectionId, row.collectionId),
                ),
              )
              .for("update")
              .limit(1);
            const [localeHead] = await transaction
              .select()
              .from(cmsEntryLocaleDraft)
              .where(
                and(
                  eq(cmsEntryLocaleDraft.entryId, row.id),
                  eq(cmsEntryLocaleDraft.localeId, scope.access.locale.id),
                  eq(cmsEntryLocaleDraft.workspaceId, row.workspaceId),
                  eq(cmsEntryLocaleDraft.collectionId, row.collectionId),
                ),
              )
              .for("update")
              .limit(1);
            const [sharedCurrent] = sharedHead
              ? await transaction
                  .select()
                  .from(cmsEntrySharedRevision)
                  .where(
                    and(
                      eq(cmsEntrySharedRevision.id, sharedHead.currentRevisionId),
                      eq(cmsEntrySharedRevision.entryId, row.id),
                      eq(cmsEntrySharedRevision.workspaceId, row.workspaceId),
                      eq(cmsEntrySharedRevision.collectionId, row.collectionId),
                    ),
                  )
                  .limit(1)
              : [];
            const [localeCurrent] = localeHead
              ? await transaction
                  .select()
                  .from(cmsEntryLocaleRevision)
                  .where(
                    and(
                      eq(cmsEntryLocaleRevision.id, localeHead.currentRevisionId),
                      eq(cmsEntryLocaleRevision.entryId, row.id),
                      eq(cmsEntryLocaleRevision.localeId, scope.access.locale.id),
                      eq(cmsEntryLocaleRevision.workspaceId, row.workspaceId),
                      eq(cmsEntryLocaleRevision.collectionId, row.collectionId),
                    ),
                  )
                  .limit(1)
              : [];
            const details = conflictDetails({
              expectedShared: input.expectedSharedVersion,
              currentShared: sharedHead?.version ?? 0,
              sharedRevisionId: sharedCurrent?.id ?? null,
              expectedLocalized: input.expectedLocalizedVersion,
              currentLocalized: localeHead?.version ?? 0,
              localizedRevisionId: localeCurrent?.id ?? null,
              sharedTouched: input.sharedMutations.length > 0,
              localizedTouched: input.localizedMutations.length > 0,
            });
            if (details.length > 0) return outcomeWith("draft_conflict", { details });
            const sharedResult = applyEntryMutations(
              entryValues(sharedCurrent?.values ?? {}),
              input.sharedMutations,
            );
            const localizedResult = applyEntryMutations(
              entryValues(localeCurrent?.values ?? {}),
              input.localizedMutations,
            );
            if (!sharedResult.valid)
              return outcomeWith("kernel_failure", { issues: sharedResult.issues });
            if (!localizedResult.valid)
              return outcomeWith("kernel_failure", { issues: localizedResult.issues });
            const references = await validateReferenceAvailability(transaction, {
              workspaceId: row.workspaceId,
              projectId: row.projectId,
              environmentId: row.environmentId,
              locale: scope.access.locale,
              fields: contract.fields,
              sharedValues: sharedResult.values,
              localizedValues: localizedResult.values,
              validation: validateDraftValues({
                fields: contract.fields,
                sharedValues: sharedResult.values,
                localizedValues: localizedResult.values,
                locale: scope.access.locale,
              }),
            });
            if (references.limitExceeded)
              return outcomeWith("validation_failure", { details: [referenceLimitFailure()] });
            const validation = references.validation;
            const storageIssues = hardDraftIssues(validation);
            if (storageIssues.length > 0)
              return outcomeWith("validation_failure", { details: storageIssues });
            let sharedRevisionId = sharedCurrent?.id ?? null;
            let localizedRevisionId = localeCurrent?.id ?? null;
            let sharedVersion = sharedHead?.version ?? 0;
            let localizedVersion = localeHead?.version ?? 0;
            if (sharedResult.changed) {
              sharedVersion += 1;
              const [revision] = await transaction
                .insert(cmsEntrySharedRevision)
                .values({
                  workspaceId: row.workspaceId,
                  projectId: row.projectId,
                  environmentId: row.environmentId,
                  collectionId: row.collectionId,
                  entryId: row.id,
                  sequence: sharedVersion,
                  previousRevisionId: sharedRevisionId,
                  schemaRevisionId: contract.revision.id,
                  contractHash: contract.contractHash,
                  values: sharedResult.values,
                  valuesHash: digest(sharedResult.values),
                  changedFieldIds: mutationRootIds(input.sharedMutations),
                  commandId: input.commandId,
                  commandFingerprint: fingerprint,
                  restoredFromRevisionId: null,
                  authoredByUserId: actorId,
                  authoredAt: now,
                })
                .returning();
              if (!revision) throw new Error("Shared revision insert returned no row.");
              failAfter("revision");
              sharedRevisionId = revision.id;
              if (sharedHead)
                await transaction
                  .update(cmsEntrySharedDraft)
                  .set({
                    version: sharedVersion,
                    currentRevisionId: revision.id,
                    changedByUserId: actorId,
                    updatedAt: now,
                  })
                  .where(
                    and(
                      eq(cmsEntrySharedDraft.entryId, row.id),
                      eq(cmsEntrySharedDraft.workspaceId, row.workspaceId),
                      eq(cmsEntrySharedDraft.collectionId, row.collectionId),
                    ),
                  );
              else
                await transaction.insert(cmsEntrySharedDraft).values({
                  entryId: row.id,
                  workspaceId: row.workspaceId,
                  projectId: row.projectId,
                  environmentId: row.environmentId,
                  collectionId: row.collectionId,
                  version: sharedVersion,
                  currentRevisionId: revision.id,
                  changedByUserId: actorId,
                  updatedAt: now,
                });
              failAfter("head");
              await transaction.insert(auditEvent).values(
                makeAuditValues({
                  workspaceId: row.workspaceId,
                  projectId: row.projectId,
                  environmentId: row.environmentId,
                  actorId,
                  action: "cms.entry.shared_draft.saved",
                  resourceType: "cms_entry_shared_revision",
                  resourceId: revision.id,
                  requestId,
                }),
              );
              failAfter("audit");
            }
            if (localizedResult.changed) {
              localizedVersion += 1;
              const [revision] = await transaction
                .insert(cmsEntryLocaleRevision)
                .values({
                  workspaceId: row.workspaceId,
                  projectId: row.projectId,
                  environmentId: row.environmentId,
                  collectionId: row.collectionId,
                  entryId: row.id,
                  localeId: scope.access.locale.id,
                  sequence: localizedVersion,
                  previousRevisionId: localizedRevisionId,
                  schemaRevisionId: contract.revision.id,
                  contractHash: contract.contractHash,
                  values: localizedResult.values,
                  valuesHash: digest(localizedResult.values),
                  changedFieldIds: mutationRootIds(input.localizedMutations),
                  commandId: input.commandId,
                  commandFingerprint: fingerprint,
                  restoredFromRevisionId: null,
                  authoredByUserId: actorId,
                  authoredAt: now,
                })
                .returning();
              if (!revision) throw new Error("Locale revision insert returned no row.");
              failAfter("revision");
              localizedRevisionId = revision.id;
              if (localeHead)
                await transaction
                  .update(cmsEntryLocaleDraft)
                  .set({
                    version: localizedVersion,
                    currentRevisionId: revision.id,
                    changedByUserId: actorId,
                    updatedAt: now,
                  })
                  .where(
                    and(
                      eq(cmsEntryLocaleDraft.entryId, row.id),
                      eq(cmsEntryLocaleDraft.localeId, scope.access.locale.id),
                      eq(cmsEntryLocaleDraft.workspaceId, row.workspaceId),
                      eq(cmsEntryLocaleDraft.collectionId, row.collectionId),
                    ),
                  );
              else
                await transaction.insert(cmsEntryLocaleDraft).values({
                  entryId: row.id,
                  localeId: scope.access.locale.id,
                  workspaceId: row.workspaceId,
                  projectId: row.projectId,
                  environmentId: row.environmentId,
                  collectionId: row.collectionId,
                  version: localizedVersion,
                  currentRevisionId: revision.id,
                  changedByUserId: actorId,
                  updatedAt: now,
                });
              failAfter("head");
              await transaction.insert(auditEvent).values(
                makeAuditValues({
                  workspaceId: row.workspaceId,
                  projectId: row.projectId,
                  environmentId: row.environmentId,
                  actorId,
                  action: "cms.entry.locale_draft.saved",
                  resourceType: "cms_entry_locale_revision",
                  resourceId: revision.id,
                  requestId,
                }),
              );
              failAfter("audit");
            }
            const changed = sharedResult.changed || localizedResult.changed;
            if (changed)
              await transaction
                .update(cmsEntry)
                .set({ changedByUserId: actorId, updatedAt: now })
                .where(
                  and(
                    eq(cmsEntry.id, row.id),
                    eq(cmsEntry.workspaceId, row.workspaceId),
                    eq(cmsEntry.collectionId, row.collectionId),
                  ),
                );
            await transaction.insert(cmsEntryDraftCommand).values({
              entryId: row.id,
              commandId: input.commandId,
              workspaceId: row.workspaceId,
              projectId: row.projectId,
              environmentId: row.environmentId,
              collectionId: row.collectionId,
              localeId: scope.access.locale.id,
              operation: "save",
              commandFingerprint: fingerprint,
              resultKind: changed ? "changed" : "no_op",
              resultSharedVersion: sharedVersion,
              resultSharedRevisionId: sharedRevisionId,
              resultLocaleVersion: localizedVersion,
              resultLocaleRevisionId: localizedRevisionId,
              completedByUserId: actorId,
              completedAt: now,
            });
            failAfter("receipt");
            return outcomeWith("success", {
              row,
              scope,
              contract,
              sharedResult,
              localizedResult,
              sharedVersion,
              localizedVersion,
              sharedRevisionId,
              localizedRevisionId,
              validation,
            });
          }),
        catch: (cause) => databaseFailure("entry.save", cause),
      });
      if (result.kind === "not_found")
        return yield* NotFoundFailure.make({ resource: "collection" });
      if (result.kind === "entry_not_found")
        return yield* NotFoundFailure.make({ resource: "entry" });
      if (result.kind === "forbidden") return yield* ForbiddenFailure.make();
      if (result.kind === "locale_unavailable") return yield* LocaleUnavailableFailure.make();
      if (result.kind === "cms_required") return yield* CmsCapabilityRequiredFailure.make();
      if (result.kind === "invalid_state") return yield* InvalidStateTransitionFailure.make();
      if (result.kind === "published_required") return yield* PublishedSchemaRequiredFailure.make();
      if (result.kind === "conflict") return yield* ConflictFailure.make();
      if (result.kind === "command_conflict") return yield* EntryCommandConflictFailure.make();
      if (result.kind === "draft_conflict")
        return yield* EntryDraftConflictFailure.make({ details: result.details });
      if (result.kind === "validation_failure")
        return yield* ValidationFailure.make({ details: result.details });
      if (result.kind === "kernel_failure")
        return yield* validationFailureFromKernel(result.issues);
      if (result.kind === "replay") {
        const sharedRevisionId = result.receipt.resultSharedRevisionId;
        const sharedRows =
          sharedRevisionId === null
            ? []
            : yield* Effect.tryPromise({
                try: () =>
                  database
                    .select({
                      values: cmsEntrySharedRevision.values,
                      commandId: cmsEntrySharedRevision.commandId,
                    })
                    .from(cmsEntrySharedRevision)
                    .where(
                      and(
                        eq(cmsEntrySharedRevision.id, sharedRevisionId),
                        eq(cmsEntrySharedRevision.entryId, result.row.id),
                        eq(cmsEntrySharedRevision.workspaceId, result.row.workspaceId),
                        eq(cmsEntrySharedRevision.collectionId, result.row.collectionId),
                      ),
                    )
                    .limit(1),
                catch: (cause) => databaseFailure("entry.save.replay.shared", cause),
              });
        const localeRevisionId = result.receipt.resultLocaleRevisionId;
        const localeRows =
          localeRevisionId === null
            ? []
            : yield* Effect.tryPromise({
                try: () =>
                  database
                    .select({
                      values: cmsEntryLocaleRevision.values,
                      commandId: cmsEntryLocaleRevision.commandId,
                    })
                    .from(cmsEntryLocaleRevision)
                    .where(
                      and(
                        eq(cmsEntryLocaleRevision.id, localeRevisionId),
                        eq(cmsEntryLocaleRevision.entryId, result.row.id),
                        eq(cmsEntryLocaleRevision.localeId, result.scope.access.locale.id),
                        eq(cmsEntryLocaleRevision.workspaceId, result.row.workspaceId),
                        eq(cmsEntryLocaleRevision.collectionId, result.row.collectionId),
                      ),
                    )
                    .limit(1),
                catch: (cause) => databaseFailure("entry.save.replay.locale", cause),
              });
        const sharedValues = entryValues(sharedRows[0]?.values ?? {});
        const localizedValues = entryValues(localeRows[0]?.values ?? {});
        return Schema.decodeUnknownSync(SaveEntryDraftResult)({
          entryId: result.row.id,
          commandId: input.commandId,
          sharedChanged: sharedRows[0]?.commandId === input.commandId,
          sharedVersion: result.receipt.resultSharedVersion,
          sharedRevisionId,
          localizedChanged: localeRows[0]?.commandId === input.commandId,
          localizedVersion: result.receipt.resultLocaleVersion,
          localizedRevisionId: localeRevisionId,
          validation: validateDraftValues({
            fields: result.contract.fields,
            sharedValues,
            localizedValues,
            locale: result.scope.access.locale,
          }),
        });
      }
      return Schema.decodeUnknownSync(SaveEntryDraftResult)({
        entryId: result.row.id,
        commandId: input.commandId,
        sharedChanged: result.sharedResult.changed,
        sharedVersion: result.sharedVersion,
        sharedRevisionId: result.sharedRevisionId,
        localizedChanged: result.localizedResult.changed,
        localizedVersion: result.localizedVersion,
        localizedRevisionId: result.localizedRevisionId,
        validation: result.validation,
      });
    }),

    listRevisions: Effect.fn("EntryRepository.listRevisions")(function* (
      actorId: AuthUserId,
      input: ListEntryRevisionsInput,
    ) {
      const cursor =
        input.cursor === null ? null : yield* decodeEntryRevisionCursor(input.cursor, input);
      const result = yield* Effect.tryPromise({
        try: async () => {
          const scope = await authorizeScope(database, actorId, input, "content.read");
          if (scope.kind !== "success") return scope;
          const contract = await loadPublishedContract(database, input);
          if (contract === undefined) return outcome("not_found");
          if (contract === null) return outcome("published_required");
          if (contract.revision.workspaceId !== scope.access.workspaceId)
            return outcome("not_found");
          const [entry] = await database
            .select({ id: cmsEntry.id })
            .from(cmsEntry)
            .where(
              and(
                eq(cmsEntry.id, input.entryId),
                eq(cmsEntry.workspaceId, scope.access.workspaceId),
                eq(cmsEntry.projectId, input.projectId),
                eq(cmsEntry.environmentId, input.environmentId),
                eq(cmsEntry.collectionId, input.collectionId),
              ),
            )
            .limit(1);
          if (!entry) return outcome("entry_not_found");
          const visibleIds = new Set<string>(
            flattenFieldTree(contract.fields)
              .filter((field) => visible(field, scope.access.role))
              .map((field) => field.id),
          );
          if (input.scope === "shared") {
            const rows = await database
              .select()
              .from(cmsEntrySharedRevision)
              .where(
                and(
                  eq(cmsEntrySharedRevision.entryId, input.entryId),
                  eq(cmsEntrySharedRevision.workspaceId, scope.access.workspaceId),
                  eq(cmsEntrySharedRevision.projectId, input.projectId),
                  eq(cmsEntrySharedRevision.environmentId, input.environmentId),
                  eq(cmsEntrySharedRevision.collectionId, input.collectionId),
                  cursor === null
                    ? undefined
                    : or(
                        lt(cmsEntrySharedRevision.sequence, cursor.sequence),
                        and(
                          eq(cmsEntrySharedRevision.sequence, cursor.sequence),
                          lt(cmsEntrySharedRevision.id, cursor.revisionId),
                        ),
                      ),
                ),
              )
              .orderBy(desc(cmsEntrySharedRevision.sequence), desc(cmsEntrySharedRevision.id))
              .limit(input.limit + 1);
            return outcomeWith("success", { rows, visibleIds });
          }
          const rows = await database
            .select()
            .from(cmsEntryLocaleRevision)
            .where(
              and(
                eq(cmsEntryLocaleRevision.entryId, input.entryId),
                eq(cmsEntryLocaleRevision.localeId, scope.access.locale.id),
                eq(cmsEntryLocaleRevision.workspaceId, scope.access.workspaceId),
                eq(cmsEntryLocaleRevision.projectId, input.projectId),
                eq(cmsEntryLocaleRevision.environmentId, input.environmentId),
                eq(cmsEntryLocaleRevision.collectionId, input.collectionId),
                cursor === null
                  ? undefined
                  : or(
                      lt(cmsEntryLocaleRevision.sequence, cursor.sequence),
                      and(
                        eq(cmsEntryLocaleRevision.sequence, cursor.sequence),
                        lt(cmsEntryLocaleRevision.id, cursor.revisionId),
                      ),
                    ),
              ),
            )
            .orderBy(desc(cmsEntryLocaleRevision.sequence), desc(cmsEntryLocaleRevision.id))
            .limit(input.limit + 1);
          return outcomeWith("success", { rows, visibleIds });
        },
        catch: (cause) => databaseFailure("entry.revisions.list", cause),
      });
      if (result.kind === "not_found")
        return yield* NotFoundFailure.make({ resource: "collection" });
      if (result.kind === "entry_not_found")
        return yield* NotFoundFailure.make({ resource: "entry" });
      if (result.kind === "forbidden") return yield* ForbiddenFailure.make();
      if (result.kind === "locale_unavailable") return yield* LocaleUnavailableFailure.make();
      if (result.kind === "cms_required") return yield* CmsCapabilityRequiredFailure.make();
      if (result.kind === "invalid_state") return yield* InvalidStateTransitionFailure.make();
      if (result.kind === "published_required") return yield* PublishedSchemaRequiredFailure.make();
      const rows = result.rows.slice(0, input.limit);
      const items = rows.map((row) =>
        Schema.decodeUnknownSync(EntryRevisionSummary)({
          id: row.id,
          entryId: row.entryId,
          localeId: input.scope === "shared" ? null : "localeId" in row ? row.localeId : null,
          scope: input.scope,
          sequence: row.sequence,
          previousRevisionId: row.previousRevisionId,
          schemaRevisionId: row.schemaRevisionId,
          contractHash: row.contractHash,
          changedFieldIds: row.changedFieldIds.filter((id) => result.visibleIds.has(id)),
          restoredFromRevisionId: row.restoredFromRevisionId,
          authoredByUserId: row.authoredByUserId,
          authoredAt: toIso(row.authoredAt),
        }),
      );
      const last = rows.at(-1);
      const nextCursor =
        result.rows.length > input.limit && last
          ? yield* encodeEntryRevisionCursor({
              projectId: input.projectId,
              environmentId: input.environmentId,
              collectionId: input.collectionId,
              entryId: input.entryId,
              locale: input.locale,
              scope: input.scope,
              sequence: last.sequence,
              revisionId: Schema.decodeUnknownSync(EntryRevisionSummary)({ ...items.at(-1) }).id,
            })
          : null;
      return EntryRevisionPage.make({ items, nextCursor });
    }),

    restoreRevision: Effect.fn("EntryRepository.restoreRevision")(function* (
      actorId: AuthUserId,
      input: RestoreEntryRevisionInput,
      now: Date,
      requestId: string,
    ) {
      const result = yield* Effect.tryPromise({
        try: () =>
          database.transaction(async (transaction) => {
            await lockProjectShared(transaction, input.projectId);
            const scope = await authorizeScope(transaction, actorId, input, "content.write");
            if (scope.kind !== "success") return scope;
            if (input.scope === "shared" && scope.access.localeAccessMode !== "all")
              return outcome("forbidden");
            await lockCollectionShared(transaction, input.collectionId);
            const contract = await loadPublishedContract(transaction, input);
            if (contract === undefined) return outcome("not_found");
            if (contract === null) return outcome("published_required");
            if (contract.revision.workspaceId !== scope.access.workspaceId)
              return outcome("not_found");
            if (
              contract.revision.id !== input.schemaRevisionId ||
              contract.contractHash !== input.contractHash
            )
              return outcome("conflict");
            await lockEntry(transaction, input.entryId);
            const [row] = await transaction
              .select()
              .from(cmsEntry)
              .where(
                and(
                  eq(cmsEntry.id, input.entryId),
                  eq(cmsEntry.workspaceId, scope.access.workspaceId),
                  eq(cmsEntry.projectId, input.projectId),
                  eq(cmsEntry.environmentId, input.environmentId),
                  eq(cmsEntry.collectionId, input.collectionId),
                ),
              )
              .limit(1);
            if (!row) return outcome("entry_not_found");
            const fingerprint = fingerprintJson({
              operation: "restore",
              actorId,
              workspaceId: scope.access.workspaceId,
              localeId: scope.access.locale.id,
              ...input,
            });
            const [receipt] = await transaction
              .select()
              .from(cmsEntryDraftCommand)
              .where(
                and(
                  eq(cmsEntryDraftCommand.entryId, row.id),
                  eq(cmsEntryDraftCommand.commandId, input.commandId),
                  eq(cmsEntryDraftCommand.workspaceId, row.workspaceId),
                  eq(cmsEntryDraftCommand.collectionId, row.collectionId),
                ),
              )
              .limit(1);
            if (receipt)
              return receipt.commandFingerprint === fingerprint
                ? outcomeWith("replay", { receipt, row, scope, contract })
                : outcome("command_conflict");
            const isShared = input.scope === "shared";
            const [target] = isShared
              ? await transaction
                  .select()
                  .from(cmsEntrySharedRevision)
                  .where(
                    and(
                      eq(cmsEntrySharedRevision.id, input.revisionId),
                      eq(cmsEntrySharedRevision.entryId, row.id),
                      eq(cmsEntrySharedRevision.workspaceId, row.workspaceId),
                      eq(cmsEntrySharedRevision.projectId, row.projectId),
                      eq(cmsEntrySharedRevision.environmentId, row.environmentId),
                      eq(cmsEntrySharedRevision.collectionId, row.collectionId),
                    ),
                  )
                  .limit(1)
              : await transaction
                  .select()
                  .from(cmsEntryLocaleRevision)
                  .where(
                    and(
                      eq(cmsEntryLocaleRevision.id, input.revisionId),
                      eq(cmsEntryLocaleRevision.entryId, row.id),
                      eq(cmsEntryLocaleRevision.localeId, scope.access.locale.id),
                      eq(cmsEntryLocaleRevision.workspaceId, row.workspaceId),
                      eq(cmsEntryLocaleRevision.projectId, row.projectId),
                      eq(cmsEntryLocaleRevision.environmentId, row.environmentId),
                      eq(cmsEntryLocaleRevision.collectionId, row.collectionId),
                    ),
                  )
                  .limit(1);
            if (!target) return outcome("revision_not_found");
            if (target.contractHash !== contract.contractHash) return outcome("incompatible");
            const rootIds = Object.keys(target.values);
            if (!snapshotEditable(target.values, contract.fields, scope.access.role, input.scope))
              return outcome("forbidden");
            const [sharedHead] = await transaction
              .select()
              .from(cmsEntrySharedDraft)
              .where(
                and(
                  eq(cmsEntrySharedDraft.entryId, row.id),
                  eq(cmsEntrySharedDraft.workspaceId, row.workspaceId),
                  eq(cmsEntrySharedDraft.collectionId, row.collectionId),
                ),
              )
              .for("update")
              .limit(1);
            const [localeHead] = await transaction
              .select()
              .from(cmsEntryLocaleDraft)
              .where(
                and(
                  eq(cmsEntryLocaleDraft.entryId, row.id),
                  eq(cmsEntryLocaleDraft.localeId, scope.access.locale.id),
                  eq(cmsEntryLocaleDraft.workspaceId, row.workspaceId),
                  eq(cmsEntryLocaleDraft.collectionId, row.collectionId),
                ),
              )
              .for("update")
              .limit(1);
            const head = isShared ? sharedHead : localeHead;
            if ((head?.version ?? 0) !== input.expectedVersion)
              return outcomeWith("draft_conflict", {
                details: [
                  ApiErrorDetail.make({
                    path: "expectedVersion",
                    code: "entry_draft_stale",
                    message: "The draft changed.",
                    scope: input.scope,
                    expectedVersion: input.expectedVersion,
                    currentVersion: head?.version ?? 0,
                    currentRevisionId: head?.currentRevisionId ?? null,
                  }),
                ],
              });
            const [sharedCurrent] = sharedHead
              ? await transaction
                  .select()
                  .from(cmsEntrySharedRevision)
                  .where(
                    and(
                      eq(cmsEntrySharedRevision.id, sharedHead.currentRevisionId),
                      eq(cmsEntrySharedRevision.entryId, row.id),
                      eq(cmsEntrySharedRevision.workspaceId, row.workspaceId),
                      eq(cmsEntrySharedRevision.collectionId, row.collectionId),
                    ),
                  )
                  .limit(1)
              : [];
            const [localeCurrent] = localeHead
              ? await transaction
                  .select()
                  .from(cmsEntryLocaleRevision)
                  .where(
                    and(
                      eq(cmsEntryLocaleRevision.id, localeHead.currentRevisionId),
                      eq(cmsEntryLocaleRevision.entryId, row.id),
                      eq(cmsEntryLocaleRevision.localeId, scope.access.locale.id),
                      eq(cmsEntryLocaleRevision.workspaceId, row.workspaceId),
                      eq(cmsEntryLocaleRevision.collectionId, row.collectionId),
                    ),
                  )
                  .limit(1)
              : [];
            const current = isShared ? sharedCurrent : localeCurrent;
            const sharedValues = entryValues(
              isShared ? target.values : (sharedCurrent?.values ?? {}),
            );
            const localizedValues = entryValues(
              isShared ? (localeCurrent?.values ?? {}) : target.values,
            );
            const references = await validateReferenceAvailability(transaction, {
              workspaceId: row.workspaceId,
              projectId: row.projectId,
              environmentId: row.environmentId,
              locale: scope.access.locale,
              fields: contract.fields,
              sharedValues,
              localizedValues,
              validation: validateDraftValues({
                fields: contract.fields,
                sharedValues,
                localizedValues,
                locale: scope.access.locale,
              }),
            });
            if (references.limitExceeded)
              return outcomeWith("validation_failure", { details: [referenceLimitFailure()] });
            const changed = !current || current.valuesHash !== target.valuesHash;
            let sharedVersion = sharedHead?.version ?? 0;
            let localizedVersion = localeHead?.version ?? 0;
            let sharedRevisionId = sharedHead?.currentRevisionId ?? null;
            let localizedRevisionId = localeHead?.currentRevisionId ?? null;
            if (changed && isShared) {
              sharedVersion += 1;
              const [revision] = await transaction
                .insert(cmsEntrySharedRevision)
                .values({
                  workspaceId: row.workspaceId,
                  projectId: row.projectId,
                  environmentId: row.environmentId,
                  collectionId: row.collectionId,
                  entryId: row.id,
                  sequence: sharedVersion,
                  previousRevisionId: sharedRevisionId,
                  schemaRevisionId: contract.revision.id,
                  contractHash: contract.contractHash,
                  values: target.values,
                  valuesHash: target.valuesHash,
                  changedFieldIds: rootIds.sort(),
                  commandId: input.commandId,
                  commandFingerprint: fingerprint,
                  restoredFromRevisionId: target.id,
                  authoredByUserId: actorId,
                  authoredAt: now,
                })
                .returning();
              if (!revision) throw new Error("Shared restore revision insert returned no row.");
              failAfter("revision");
              sharedRevisionId = revision.id;
              if (sharedHead)
                await transaction
                  .update(cmsEntrySharedDraft)
                  .set({
                    version: sharedVersion,
                    currentRevisionId: revision.id,
                    changedByUserId: actorId,
                    updatedAt: now,
                  })
                  .where(
                    and(
                      eq(cmsEntrySharedDraft.entryId, row.id),
                      eq(cmsEntrySharedDraft.workspaceId, row.workspaceId),
                      eq(cmsEntrySharedDraft.collectionId, row.collectionId),
                    ),
                  );
              else
                await transaction.insert(cmsEntrySharedDraft).values({
                  entryId: row.id,
                  workspaceId: row.workspaceId,
                  projectId: row.projectId,
                  environmentId: row.environmentId,
                  collectionId: row.collectionId,
                  version: sharedVersion,
                  currentRevisionId: revision.id,
                  changedByUserId: actorId,
                  updatedAt: now,
                });
              failAfter("head");
              await transaction.insert(auditEvent).values(
                makeAuditValues({
                  workspaceId: row.workspaceId,
                  projectId: row.projectId,
                  environmentId: row.environmentId,
                  actorId,
                  action: "cms.entry.shared_draft.restored",
                  resourceType: "cms_entry_shared_revision",
                  resourceId: revision.id,
                  requestId,
                }),
              );
              failAfter("audit");
            }
            if (changed && !isShared) {
              localizedVersion += 1;
              const [revision] = await transaction
                .insert(cmsEntryLocaleRevision)
                .values({
                  workspaceId: row.workspaceId,
                  projectId: row.projectId,
                  environmentId: row.environmentId,
                  collectionId: row.collectionId,
                  entryId: row.id,
                  localeId: scope.access.locale.id,
                  sequence: localizedVersion,
                  previousRevisionId: localizedRevisionId,
                  schemaRevisionId: contract.revision.id,
                  contractHash: contract.contractHash,
                  values: target.values,
                  valuesHash: target.valuesHash,
                  changedFieldIds: rootIds.sort(),
                  commandId: input.commandId,
                  commandFingerprint: fingerprint,
                  restoredFromRevisionId: target.id,
                  authoredByUserId: actorId,
                  authoredAt: now,
                })
                .returning();
              if (!revision) throw new Error("Locale restore revision insert returned no row.");
              failAfter("revision");
              localizedRevisionId = revision.id;
              if (localeHead)
                await transaction
                  .update(cmsEntryLocaleDraft)
                  .set({
                    version: localizedVersion,
                    currentRevisionId: revision.id,
                    changedByUserId: actorId,
                    updatedAt: now,
                  })
                  .where(
                    and(
                      eq(cmsEntryLocaleDraft.entryId, row.id),
                      eq(cmsEntryLocaleDraft.localeId, scope.access.locale.id),
                      eq(cmsEntryLocaleDraft.workspaceId, row.workspaceId),
                      eq(cmsEntryLocaleDraft.collectionId, row.collectionId),
                    ),
                  );
              else
                await transaction.insert(cmsEntryLocaleDraft).values({
                  entryId: row.id,
                  localeId: scope.access.locale.id,
                  workspaceId: row.workspaceId,
                  projectId: row.projectId,
                  environmentId: row.environmentId,
                  collectionId: row.collectionId,
                  version: localizedVersion,
                  currentRevisionId: revision.id,
                  changedByUserId: actorId,
                  updatedAt: now,
                });
              failAfter("head");
              await transaction.insert(auditEvent).values(
                makeAuditValues({
                  workspaceId: row.workspaceId,
                  projectId: row.projectId,
                  environmentId: row.environmentId,
                  actorId,
                  action: "cms.entry.locale_draft.restored",
                  resourceType: "cms_entry_locale_revision",
                  resourceId: revision.id,
                  requestId,
                }),
              );
              failAfter("audit");
            }
            if (changed)
              await transaction
                .update(cmsEntry)
                .set({ changedByUserId: actorId, updatedAt: now })
                .where(
                  and(
                    eq(cmsEntry.id, row.id),
                    eq(cmsEntry.workspaceId, row.workspaceId),
                    eq(cmsEntry.collectionId, row.collectionId),
                  ),
                );
            await transaction.insert(cmsEntryDraftCommand).values({
              entryId: row.id,
              commandId: input.commandId,
              workspaceId: row.workspaceId,
              projectId: row.projectId,
              environmentId: row.environmentId,
              collectionId: row.collectionId,
              localeId: scope.access.locale.id,
              operation: "restore",
              commandFingerprint: fingerprint,
              resultKind: changed ? "changed" : "no_op",
              resultSharedVersion: sharedVersion,
              resultSharedRevisionId: sharedRevisionId,
              resultLocaleVersion: localizedVersion,
              resultLocaleRevisionId: localizedRevisionId,
              completedByUserId: actorId,
              completedAt: now,
            });
            failAfter("receipt");
            return outcomeWith("success", {
              row,
              scope,
              contract,
              changed,
              sharedVersion,
              sharedRevisionId,
              localizedVersion,
              localizedRevisionId,
              validation: references.validation,
            });
          }),
        catch: (cause) => databaseFailure("entry.restore", cause),
      });
      if (result.kind === "not_found")
        return yield* NotFoundFailure.make({ resource: "collection" });
      if (result.kind === "entry_not_found")
        return yield* NotFoundFailure.make({ resource: "entry" });
      if (result.kind === "revision_not_found")
        return yield* NotFoundFailure.make({ resource: "entry_revision" });
      if (result.kind === "forbidden") return yield* ForbiddenFailure.make();
      if (result.kind === "locale_unavailable") return yield* LocaleUnavailableFailure.make();
      if (result.kind === "cms_required") return yield* CmsCapabilityRequiredFailure.make();
      if (result.kind === "invalid_state") return yield* InvalidStateTransitionFailure.make();
      if (result.kind === "published_required") return yield* PublishedSchemaRequiredFailure.make();
      if (result.kind === "conflict") return yield* ConflictFailure.make();
      if (result.kind === "command_conflict") return yield* EntryCommandConflictFailure.make();
      if (result.kind === "incompatible") return yield* EntryRevisionIncompatibleFailure.make();
      if (result.kind === "draft_conflict")
        return yield* EntryDraftConflictFailure.make({ details: result.details });
      if (result.kind === "validation_failure")
        return yield* ValidationFailure.make({ details: result.details });
      if (result.kind === "replay")
        return Schema.decodeUnknownSync(SaveEntryDraftResult)({
          entryId: result.row.id,
          commandId: input.commandId,
          sharedChanged: input.scope === "shared" && result.receipt.resultKind === "changed",
          sharedVersion: result.receipt.resultSharedVersion,
          sharedRevisionId: result.receipt.resultSharedRevisionId,
          localizedChanged: input.scope === "localized" && result.receipt.resultKind === "changed",
          localizedVersion: result.receipt.resultLocaleVersion,
          localizedRevisionId: result.receipt.resultLocaleRevisionId,
          validation: EntryValidation.make({ valid: true, issues: [], capped: false }),
        });
      return Schema.decodeUnknownSync(SaveEntryDraftResult)({
        entryId: result.row.id,
        commandId: input.commandId,
        sharedChanged: input.scope === "shared" && result.changed,
        sharedVersion: result.sharedVersion,
        sharedRevisionId: result.sharedRevisionId,
        localizedChanged: input.scope === "localized" && result.changed,
        localizedVersion: result.localizedVersion,
        localizedRevisionId: result.localizedRevisionId,
        validation: result.validation,
      });
    }),
  };
}

export class EntryRepository extends Context.Tag("EntryRepository")<
  EntryRepository,
  ReturnType<typeof makeEntryRepository>
>() {}

export const EntryRepositoryLive = Layer.succeed(EntryRepository, makeEntryRepository());
