import { randomUUID } from "node:crypto";

import { db } from "@framerfordevs/db";
import { and, desc, eq, inArray, isNull, lt, or, sql } from "@framerfordevs/db/query";
import {
  cmsCollection,
  cmsCollectionDeliveryConfig,
  cmsCollectionDeliveryField,
  cmsCollectionField,
  cmsCollectionSchemaHead,
  cmsSchemaRevision,
  cmsSchemaRevisionField,
  outboxEvent,
} from "@framerfordevs/db/schema/cms";
import { environment, projectCapability, auditEvent } from "@framerfordevs/db/schema/platform";
import { cmsInvalidationRouteMapping } from "@framerfordevs/db/schema/webhooks";
import { Context, Effect, Layer, Schema } from "effect";

import { ProjectRole, type ProjectPermissionAction } from "../contracts/access";
import {
  CmsCapabilityRequiredFailure,
  CollectionKeyConflictFailure,
  ConflictFailure,
  DatabaseFailure,
  ForbiddenFailure,
  InvalidStateTransitionFailure,
  NotFoundFailure,
  SchemaChangeAcknowledgementRequiredFailure,
  SchemaInvalidFailure,
  VersionConflictFailure,
} from "../contracts/errors";
import { decodeCollectionCursor, encodeCollectionCursor } from "../contracts/schema-cursor";
import {
  CmsCollection,
  CmsCollectionPage,
  CollectionDraftSchema,
  CollectionFieldDefinition,
  type CollectionFieldAuthoringNode,
  type CollectionFieldMutation,
  CollectionSchemaValidation,
  ContractHash,
  currentCurrencyRegistryProfile,
  defaultFieldEditorMetadata,
  GeneratedFormDefinition,
  PublishedSchemaRevision,
  SchemaHash,
  SchemaValidationIssue,
  type CreateCollectionFieldInput,
  type CreateCollectionInput,
  type GetCollectionDraftInput,
  type GetCollectionInput,
  type GetLatestPublishedSchemaInput,
  type GetPublishedSchemaRevisionInput,
  type ListCollectionsInput,
  type PublishCollectionSchemaInput,
  type RemoveCollectionFieldInput,
  type ReplaceCollectionDraftFieldsInput,
  type ReorderCollectionFieldsInput,
  type UpdateCollectionFieldInput,
  type UpdateCollectionInput,
  type UpdateEditorLayoutInput,
  type GetDraftGeneratedFormInput,
  type GetPublishedGeneratedFormInput,
  type ValidateCollectionSchemaInput,
} from "../contracts/schemas";
import { EditorLayout } from "../contracts/field-system";
import type { AuthUserId } from "../contracts/platform";
import {
  classifyCollectionSchemaChanges,
  fingerprintSchemaPublication,
  hashCollectionContract,
  hashCollectionDraft,
  hashSchemaContract,
  requiredAcknowledgementChanges,
  validateCollectionDraft,
  type SchemaDraftState,
} from "./schema-engine";
import { reconstructFieldTree, flattenFieldTree } from "../lib/field-tree";
import { fieldSystemLimits, fieldSystemValidationProfile } from "../lib/field-system-profile";
import { iso4217MinorUnits } from "../registry/iso-4217.generated";
import { matchInvalidationMappings } from "../lib/invalidation-mappings";
import { canonicalizeEntryValue } from "../lib/entry-values";
import { isRoleAllowed } from "./policy";
import {
  type ApplicationDb,
  type ApplicationExecutor,
  authorizeUserProject,
} from "./project-access";

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

function hasConstraint(cause: unknown, constraint: string, depth = 0): boolean {
  if (depth > 3 || typeof cause !== "object" || cause === null) return false;
  if (
    "code" in cause &&
    cause.code === "23505" &&
    "constraint" in cause &&
    cause.constraint === constraint
  ) {
    return true;
  }
  return "cause" in cause && hasConstraint(cause.cause, constraint, depth + 1);
}

function decodeDatabaseValue<A, I>(
  operation: string,
  schema: Schema.Schema<A, I, never>,
  value: unknown,
) {
  return Schema.decodeUnknown(schema)(value).pipe(
    Effect.mapError((cause) => databaseFailure(`${operation}.decode`, cause)),
  );
}

function toIso(value: Date): string {
  return value.toISOString();
}

interface CollectionRow {
  readonly id: string;
  readonly workspaceId: string;
  readonly projectId: string;
  readonly environmentId: string;
  readonly apiKey: string;
  readonly displayName: string;
  readonly description: string | null;
  readonly version: number;
  readonly draftVersion: number;
  readonly draftBaseRevisionId: string | null;
  readonly currentPublishedRevisionId: string | null;
  readonly currentPublishedSequence: number;
  readonly validationProfile: string;
  readonly currencyRegistryProfile: string | null;
  readonly editorLayout: Readonly<Record<string, unknown>> | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

function collectionValue(row: CollectionRow) {
  return {
    ...row,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

const collectionProjection = {
  id: cmsCollection.id,
  workspaceId: cmsCollection.workspaceId,
  projectId: cmsCollection.projectId,
  environmentId: cmsCollection.environmentId,
  apiKey: cmsCollection.apiKey,
  displayName: cmsCollection.displayName,
  description: cmsCollection.description,
  version: cmsCollection.version,
  draftVersion: cmsCollectionSchemaHead.draftVersion,
  draftBaseRevisionId: cmsCollectionSchemaHead.draftBaseRevisionId,
  currentPublishedRevisionId: cmsCollectionSchemaHead.currentPublishedRevisionId,
  currentPublishedSequence: cmsCollectionSchemaHead.currentPublishedSequence,
  validationProfile: cmsCollectionSchemaHead.validationProfile,
  currencyRegistryProfile: cmsCollectionSchemaHead.currencyRegistryProfile,
  editorLayout: cmsCollectionSchemaHead.editorLayout,
  createdAt: cmsCollection.createdAt,
  updatedAt: cmsCollection.updatedAt,
};

function makeAuditValues(options: {
  readonly workspaceId: string;
  readonly projectId: string;
  readonly environmentId: string;
  readonly actorId: AuthUserId;
  readonly action: string;
  readonly resourceId: string;
  readonly resourceType?: string;
  readonly requestId: string;
}) {
  return {
    workspaceId: options.workspaceId,
    projectId: options.projectId,
    environmentId: options.environmentId,
    actorType: "user",
    actorId: options.actorId,
    action: options.action,
    resourceType: options.resourceType ?? "cms_collection",
    resourceId: options.resourceId,
    requestId: options.requestId,
  };
}

async function lockProjectShared(executor: ApplicationExecutor, projectId: string) {
  await executor.execute(sql`select id from project where id = ${projectId} for share`);
}

async function authorizeEnvironment(
  executor: ApplicationExecutor,
  actorId: AuthUserId,
  projectId: string,
  environmentId: string,
  action: ProjectPermissionAction,
) {
  const authorization = await authorizeUserProject(executor, actorId, projectId, action);
  if (authorization.kind !== "allowed") return authorization;

  const [environmentRow] = await executor
    .select({ id: environment.id })
    .from(environment)
    .where(
      and(
        eq(environment.id, environmentId),
        eq(environment.projectId, projectId),
        eq(environment.workspaceId, authorization.access.project.workspaceId),
      ),
    )
    .limit(1);
  if (!environmentRow) return outcome("not_found");

  const [capability] = await executor
    .select({ id: projectCapability.id })
    .from(projectCapability)
    .where(
      and(
        eq(projectCapability.workspaceId, authorization.access.project.workspaceId),
        eq(projectCapability.projectId, projectId),
        eq(projectCapability.key, "cms"),
        eq(projectCapability.status, "enabled"),
      ),
    )
    .limit(1);
  if (!capability) return outcome("cms_required");
  return authorization;
}

async function selectCollection(
  executor: ApplicationExecutor,
  input: {
    readonly collectionId: string;
    readonly projectId: string;
    readonly environmentId: string;
  },
) {
  const [row] = await executor
    .select(collectionProjection)
    .from(cmsCollection)
    .innerJoin(
      cmsCollectionSchemaHead,
      and(
        eq(cmsCollectionSchemaHead.collectionId, cmsCollection.id),
        eq(cmsCollectionSchemaHead.environmentId, cmsCollection.environmentId),
        eq(cmsCollectionSchemaHead.projectId, cmsCollection.projectId),
        eq(cmsCollectionSchemaHead.workspaceId, cmsCollection.workspaceId),
      ),
    )
    .where(
      and(
        eq(cmsCollection.id, input.collectionId),
        eq(cmsCollection.projectId, input.projectId),
        eq(cmsCollection.environmentId, input.environmentId),
      ),
    )
    .limit(1);
  return row;
}

function fieldValue(
  row: typeof cmsCollectionField.$inferSelect | typeof cmsSchemaRevisionField.$inferSelect,
) {
  const id = "fieldId" in row ? row.fieldId : row.id;
  const editor =
    Object.keys(row.editorMetadata).length === 0 ? defaultFieldEditorMetadata : row.editorMetadata;
  return Schema.decodeUnknownSync(CollectionFieldDefinition)({
    id,
    parentFieldId: row.parentFieldId,
    nodeRole: row.nodeRole,
    apiKey: row.apiKey,
    displayLabel: row.displayLabel,
    kind: row.kind,
    required: row.required,
    localization: row.localization,
    deprecated: row.deprecated,
    position: row.position,
    editor,
    configuration: row.configuration,
    children: [],
  });
}

async function loadActiveFieldRows(executor: ApplicationExecutor, collectionId: string) {
  return executor
    .select()
    .from(cmsCollectionField)
    .where(
      and(eq(cmsCollectionField.collectionId, collectionId), isNull(cmsCollectionField.removedAt)),
    )
    .orderBy(cmsCollectionField.parentFieldId, cmsCollectionField.position, cmsCollectionField.id);
}

function decodeFieldTreeSync(
  rows: ReadonlyArray<
    typeof cmsCollectionField.$inferSelect | typeof cmsSchemaRevisionField.$inferSelect
  >,
) {
  const tree = reconstructFieldTree(rows.map(fieldValue));
  if (!tree.valid) throw new Error("Persisted field tree is invalid.");
  return tree.roots;
}

function syntheticEditorLayout(fields: ReadonlyArray<CollectionFieldDefinition>) {
  return Schema.decodeUnknownSync(EditorLayout)({
    version: 1,
    tabs: [
      {
        id: "00000000-0000-4000-8000-000000000001",
        title: "Content",
        description: null,
        position: 0,
        visibleToRoles: [
          "owner",
          "developer",
          "content_admin",
          "editor",
          "reviewer",
          "client_editor",
          "read_only",
        ],
        groups: [
          {
            id: "00000000-0000-4000-8000-000000000002",
            title: "Main",
            description: null,
            position: 0,
            columns: 1,
            visibleToRoles: [
              "owner",
              "developer",
              "content_admin",
              "editor",
              "reviewer",
              "client_editor",
              "read_only",
            ],
            fields: [...fields].sort(compareFieldPosition).map((field, position) => ({
              id: field.id,
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

function compareFieldPosition(
  left: CollectionFieldDefinition,
  right: CollectionFieldDefinition,
): number {
  return left.position - right.position || left.id.localeCompare(right.id);
}

function draftStateSync(
  collection: CollectionRow,
  rows: ReadonlyArray<typeof cmsCollectionField.$inferSelect>,
): SchemaDraftState {
  const fields = decodeFieldTreeSync(rows);
  return {
    formatVersion: 2,
    validationProfile: fieldSystemValidationProfile,
    currencyRegistryProfile:
      collection.currencyRegistryProfile === null
        ? null
        : Schema.decodeUnknownSync(Schema.String)(collection.currencyRegistryProfile),
    collection: Schema.decodeUnknownSync(CmsCollection)(collectionValue(collection)),
    fields,
    editorLayout:
      collection.editorLayout === null
        ? syntheticEditorLayout(fields)
        : Schema.decodeUnknownSync(EditorLayout)(collection.editorLayout),
  };
}

function decodeDraftSync(
  collection: CollectionRow,
  rows: ReadonlyArray<typeof cmsCollectionField.$inferSelect>,
) {
  const draft = draftStateSync(collection, rows);
  return CollectionDraftSchema.make({
    ...draft,
    contractHash: hashCollectionContract(draft),
  });
}

async function loadPublishedRevisionRows(
  executor: ApplicationExecutor,
  input: {
    readonly collectionId: string;
    readonly projectId: string;
    readonly environmentId: string;
    readonly revisionId: string;
  },
) {
  const [revision] = await executor
    .select()
    .from(cmsSchemaRevision)
    .where(
      and(
        eq(cmsSchemaRevision.id, input.revisionId),
        eq(cmsSchemaRevision.collectionId, input.collectionId),
        eq(cmsSchemaRevision.projectId, input.projectId),
        eq(cmsSchemaRevision.environmentId, input.environmentId),
      ),
    )
    .limit(1);
  if (!revision) return null;
  const fields = await executor
    .select()
    .from(cmsSchemaRevisionField)
    .where(eq(cmsSchemaRevisionField.revisionId, revision.id))
    .orderBy(cmsSchemaRevisionField.position, cmsSchemaRevisionField.fieldId);
  return { revision, fields };
}

function decodePublishedSync(
  rows: NonNullable<Awaited<ReturnType<typeof loadPublishedRevisionRows>>>,
) {
  const { revision, fields: fieldRows } = rows;
  const fields = decodeFieldTreeSync(fieldRows);
  const editorLayout =
    revision.editorLayout === null
      ? syntheticEditorLayout(fields)
      : Schema.decodeUnknownSync(EditorLayout)(revision.editorLayout);
  const contractHash = hashSchemaContract({
    formatVersion: revision.formatVersion,
    validationProfile: revision.validationProfile,
    currencyRegistryProfile: revision.currencyRegistryProfile,
    collectionApiKey: revision.collectionApiKey,
    fields,
  });
  return Schema.decodeUnknownSync(PublishedSchemaRevision)({
    id: revision.id,
    workspaceId: revision.workspaceId,
    projectId: revision.projectId,
    environmentId: revision.environmentId,
    collectionId: revision.collectionId,
    sequence: revision.sequence,
    previousRevisionId: revision.previousRevisionId,
    formatVersion: revision.formatVersion,
    validationProfile: revision.validationProfile,
    currencyRegistryProfile: revision.currencyRegistryProfile,
    collectionApiKey: revision.collectionApiKey,
    collectionDisplayName: revision.collectionDisplayName,
    collectionDescription: revision.collectionDescription,
    schemaHash: revision.schemaHash,
    contractHash,
    commandId: revision.commandId,
    nonBreakingChangeCount: revision.nonBreakingChangeCount,
    potentiallyBreakingChangeCount: revision.potentiallyBreakingChangeCount,
    breakingChangeCount: revision.breakingChangeCount,
    publishedByUserId: revision.publishedByUserId,
    publishedAt: toIso(revision.publishedAt),
    fields,
    editorLayout,
  });
}

function referenceCollectionId(
  field: CollectionFieldMutation | CollectionFieldDefinition | CollectionFieldAuthoringNode,
): string | null {
  return field.kind === "reference" ? field.configuration.targetCollectionId : null;
}

function fieldMutationMatchesRole(
  field: CollectionFieldMutation | CollectionFieldAuthoringNode,
  nodeRole: "root" | "object_property" | "list_item",
): boolean {
  if (nodeRole === "list_item") {
    return (
      field.apiKey === null &&
      field.displayLabel === null &&
      field.required === null &&
      field.localization === null
    );
  }
  if (field.apiKey === null || field.displayLabel === null) return false;
  if (field.localization === "mixed") return field.kind === "object" && field.required === null;
  return field.required !== null && (nodeRole === "object_property" || field.localization !== null);
}

interface MaterializedAuthoringFields {
  readonly valid: boolean;
  readonly roots: ReadonlyArray<CollectionFieldDefinition>;
  readonly issues: ReadonlyArray<SchemaValidationIssue>;
}

/** Materializes one bounded authoring tree while preserving immutable active identities. */
function materializeAuthoringFields(
  fields: ReadonlyArray<CollectionFieldAuthoringNode>,
  currentFields: ReadonlyArray<CollectionFieldDefinition>,
): MaterializedAuthoringFields {
  const issues: Array<SchemaValidationIssue> = [];
  const currentById = new Map(currentFields.map((field) => [field.id, field]));
  const suppliedIds = new Set<string>();
  const candidates: Array<CollectionFieldDefinition> = [];
  const stack: Array<{
    readonly node: CollectionFieldAuthoringNode;
    readonly parent: CollectionFieldDefinition | null;
    readonly position: number;
    readonly depth: number;
    readonly path: string;
  }> = [];
  for (let index = fields.length - 1; index >= 0; index -= 1) {
    const node = fields[index];
    if (node)
      stack.push({ node, parent: null, position: index, depth: 1, path: `fields.${index}` });
  }

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) break;
    if (candidates.length >= fieldSystemLimits.fieldNodes) {
      issues.push(
        schemaInvalidIssue(
          "fields",
          "field_count_exceeded",
          `A schema can contain at most ${fieldSystemLimits.fieldNodes} field nodes.`,
        ),
      );
      break;
    }
    if (current.depth > fieldSystemLimits.definitionMaxDepth) {
      issues.push(
        schemaInvalidIssue(
          current.path,
          "field_depth_exceeded",
          `Field definitions cannot exceed depth ${fieldSystemLimits.definitionMaxDepth}.`,
        ),
      );
      continue;
    }

    const suppliedId = current.node.id;
    if (suppliedId !== null && suppliedIds.has(suppliedId)) {
      issues.push(
        schemaInvalidIssue(`${current.path}.id`, "field_id_duplicate", "Field IDs must be unique."),
      );
      continue;
    }
    if (suppliedId !== null) suppliedIds.add(suppliedId);
    const existing = suppliedId === null ? undefined : currentById.get(suppliedId);
    if (suppliedId !== null && !existing) {
      issues.push(
        schemaInvalidIssue(
          `${current.path}.id`,
          "field_id_unknown",
          "Retain an active field ID or use null to create a new field.",
        ),
      );
      continue;
    }

    const nodeRole =
      current.parent === null
        ? "root"
        : current.parent.kind === "object"
          ? "object_property"
          : "list_item";
    const fieldId = existing?.id ?? randomUUID();
    if (
      existing &&
      (existing.parentFieldId !== (current.parent?.id ?? null) || existing.nodeRole !== nodeRole)
    ) {
      issues.push(
        schemaInvalidIssue(
          `${current.path}.id`,
          "field_identity_reparented",
          "Existing field identities cannot move between parents or structural roles.",
        ),
      );
      continue;
    }
    if (!fieldMutationMatchesRole(current.node, nodeRole)) {
      issues.push(
        schemaInvalidIssue(
          current.path,
          "field_role_shape_invalid",
          "Field metadata does not match its structural role.",
        ),
      );
      continue;
    }
    if (
      nodeRole === "list_item" &&
      current.parent !== null &&
      JSON.stringify(current.node.editor) !== JSON.stringify(current.parent.editor)
    ) {
      issues.push(
        schemaInvalidIssue(
          `${current.path}.editor`,
          "list_item_editor_inherited",
          "List item editor access must inherit from its parent.",
        ),
      );
      continue;
    }

    const candidate = Schema.decodeUnknownSync(CollectionFieldDefinition)({
      id: fieldId,
      parentFieldId: current.parent?.id ?? null,
      nodeRole,
      apiKey: current.node.apiKey,
      displayLabel: current.node.displayLabel,
      kind: current.node.kind,
      required: current.node.required,
      localization: current.node.localization,
      deprecated: current.node.deprecated,
      editor: current.parent?.kind === "list" ? current.parent.editor : current.node.editor,
      configuration: current.node.configuration,
      position: nodeRole === "list_item" ? 0 : current.position,
      children: [],
    });
    candidates.push(candidate);
    for (let index = current.node.children.length - 1; index >= 0; index -= 1) {
      const child = current.node.children[index];
      if (child)
        stack.push({
          node: child,
          parent: candidate,
          position: index,
          depth: current.depth + 1,
          path: `${current.path}.children.${index}`,
        });
    }
  }

  if (issues.length > 0)
    return {
      valid: false,
      roots: [],
      issues: issues.slice(0, fieldSystemLimits.issues),
    };
  const tree = reconstructFieldTree(candidates);
  return {
    valid: tree.valid,
    roots: tree.roots,
    issues: tree.issues
      .slice(0, fieldSystemLimits.issues)
      .map((issue) => SchemaValidationIssue.make(issue)),
  };
}

/** Preserves placements for retained roots and appends only newly introduced roots. */
function reconcileRootPlacements(
  layout: EditorLayout,
  previousRoots: ReadonlyArray<CollectionFieldDefinition>,
  nextRoots: ReadonlyArray<CollectionFieldDefinition>,
): EditorLayout {
  const nextRootIds = new Set(nextRoots.map((field) => field.id));
  const previousRootIds = new Set(previousRoots.map((field) => field.id));
  let reconciled = layout;
  for (const field of previousRoots) {
    if (!nextRootIds.has(field.id)) reconciled = removeRootPlacement(reconciled, field.id);
  }
  for (const field of nextRoots) {
    if (!previousRootIds.has(field.id)) reconciled = appendRootPlacement(reconciled, field);
  }
  return reconciled;
}

async function referenceTargetExists(
  executor: ApplicationExecutor,
  collection: CollectionRow,
  targetCollectionId: string | null,
) {
  if (targetCollectionId === null) return true;
  const [target] = await executor
    .select({ id: cmsCollection.id })
    .from(cmsCollection)
    .where(
      and(
        eq(cmsCollection.id, targetCollectionId),
        eq(cmsCollection.workspaceId, collection.workspaceId),
        eq(cmsCollection.projectId, collection.projectId),
        eq(cmsCollection.environmentId, collection.environmentId),
      ),
    )
    .limit(1);
  return target !== undefined;
}

function schemaInvalidIssue(path: string, code: string, message: string) {
  return SchemaValidationIssue.make({ path, code, message });
}

function editorMetadataValue(
  editor: CollectionFieldDefinition["editor"],
): Readonly<Record<string, unknown>> {
  return {
    helpText: editor.helpText,
    placeholder: editor.placeholder,
    visibleToRoles: [...editor.visibleToRoles],
    editableByRoles: [...editor.editableByRoles],
  };
}

function editorLayoutValue(layout: EditorLayout): Readonly<Record<string, unknown>> {
  return {
    version: layout.version,
    tabs: layout.tabs.map((tab) => ({
      id: tab.id,
      title: tab.title,
      description: tab.description,
      position: tab.position,
      visibleToRoles: [...tab.visibleToRoles],
      groups: tab.groups.map((group) => ({
        id: group.id,
        title: group.title,
        description: group.description,
        position: group.position,
        columns: group.columns,
        visibleToRoles: [...group.visibleToRoles],
        fields: group.fields.map((field) => ({
          id: field.id,
          fieldId: field.fieldId,
          position: field.position,
          helpTextOverride: field.helpTextOverride,
          visibleToRoles: [...field.visibleToRoles],
        })),
      })),
    })),
    sidebarGroups: layout.sidebarGroups.map((group) => ({
      id: group.id,
      title: group.title,
      description: group.description,
      position: group.position,
      columns: group.columns,
      visibleToRoles: [...group.visibleToRoles],
      fields: group.fields.map((field) => ({
        id: field.id,
        fieldId: field.fieldId,
        position: field.position,
        helpTextOverride: field.helpTextOverride,
        visibleToRoles: [...field.visibleToRoles],
      })),
    })),
  };
}

function appendRootPlacement(layout: EditorLayout, field: CollectionFieldDefinition): EditorLayout {
  const lastTab = layout.tabs.at(-1);
  const lastGroup = lastTab?.groups.at(-1);
  if (!lastTab || !lastGroup) return layout;
  const nextGroup = {
    ...lastGroup,
    fields: [
      ...lastGroup.fields,
      {
        id: randomUUID(),
        fieldId: field.id,
        position: lastGroup.fields.length,
        helpTextOverride: null,
        visibleToRoles: field.editor.visibleToRoles,
      },
    ],
  };
  return Schema.decodeUnknownSync(EditorLayout)({
    ...layout,
    tabs: layout.tabs.map((tab) =>
      tab.id === lastTab.id
        ? {
            ...tab,
            groups: tab.groups.map((group) => (group.id === lastGroup.id ? nextGroup : group)),
          }
        : tab,
    ),
  });
}

function removeRootPlacement(layout: EditorLayout, fieldId: string): EditorLayout {
  return Schema.decodeUnknownSync(EditorLayout)({
    ...layout,
    tabs: layout.tabs.map((tab) => ({
      ...tab,
      groups: tab.groups.map((group) => ({
        ...group,
        fields: group.fields
          .filter((placement) => placement.fieldId !== fieldId)
          .map((placement, position) => ({ ...placement, position })),
      })),
    })),
    sidebarGroups: layout.sidebarGroups.map((group) => ({
      ...group,
      fields: group.fields
        .filter((placement) => placement.fieldId !== fieldId)
        .map((placement, position) => ({ ...placement, position })),
    })),
  });
}

function projectFieldForRole(
  field: CollectionFieldDefinition,
  role: typeof ProjectRole.Type,
): CollectionFieldDefinition | null {
  if (!field.editor.visibleToRoles.includes(role)) return null;
  const children: Array<CollectionFieldDefinition> = [];
  for (const child of field.children) {
    const projected = projectFieldForRole(child, role);
    if (projected) children.push(projected);
  }
  return { ...field, children };
}

function projectLayoutForRole(
  layout: EditorLayout,
  visibleFieldIds: ReadonlySet<string>,
  role: typeof ProjectRole.Type,
): EditorLayout {
  const tabs = layout.tabs
    .filter((tab) => tab.visibleToRoles.includes(role))
    .map((tab, tabPosition) => ({
      ...tab,
      position: tabPosition,
      groups: tab.groups
        .filter((group) => group.visibleToRoles.includes(role))
        .map((group, groupPosition) => ({
          ...group,
          position: groupPosition,
          fields: group.fields
            .filter(
              (placement) =>
                placement.visibleToRoles.includes(role) && visibleFieldIds.has(placement.fieldId),
            )
            .map((placement, position) => ({ ...placement, position })),
        })),
    }))
    .filter((tab) => tab.groups.length > 0);
  const sidebarGroups = layout.sidebarGroups
    .filter((group) => group.visibleToRoles.includes(role))
    .map((group, position) => ({
      ...group,
      position,
      fields: group.fields
        .filter(
          (placement) =>
            placement.visibleToRoles.includes(role) && visibleFieldIds.has(placement.fieldId),
        )
        .map((placement, fieldPosition) => ({ ...placement, position: fieldPosition })),
    }));
  if (tabs.length === 0) return syntheticEditorLayout([]);
  return Schema.decodeUnknownSync(EditorLayout)({
    version: 1,
    tabs,
    sidebarGroups,
  });
}

function generatedFormDefinition(options: {
  readonly source: "draft" | "published";
  readonly collectionId: string;
  readonly revisionId: string | null;
  readonly formatVersion: number;
  readonly validationProfile: string;
  readonly currencyRegistryProfile: string | null;
  readonly contractHash: ContractHash;
  readonly role: typeof ProjectRole.Type;
  readonly fields: ReadonlyArray<CollectionFieldDefinition>;
  readonly editorLayout: EditorLayout;
}) {
  const fields: Array<CollectionFieldDefinition> = [];
  for (const field of options.fields) {
    const projected = projectFieldForRole(field, options.role);
    if (projected) fields.push(projected);
  }
  const flattened = flattenFieldTree(fields);
  const fieldIds = new Set(flattened.map((field) => field.id));
  const canEdit = isRoleAllowed(options.role, "content.write");
  const editableFieldIds = canEdit
    ? flattened
        .filter((field) => field.editor.editableByRoles.includes(options.role))
        .map((field) => field.id)
    : [];
  const currencies = new Set<string>();
  for (const field of flattened) {
    if (field.kind === "money") {
      for (const currency of field.configuration.currencies) currencies.add(currency);
    }
  }
  const currencyMinorUnits: Record<string, number> = {};
  for (const currency of [...currencies].sort()) {
    const minorUnit = Reflect.get(iso4217MinorUnits, currency);
    if (typeof minorUnit === "number") currencyMinorUnits[currency] = minorUnit;
  }
  return Schema.decodeUnknownSync(GeneratedFormDefinition)({
    ...options,
    canEdit,
    fields,
    editableFieldIds,
    editorLayout: projectLayoutForRole(options.editorLayout, fieldIds, options.role),
    currencyMinorUnits,
  });
}

async function lockCollection(executor: ApplicationExecutor, collectionId: string) {
  await executor.execute(sql`select id from cms_collection where id = ${collectionId} for update`);
}

async function lockActiveFields(executor: ApplicationExecutor, collectionId: string) {
  await executor.execute(
    sql`select id from cms_collection_field where collection_id = ${collectionId} and removed_at is null order by id for update`,
  );
}

async function bumpDraft(
  executor: ApplicationExecutor,
  collectionId: string,
  actorId: AuthUserId,
  now: Date,
) {
  await executor
    .update(cmsCollectionSchemaHead)
    .set({
      changedByUserId: actorId,
      draftVersion: sql`${cmsCollectionSchemaHead.draftVersion} + 1`,
      updatedAt: now,
    })
    .where(eq(cmsCollectionSchemaHead.collectionId, collectionId));
}

function exactAcknowledgements(
  changes: ReturnType<typeof classifyCollectionSchemaChanges>,
  acknowledged: ReadonlyArray<string>,
) {
  const required = requiredAcknowledgementChanges(changes);
  const values = new Set(acknowledged);
  return required.length === values.size && required.every((change) => values.has(change.changeId));
}

export type SchemaPublicationStep =
  | "revision"
  | "snapshots"
  | "head"
  | "audit"
  | "invalidation_mapping_load"
  | "invalidation_projection"
  | "event_size_validation"
  | "pre_outbox"
  | "outbox";

interface RepositoryOptions {
  readonly database?: ApplicationDb;
  readonly testFailPublicationAfter?: SchemaPublicationStep;
}

export function makeSchemaRepository(options: RepositoryOptions = {}) {
  const database = options.database ?? db;
  const failPublicationAfter = (step: SchemaPublicationStep) => {
    if (options.testFailPublicationAfter === step) {
      throw new Error(`Injected schema publication failure after ${step}.`);
    }
  };

  return {
    listCollections: Effect.fn("SchemaRepository.listCollections")(function* (
      actorId: AuthUserId,
      input: ListCollectionsInput,
    ) {
      const cursor =
        input.cursor === null
          ? null
          : yield* decodeCollectionCursor(input.cursor, input.environmentId);
      const result = yield* Effect.tryPromise({
        try: async () => {
          const authorization = await authorizeEnvironment(
            database,
            actorId,
            input.projectId,
            input.environmentId,
            "schema.read",
          );
          if (authorization.kind !== "allowed")
            return outcomeWith(authorization.kind, { rows: [] });

          const cursorCondition =
            cursor === null
              ? undefined
              : or(
                  lt(cmsCollection.createdAt, new Date(cursor.createdAt)),
                  and(
                    eq(cmsCollection.createdAt, new Date(cursor.createdAt)),
                    lt(cmsCollection.id, cursor.collectionId),
                  ),
                );
          const rows = await database
            .select(collectionProjection)
            .from(cmsCollection)
            .innerJoin(
              cmsCollectionSchemaHead,
              eq(cmsCollectionSchemaHead.collectionId, cmsCollection.id),
            )
            .where(
              and(
                eq(cmsCollection.workspaceId, authorization.access.project.workspaceId),
                eq(cmsCollection.projectId, input.projectId),
                eq(cmsCollection.environmentId, input.environmentId),
                cursorCondition,
              ),
            )
            .orderBy(desc(cmsCollection.createdAt), desc(cmsCollection.id))
            .limit(input.limit + 1);
          return outcomeWith("success", { rows });
        },
        catch: (cause) => databaseFailure("schema.collection.list", cause),
      });
      if (result.kind === "not_found") return yield* NotFoundFailure.make({ resource: "project" });
      if (result.kind === "forbidden") return yield* ForbiddenFailure.make();
      if (result.kind === "cms_required") return yield* CmsCapabilityRequiredFailure.make();

      const hasMore = result.rows.length > input.limit;
      const pageRows = hasMore ? result.rows.slice(0, input.limit) : result.rows;
      const items = yield* Effect.forEach(pageRows, (row) =>
        decodeDatabaseValue("schema.collection.list", CmsCollection, collectionValue(row)),
      );
      const last = pageRows.at(-1);
      const lastItem = items.at(-1);
      const nextCursor =
        hasMore && last && lastItem
          ? yield* encodeCollectionCursor({
              environmentId: input.environmentId,
              createdAt: toIso(last.createdAt),
              collectionId: lastItem.id,
            })
          : null;
      return CmsCollectionPage.make({ items, nextCursor });
    }),

    createCollection: Effect.fn("SchemaRepository.createCollection")(function* (
      actorId: AuthUserId,
      input: CreateCollectionInput,
      now: Date,
      requestId: string,
    ) {
      const result = yield* Effect.tryPromise({
        try: () =>
          database.transaction(async (transaction) => {
            await lockProjectShared(transaction, input.projectId);
            const authorization = await authorizeEnvironment(
              transaction,
              actorId,
              input.projectId,
              input.environmentId,
              "schema.write",
            );
            if (authorization.kind === "not_found") return outcome("not_found");
            if (authorization.kind === "forbidden") return outcome("forbidden");
            if (authorization.kind === "cms_required") return outcome("cms_required");
            if (authorization.access.project.archivedAt) return outcome("invalid_state");

            const [collection] = await transaction
              .insert(cmsCollection)
              .values({
                workspaceId: authorization.access.project.workspaceId,
                projectId: input.projectId,
                environmentId: input.environmentId,
                apiKey: input.apiKey,
                displayName: input.displayName,
                description: input.description,
                createdByUserId: actorId,
                changedByUserId: actorId,
                createdAt: now,
                updatedAt: now,
              })
              .returning();
            if (!collection) throw new Error("Collection insert returned no row.");
            await transaction.insert(cmsCollectionSchemaHead).values({
              collectionId: collection.id,
              workspaceId: collection.workspaceId,
              projectId: collection.projectId,
              environmentId: collection.environmentId,
              changedByUserId: actorId,
              updatedAt: now,
            });
            await transaction.insert(cmsCollectionDeliveryConfig).values({
              collectionId: collection.id,
              workspaceId: collection.workspaceId,
              projectId: collection.projectId,
              environmentId: collection.environmentId,
              access: "protected",
              version: 1,
              changedByUserId: actorId,
              createdAt: now,
              updatedAt: now,
            });
            await transaction.insert(auditEvent).values(
              makeAuditValues({
                workspaceId: collection.workspaceId,
                projectId: collection.projectId,
                environmentId: collection.environmentId,
                actorId,
                action: "cms.collection.created",
                resourceId: collection.id,
                requestId,
              }),
            );
            const row = await selectCollection(transaction, {
              collectionId: collection.id,
              projectId: collection.projectId,
              environmentId: collection.environmentId,
            });
            if (!row) throw new Error("Created collection could not be loaded.");
            return outcomeWith("success", { row });
          }),
        catch: (cause) =>
          hasConstraint(cause, "cms_collection_environment_key_unique")
            ? CollectionKeyConflictFailure.make()
            : databaseFailure("schema.collection.create", cause),
      });
      if (result.kind === "not_found") return yield* NotFoundFailure.make({ resource: "project" });
      if (result.kind === "forbidden") return yield* ForbiddenFailure.make();
      if (result.kind === "cms_required") return yield* CmsCapabilityRequiredFailure.make();
      if (result.kind === "invalid_state") return yield* InvalidStateTransitionFailure.make();
      return yield* decodeDatabaseValue(
        "schema.collection.create",
        CmsCollection,
        collectionValue(result.row),
      );
    }),

    getCollection: Effect.fn("SchemaRepository.getCollection")(function* (
      actorId: AuthUserId,
      input: GetCollectionInput,
    ) {
      const result = yield* Effect.tryPromise({
        try: async () => {
          const authorization = await authorizeEnvironment(
            database,
            actorId,
            input.projectId,
            input.environmentId,
            "schema.read",
          );
          if (authorization.kind === "not_found") {
            return outcomeWith("not_found", { row: null });
          }
          if (authorization.kind === "forbidden") {
            return outcomeWith("forbidden", { row: null });
          }
          if (authorization.kind === "cms_required") {
            return outcomeWith("cms_required", { row: null });
          }
          const row = await selectCollection(database, input);
          if (!row || row.workspaceId !== authorization.access.project.workspaceId) {
            return outcomeWith("not_found", { row: null });
          }
          return outcomeWith("success", { row });
        },
        catch: (cause) => databaseFailure("schema.collection.get", cause),
      });
      if (result.kind === "not_found")
        return yield* NotFoundFailure.make({ resource: "collection" });
      if (result.kind === "forbidden") return yield* ForbiddenFailure.make();
      if (result.kind === "cms_required") return yield* CmsCapabilityRequiredFailure.make();
      return yield* decodeDatabaseValue(
        "schema.collection.get",
        CmsCollection,
        collectionValue(result.row),
      );
    }),

    updateCollection: Effect.fn("SchemaRepository.updateCollection")(function* (
      actorId: AuthUserId,
      input: UpdateCollectionInput,
      now: Date,
      requestId: string,
    ) {
      const result = yield* Effect.tryPromise({
        try: () =>
          database.transaction(async (transaction) => {
            await lockProjectShared(transaction, input.projectId);
            const authorization = await authorizeEnvironment(
              transaction,
              actorId,
              input.projectId,
              input.environmentId,
              "schema.write",
            );
            if (authorization.kind === "not_found") return outcome("not_found");
            if (authorization.kind === "forbidden") return outcome("forbidden");
            if (authorization.kind === "cms_required") return outcome("cms_required");
            if (authorization.access.project.archivedAt) return outcome("invalid_state");
            await transaction.execute(
              sql`select id from cms_collection where id = ${input.collectionId} for update`,
            );
            const current = await selectCollection(transaction, input);
            if (!current || current.workspaceId !== authorization.access.project.workspaceId) {
              return outcome("not_found");
            }
            if (current.version !== input.version || current.draftVersion !== input.draftVersion) {
              return outcome("version_conflict");
            }
            if (
              current.displayName === input.displayName &&
              current.description === input.description
            ) {
              return outcomeWith("success", { row: current });
            }
            await transaction
              .update(cmsCollection)
              .set({
                displayName: input.displayName,
                description: input.description,
                changedByUserId: actorId,
                version: sql`${cmsCollection.version} + 1`,
                updatedAt: now,
              })
              .where(eq(cmsCollection.id, input.collectionId));
            await transaction
              .update(cmsCollectionSchemaHead)
              .set({
                changedByUserId: actorId,
                draftVersion: sql`${cmsCollectionSchemaHead.draftVersion} + 1`,
                updatedAt: now,
              })
              .where(eq(cmsCollectionSchemaHead.collectionId, input.collectionId));
            await transaction.insert(auditEvent).values(
              makeAuditValues({
                workspaceId: current.workspaceId,
                projectId: current.projectId,
                environmentId: current.environmentId,
                actorId,
                action: "cms.collection.updated",
                resourceId: current.id,
                requestId,
              }),
            );
            const row = await selectCollection(transaction, input);
            if (!row) throw new Error("Updated collection could not be loaded.");
            return outcomeWith("success", { row });
          }),
        catch: (cause) => databaseFailure("schema.collection.update", cause),
      });
      if (result.kind === "not_found")
        return yield* NotFoundFailure.make({ resource: "collection" });
      if (result.kind === "forbidden") return yield* ForbiddenFailure.make();
      if (result.kind === "cms_required") return yield* CmsCapabilityRequiredFailure.make();
      if (result.kind === "invalid_state") return yield* InvalidStateTransitionFailure.make();
      if (result.kind === "version_conflict") return yield* VersionConflictFailure.make();
      return yield* decodeDatabaseValue(
        "schema.collection.update",
        CmsCollection,
        collectionValue(result.row),
      );
    }),

    getDraft: Effect.fn("SchemaRepository.getDraft")(function* (
      actorId: AuthUserId,
      input: GetCollectionDraftInput,
    ) {
      const result = yield* Effect.tryPromise({
        try: async () => {
          const authorization = await authorizeEnvironment(
            database,
            actorId,
            input.projectId,
            input.environmentId,
            "schema.write",
          );
          if (authorization.kind === "not_found") return outcome("not_found");
          if (authorization.kind === "forbidden") return outcome("forbidden");
          if (authorization.kind === "cms_required") return outcome("cms_required");
          const collection = await selectCollection(database, input);
          if (!collection || collection.workspaceId !== authorization.access.project.workspaceId) {
            return outcome("not_found");
          }
          return outcomeWith("success", {
            draft: decodeDraftSync(
              collection,
              await loadActiveFieldRows(database, input.collectionId),
            ),
          });
        },
        catch: (cause) => databaseFailure("schema.draft.get", cause),
      });
      if (result.kind === "not_found")
        return yield* NotFoundFailure.make({ resource: "collection" });
      if (result.kind === "forbidden") return yield* ForbiddenFailure.make();
      if (result.kind === "cms_required") return yield* CmsCapabilityRequiredFailure.make();
      return result.draft;
    }),

    createField: Effect.fn("SchemaRepository.createField")(function* (
      actorId: AuthUserId,
      input: CreateCollectionFieldInput,
      now: Date,
      requestId: string,
    ) {
      const result = yield* Effect.tryPromise({
        try: () =>
          database.transaction(async (transaction) => {
            await lockProjectShared(transaction, input.projectId);
            const authorization = await authorizeEnvironment(
              transaction,
              actorId,
              input.projectId,
              input.environmentId,
              "schema.write",
            );
            if (authorization.kind === "not_found") return outcome("not_found");
            if (authorization.kind === "forbidden") return outcome("forbidden");
            if (authorization.kind === "cms_required") return outcome("cms_required");
            if (authorization.access.project.archivedAt) return outcome("invalid_state");
            await lockCollection(transaction, input.collectionId);
            const collection = await selectCollection(transaction, input);
            if (!collection || collection.workspaceId !== authorization.access.project.workspaceId)
              return outcome("not_found");
            if (collection.draftVersion !== input.draftVersion) return outcome("version_conflict");
            await lockActiveFields(transaction, input.collectionId);
            const rows = await loadActiveFieldRows(transaction, input.collectionId);
            if (rows.length >= 100) return outcome("conflict");

            const parentRow =
              input.parentFieldId === null
                ? undefined
                : rows.find((row) => row.id === input.parentFieldId);
            if (input.parentFieldId !== null && !parentRow) return outcome("not_found");
            const parent = parentRow ? fieldValue(parentRow) : null;
            if (parent && parent.kind !== "object" && parent.kind !== "list")
              return outcome("conflict");
            if (parent?.kind === "list" && rows.some((row) => row.parentFieldId === parent.id))
              return outcome("conflict");
            const nodeRole =
              parent === null ? "root" : parent.kind === "object" ? "object_property" : "list_item";
            if (!fieldMutationMatchesRole(input.field, nodeRole))
              return outcomeWith("schema_invalid", {
                issues: [
                  schemaInvalidIssue(
                    "field",
                    "field_role_shape_invalid",
                    "Field metadata does not match its structural role.",
                  ),
                ],
              });
            if (
              nodeRole === "list_item" &&
              parent !== null &&
              JSON.stringify(input.field.editor) !== JSON.stringify(parent.editor)
            )
              return outcomeWith("schema_invalid", {
                issues: [
                  schemaInvalidIssue(
                    "field.editor",
                    "list_item_editor_inherited",
                    "List item editor access must inherit from its parent.",
                  ),
                ],
              });
            const targetCollectionId = referenceCollectionId(input.field);
            if (!(await referenceTargetExists(transaction, collection, targetCollectionId)))
              return outcomeWith("schema_invalid", {
                issues: [
                  schemaInvalidIssue(
                    "field.configuration.targetCollectionId",
                    "reference_target_invalid",
                    "The reference target is not available in this environment.",
                  ),
                ],
              });

            const siblingCount = rows.filter(
              (row) => row.parentFieldId === input.parentFieldId,
            ).length;
            const fieldId = randomUUID();
            const editor = nodeRole === "list_item" && parent ? parent.editor : input.field.editor;
            const candidate = Schema.decodeUnknownSync(CollectionFieldDefinition)({
              id: fieldId,
              parentFieldId: input.parentFieldId,
              nodeRole,
              ...input.field,
              editor,
              position: nodeRole === "list_item" ? 0 : siblingCount,
              children: [],
            });
            const tree = reconstructFieldTree([...rows.map(fieldValue), candidate]);
            if (!tree.valid)
              return outcomeWith("schema_invalid", {
                issues: tree.issues.map((issue) => SchemaValidationIssue.make(issue)),
              });
            const currentDraft = draftStateSync(collection, rows);
            const storedLayout =
              collection.editorLayout === null
                ? null
                : nodeRole === "root"
                  ? appendRootPlacement(currentDraft.editorLayout, candidate)
                  : currentDraft.editorLayout;
            const editorLayout =
              storedLayout === null ? syntheticEditorLayout(tree.roots) : storedLayout;
            const flattened = flattenFieldTree(tree.roots);
            const prospective: SchemaDraftState = {
              ...currentDraft,
              fields: tree.roots,
              editorLayout,
              currencyRegistryProfile: flattened.some((field) => field.kind === "money")
                ? currentCurrencyRegistryProfile
                : null,
            };
            const validation = validateCollectionDraft(prospective, "draft");
            if (!validation.valid)
              return outcomeWith("schema_invalid", { issues: validation.issues });

            const [created] = await transaction
              .insert(cmsCollectionField)
              .values({
                id: fieldId,
                workspaceId: collection.workspaceId,
                projectId: collection.projectId,
                environmentId: collection.environmentId,
                collectionId: collection.id,
                parentFieldId: input.parentFieldId,
                nodeRole,
                referenceCollectionId: targetCollectionId,
                apiKey: input.field.apiKey,
                displayLabel: input.field.displayLabel,
                kind: input.field.kind,
                required: input.field.required,
                localization: input.field.localization,
                deprecated: input.field.deprecated,
                position: candidate.position,
                editorMetadata: editorMetadataValue(editor),
                configuration: input.field.configuration,
                createdByUserId: actorId,
                changedByUserId: actorId,
                createdAt: now,
                updatedAt: now,
              })
              .returning();
            if (!created) throw new Error("Field insert returned no row.");
            await transaction
              .update(cmsCollectionSchemaHead)
              .set({
                validationProfile: fieldSystemValidationProfile,
                currencyRegistryProfile: prospective.currencyRegistryProfile,
                editorLayout: storedLayout === null ? null : editorLayoutValue(storedLayout),
              })
              .where(eq(cmsCollectionSchemaHead.collectionId, collection.id));
            await bumpDraft(transaction, collection.id, actorId, now);
            await transaction.insert(auditEvent).values(
              makeAuditValues({
                workspaceId: collection.workspaceId,
                projectId: collection.projectId,
                environmentId: collection.environmentId,
                actorId,
                action: "cms.schema.field.created",
                resourceType: "cms_collection_field",
                resourceId: created.id,
                requestId,
              }),
            );
            const current = await selectCollection(transaction, input);
            if (!current) throw new Error("Draft collection could not be reloaded.");
            return outcomeWith("success", {
              draft: decodeDraftSync(
                current,
                await loadActiveFieldRows(transaction, input.collectionId),
              ),
            });
          }),
        catch: (cause) =>
          [
            "cms_field_collection_active_root_key_unique",
            "cms_field_collection_active_child_key_unique",
            "cms_field_collection_active_list_item_unique",
          ].some((constraint) => hasConstraint(cause, constraint))
            ? ConflictFailure.make()
            : databaseFailure("schema.field.create", cause),
      });
      if (result.kind === "not_found")
        return yield* NotFoundFailure.make({ resource: "collection" });
      if (result.kind === "forbidden") return yield* ForbiddenFailure.make();
      if (result.kind === "cms_required") return yield* CmsCapabilityRequiredFailure.make();
      if (result.kind === "invalid_state") return yield* InvalidStateTransitionFailure.make();
      if (result.kind === "version_conflict") return yield* VersionConflictFailure.make();
      if (result.kind === "conflict") return yield* ConflictFailure.make();
      if (result.kind === "schema_invalid")
        return yield* SchemaInvalidFailure.make({ issues: result.issues });
      return result.draft;
    }),

    updateField: Effect.fn("SchemaRepository.updateField")(function* (
      actorId: AuthUserId,
      input: UpdateCollectionFieldInput,
      now: Date,
      requestId: string,
    ) {
      const result = yield* Effect.tryPromise({
        try: () =>
          database.transaction(async (transaction) => {
            await lockProjectShared(transaction, input.projectId);
            const authorization = await authorizeEnvironment(
              transaction,
              actorId,
              input.projectId,
              input.environmentId,
              "schema.write",
            );
            if (authorization.kind === "not_found") return outcome("not_found");
            if (authorization.kind === "forbidden") return outcome("forbidden");
            if (authorization.kind === "cms_required") return outcome("cms_required");
            if (authorization.access.project.archivedAt) return outcome("invalid_state");
            await lockCollection(transaction, input.collectionId);
            const collection = await selectCollection(transaction, input);
            if (!collection || collection.workspaceId !== authorization.access.project.workspaceId)
              return outcome("not_found");
            if (collection.draftVersion !== input.draftVersion) return outcome("version_conflict");
            await lockActiveFields(transaction, input.collectionId);
            const rows = await loadActiveFieldRows(transaction, input.collectionId);
            const current = rows.find((row) => row.id === input.fieldId);
            if (!current) return outcome("not_found");
            const currentDefinition = fieldValue(current);
            const parent =
              current.parentFieldId === null
                ? null
                : rows.find((row) => row.id === current.parentFieldId);
            const inheritedEditor = parent ? fieldValue(parent).editor : null;
            if (!fieldMutationMatchesRole(input.field, currentDefinition.nodeRole))
              return outcomeWith("schema_invalid", {
                issues: [
                  schemaInvalidIssue(
                    "field",
                    "field_role_shape_invalid",
                    "Field metadata does not match its structural role.",
                  ),
                ],
              });
            if (
              currentDefinition.nodeRole === "list_item" &&
              inheritedEditor !== null &&
              JSON.stringify(input.field.editor) !== JSON.stringify(inheritedEditor)
            )
              return outcomeWith("schema_invalid", {
                issues: [
                  schemaInvalidIssue(
                    "field.editor",
                    "list_item_editor_inherited",
                    "List item editor access must inherit from its parent.",
                  ),
                ],
              });
            const targetCollectionId = referenceCollectionId(input.field);
            if (!(await referenceTargetExists(transaction, collection, targetCollectionId)))
              return outcomeWith("schema_invalid", {
                issues: [
                  schemaInvalidIssue(
                    "field.configuration.targetCollectionId",
                    "reference_target_invalid",
                    "The reference target is not available in this environment.",
                  ),
                ],
              });
            const editor = inheritedEditor ?? input.field.editor;
            const unchanged =
              current.apiKey === input.field.apiKey &&
              current.displayLabel === input.field.displayLabel &&
              current.kind === input.field.kind &&
              current.required === input.field.required &&
              current.localization === input.field.localization &&
              current.deprecated === input.field.deprecated &&
              current.referenceCollectionId === targetCollectionId &&
              JSON.stringify(current.editorMetadata) === JSON.stringify(editor) &&
              JSON.stringify(current.configuration) === JSON.stringify(input.field.configuration);
            if (unchanged)
              return outcomeWith("success", { draft: decodeDraftSync(collection, rows) });

            const candidate = Schema.decodeUnknownSync(CollectionFieldDefinition)({
              id: current.id,
              parentFieldId: current.parentFieldId,
              nodeRole: currentDefinition.nodeRole,
              ...input.field,
              editor,
              position: current.position,
              children: [],
            });
            const tree = reconstructFieldTree(
              rows.map((row) => (row.id === current.id ? candidate : fieldValue(row))),
            );
            if (!tree.valid)
              return outcomeWith("schema_invalid", {
                issues: tree.issues.map((issue) => SchemaValidationIssue.make(issue)),
              });
            const currentDraft = draftStateSync(collection, rows);
            const prospective: SchemaDraftState = {
              ...currentDraft,
              fields: tree.roots,
              currencyRegistryProfile: flattenFieldTree(tree.roots).some(
                (field) => field.kind === "money",
              )
                ? currentCurrencyRegistryProfile
                : null,
            };
            const validation = validateCollectionDraft(prospective, "draft");
            if (!validation.valid)
              return outcomeWith("schema_invalid", { issues: validation.issues });

            await transaction
              .update(cmsCollectionField)
              .set({
                referenceCollectionId: targetCollectionId,
                apiKey: input.field.apiKey,
                displayLabel: input.field.displayLabel,
                kind: input.field.kind,
                required: input.field.required,
                localization: input.field.localization,
                deprecated: input.field.deprecated,
                editorMetadata: editorMetadataValue(editor),
                configuration: input.field.configuration,
                changedByUserId: actorId,
                updatedAt: now,
              })
              .where(
                and(
                  eq(cmsCollectionField.id, input.fieldId),
                  eq(cmsCollectionField.collectionId, input.collectionId),
                  isNull(cmsCollectionField.removedAt),
                ),
              );
            await transaction
              .update(cmsCollectionSchemaHead)
              .set({
                validationProfile: fieldSystemValidationProfile,
                currencyRegistryProfile: prospective.currencyRegistryProfile,
              })
              .where(eq(cmsCollectionSchemaHead.collectionId, collection.id));
            await bumpDraft(transaction, collection.id, actorId, now);
            await transaction.insert(auditEvent).values(
              makeAuditValues({
                workspaceId: collection.workspaceId,
                projectId: collection.projectId,
                environmentId: collection.environmentId,
                actorId,
                action: "cms.schema.field.updated",
                resourceType: "cms_collection_field",
                resourceId: current.id,
                requestId,
              }),
            );
            const nextCollection = await selectCollection(transaction, input);
            if (!nextCollection) throw new Error("Draft collection could not be reloaded.");
            return outcomeWith("success", {
              draft: decodeDraftSync(
                nextCollection,
                await loadActiveFieldRows(transaction, input.collectionId),
              ),
            });
          }),
        catch: (cause) =>
          [
            "cms_field_collection_active_root_key_unique",
            "cms_field_collection_active_child_key_unique",
          ].some((constraint) => hasConstraint(cause, constraint))
            ? ConflictFailure.make()
            : databaseFailure("schema.field.update", cause),
      });
      if (result.kind === "not_found") return yield* NotFoundFailure.make({ resource: "field" });
      if (result.kind === "forbidden") return yield* ForbiddenFailure.make();
      if (result.kind === "cms_required") return yield* CmsCapabilityRequiredFailure.make();
      if (result.kind === "invalid_state") return yield* InvalidStateTransitionFailure.make();
      if (result.kind === "version_conflict") return yield* VersionConflictFailure.make();
      if (result.kind === "schema_invalid")
        return yield* SchemaInvalidFailure.make({ issues: result.issues });
      return result.draft;
    }),

    replaceFields: Effect.fn("SchemaRepository.replaceFields")(function* (
      actorId: AuthUserId,
      input: ReplaceCollectionDraftFieldsInput,
      now: Date,
      requestId: string,
    ) {
      const result = yield* Effect.tryPromise({
        try: () =>
          database.transaction(async (transaction) => {
            await lockProjectShared(transaction, input.projectId);
            const authorization = await authorizeEnvironment(
              transaction,
              actorId,
              input.projectId,
              input.environmentId,
              "schema.write",
            );
            if (authorization.kind === "not_found") return outcome("not_found");
            if (authorization.kind === "forbidden") return outcome("forbidden");
            if (authorization.kind === "cms_required") return outcome("cms_required");
            if (authorization.access.project.archivedAt) return outcome("invalid_state");
            await lockCollection(transaction, input.collectionId);
            const collection = await selectCollection(transaction, input);
            if (!collection || collection.workspaceId !== authorization.access.project.workspaceId)
              return outcome("not_found");
            if (collection.draftVersion !== input.draftVersion) return outcome("version_conflict");
            await lockActiveFields(transaction, input.collectionId);
            const rows = await loadActiveFieldRows(transaction, input.collectionId);
            const currentDefinitions = rows.map(fieldValue);
            const materialized = materializeAuthoringFields(input.fields, currentDefinitions);
            if (!materialized.valid)
              return outcomeWith("schema_invalid", { issues: materialized.issues });

            const flattened = flattenFieldTree(materialized.roots);
            for (const field of flattened) {
              const targetCollectionId = referenceCollectionId(field);
              if (!(await referenceTargetExists(transaction, collection, targetCollectionId)))
                return outcomeWith("schema_invalid", {
                  issues: [
                    schemaInvalidIssue(
                      `fields.${field.id}.configuration.targetCollectionId`,
                      "reference_target_invalid",
                      "The reference target is not available in this environment.",
                    ),
                  ],
                });
            }

            const currentDraft = draftStateSync(collection, rows);
            const storedLayout =
              collection.editorLayout === null
                ? null
                : reconcileRootPlacements(
                    currentDraft.editorLayout,
                    currentDraft.fields,
                    materialized.roots,
                  );
            const editorLayout =
              storedLayout === null ? syntheticEditorLayout(materialized.roots) : storedLayout;
            const prospective: SchemaDraftState = {
              ...currentDraft,
              fields: materialized.roots,
              editorLayout,
              currencyRegistryProfile: flattened.some((field) => field.kind === "money")
                ? currentCurrencyRegistryProfile
                : null,
            };
            const validation = validateCollectionDraft(prospective, "draft");
            if (!validation.valid)
              return outcomeWith("schema_invalid", { issues: validation.issues });
            if (
              JSON.stringify(currentDraft.fields) === JSON.stringify(materialized.roots) &&
              JSON.stringify(currentDraft.editorLayout) === JSON.stringify(editorLayout)
            )
              return outcomeWith("success", { draft: decodeDraftSync(collection, rows) });

            const currentIds = new Set(rows.map((row) => row.id));
            if (rows.length > 0)
              await transaction
                .update(cmsCollectionField)
                .set({
                  removedAt: now,
                  removedByUserId: actorId,
                  position: null,
                  changedByUserId: actorId,
                  updatedAt: now,
                })
                .where(inArray(cmsCollectionField.id, [...currentIds]));

            for (const field of flattened) {
              const values = {
                parentFieldId: field.parentFieldId,
                nodeRole: field.nodeRole,
                referenceCollectionId: referenceCollectionId(field),
                apiKey: field.apiKey,
                displayLabel: field.displayLabel,
                kind: field.kind,
                required: field.required,
                localization: field.localization,
                deprecated: field.deprecated,
                position: field.position,
                editorMetadata: editorMetadataValue(field.editor),
                configuration: field.configuration,
                changedByUserId: actorId,
                removedAt: null,
                removedByUserId: null,
                updatedAt: now,
              };
              if (currentIds.has(field.id)) {
                await transaction
                  .update(cmsCollectionField)
                  .set(values)
                  .where(
                    and(
                      eq(cmsCollectionField.id, field.id),
                      eq(cmsCollectionField.collectionId, collection.id),
                    ),
                  );
              } else {
                await transaction.insert(cmsCollectionField).values({
                  id: field.id,
                  workspaceId: collection.workspaceId,
                  projectId: collection.projectId,
                  environmentId: collection.environmentId,
                  collectionId: collection.id,
                  ...values,
                  createdByUserId: actorId,
                  createdAt: now,
                });
              }
            }

            await transaction
              .update(cmsCollectionSchemaHead)
              .set({
                validationProfile: fieldSystemValidationProfile,
                currencyRegistryProfile: prospective.currencyRegistryProfile,
                editorLayout: storedLayout === null ? null : editorLayoutValue(storedLayout),
              })
              .where(eq(cmsCollectionSchemaHead.collectionId, collection.id));
            await bumpDraft(transaction, collection.id, actorId, now);
            await transaction.insert(auditEvent).values(
              makeAuditValues({
                workspaceId: collection.workspaceId,
                projectId: collection.projectId,
                environmentId: collection.environmentId,
                actorId,
                action: "cms.schema.fields.replaced",
                resourceType: "cms_collection",
                resourceId: collection.id,
                requestId,
              }),
            );
            const nextCollection = await selectCollection(transaction, input);
            if (!nextCollection) throw new Error("Draft collection could not be reloaded.");
            return outcomeWith("success", {
              draft: decodeDraftSync(
                nextCollection,
                await loadActiveFieldRows(transaction, input.collectionId),
              ),
            });
          }),
        catch: (cause) => databaseFailure("schema.field.replace", cause),
      });
      if (result.kind === "not_found")
        return yield* NotFoundFailure.make({ resource: "collection" });
      if (result.kind === "forbidden") return yield* ForbiddenFailure.make();
      if (result.kind === "cms_required") return yield* CmsCapabilityRequiredFailure.make();
      if (result.kind === "invalid_state") return yield* InvalidStateTransitionFailure.make();
      if (result.kind === "version_conflict") return yield* VersionConflictFailure.make();
      if (result.kind === "schema_invalid")
        return yield* SchemaInvalidFailure.make({ issues: result.issues });
      return result.draft;
    }),

    removeField: Effect.fn("SchemaRepository.removeField")(function* (
      actorId: AuthUserId,
      input: RemoveCollectionFieldInput,
      now: Date,
      requestId: string,
    ) {
      const result = yield* Effect.tryPromise({
        try: () =>
          database.transaction(async (transaction) => {
            await lockProjectShared(transaction, input.projectId);
            const authorization = await authorizeEnvironment(
              transaction,
              actorId,
              input.projectId,
              input.environmentId,
              "schema.write",
            );
            if (authorization.kind === "not_found") return outcome("not_found");
            if (authorization.kind === "forbidden") return outcome("forbidden");
            if (authorization.kind === "cms_required") return outcome("cms_required");
            if (authorization.access.project.archivedAt) return outcome("invalid_state");
            await lockCollection(transaction, input.collectionId);
            const collection = await selectCollection(transaction, input);
            if (!collection || collection.workspaceId !== authorization.access.project.workspaceId)
              return outcome("not_found");
            if (collection.draftVersion !== input.draftVersion) return outcome("version_conflict");
            await lockActiveFields(transaction, input.collectionId);
            const rows = await loadActiveFieldRows(transaction, input.collectionId);
            const removed = rows.find((row) => row.id === input.fieldId);
            if (!removed) return outcome("not_found");

            const removedIds = new Set<string>([removed.id]);
            let discovered = true;
            while (discovered) {
              discovered = false;
              for (const row of rows) {
                if (
                  row.parentFieldId !== null &&
                  removedIds.has(row.parentFieldId) &&
                  !removedIds.has(row.id)
                ) {
                  removedIds.add(row.id);
                  discovered = true;
                }
              }
            }
            const affected = rows
              .filter(
                (row) =>
                  row.parentFieldId === removed.parentFieldId &&
                  row.position !== null &&
                  removed.position !== null &&
                  row.position > removed.position &&
                  !removedIds.has(row.id),
              )
              .sort((left, right) => (left.position ?? 0) - (right.position ?? 0));
            const remainingNodes = rows
              .filter((row) => !removedIds.has(row.id))
              .map((row) => {
                const node = fieldValue(row);
                return affected.some((value) => value.id === row.id)
                  ? Schema.decodeUnknownSync(CollectionFieldDefinition)({
                      ...node,
                      position: node.position - 1,
                    })
                  : node;
              });
            const tree = reconstructFieldTree(remainingNodes);
            if (!tree.valid)
              return outcomeWith("schema_invalid", {
                issues: tree.issues.map((issue) => SchemaValidationIssue.make(issue)),
              });
            const currentDraft = draftStateSync(collection, rows);
            const storedLayout =
              collection.editorLayout === null
                ? null
                : removed.nodeRole === "root"
                  ? removeRootPlacement(currentDraft.editorLayout, removed.id)
                  : currentDraft.editorLayout;
            const prospective: SchemaDraftState = {
              ...currentDraft,
              fields: tree.roots,
              editorLayout:
                storedLayout === null ? syntheticEditorLayout(tree.roots) : storedLayout,
              currencyRegistryProfile: flattenFieldTree(tree.roots).some(
                (field) => field.kind === "money",
              )
                ? currentCurrencyRegistryProfile
                : null,
            };
            const validation = validateCollectionDraft(prospective, "draft");
            if (!validation.valid)
              return outcomeWith("schema_invalid", { issues: validation.issues });

            await transaction
              .update(cmsCollectionField)
              .set({
                removedAt: now,
                removedByUserId: actorId,
                position: null,
                changedByUserId: actorId,
                updatedAt: now,
              })
              .where(inArray(cmsCollectionField.id, [...removedIds]));
            for (const row of affected) {
              await transaction
                .update(cmsCollectionField)
                .set({
                  position: (row.position ?? 0) - 1,
                  changedByUserId: actorId,
                  updatedAt: now,
                })
                .where(eq(cmsCollectionField.id, row.id));
            }
            await transaction
              .update(cmsCollectionSchemaHead)
              .set({
                validationProfile: fieldSystemValidationProfile,
                currencyRegistryProfile: prospective.currencyRegistryProfile,
                editorLayout: storedLayout === null ? null : editorLayoutValue(storedLayout),
              })
              .where(eq(cmsCollectionSchemaHead.collectionId, collection.id));
            await bumpDraft(transaction, collection.id, actorId, now);
            await transaction.insert(auditEvent).values(
              makeAuditValues({
                workspaceId: collection.workspaceId,
                projectId: collection.projectId,
                environmentId: collection.environmentId,
                actorId,
                action: "cms.schema.field.removed",
                resourceType: "cms_collection_field",
                resourceId: removed.id,
                requestId,
              }),
            );
            const nextCollection = await selectCollection(transaction, input);
            if (!nextCollection) throw new Error("Draft collection could not be reloaded.");
            return outcomeWith("success", {
              draft: decodeDraftSync(
                nextCollection,
                await loadActiveFieldRows(transaction, input.collectionId),
              ),
            });
          }),
        catch: (cause) => databaseFailure("schema.field.remove", cause),
      });
      if (result.kind === "not_found") return yield* NotFoundFailure.make({ resource: "field" });
      if (result.kind === "forbidden") return yield* ForbiddenFailure.make();
      if (result.kind === "cms_required") return yield* CmsCapabilityRequiredFailure.make();
      if (result.kind === "invalid_state") return yield* InvalidStateTransitionFailure.make();
      if (result.kind === "version_conflict") return yield* VersionConflictFailure.make();
      if (result.kind === "schema_invalid")
        return yield* SchemaInvalidFailure.make({ issues: result.issues });
      return result.draft;
    }),

    reorderFields: Effect.fn("SchemaRepository.reorderFields")(function* (
      actorId: AuthUserId,
      input: ReorderCollectionFieldsInput,
      now: Date,
      requestId: string,
    ) {
      const result = yield* Effect.tryPromise({
        try: () =>
          database.transaction(async (transaction) => {
            await lockProjectShared(transaction, input.projectId);
            const authorization = await authorizeEnvironment(
              transaction,
              actorId,
              input.projectId,
              input.environmentId,
              "schema.write",
            );
            if (authorization.kind === "not_found") return outcome("not_found");
            if (authorization.kind === "forbidden") return outcome("forbidden");
            if (authorization.kind === "cms_required") return outcome("cms_required");
            if (authorization.access.project.archivedAt) return outcome("invalid_state");
            await lockCollection(transaction, input.collectionId);
            const collection = await selectCollection(transaction, input);
            if (!collection || collection.workspaceId !== authorization.access.project.workspaceId)
              return outcome("not_found");
            if (collection.draftVersion !== input.draftVersion) return outcome("version_conflict");
            await lockActiveFields(transaction, input.collectionId);
            const rows = await loadActiveFieldRows(transaction, input.collectionId);
            if (
              input.parentFieldId !== null &&
              !rows.some(
                (row) =>
                  row.id === input.parentFieldId && (row.kind === "object" || row.kind === "list"),
              )
            )
              return outcome("not_found");
            const siblings = rows
              .filter((row) => row.parentFieldId === input.parentFieldId)
              .sort(
                (left, right) =>
                  (left.position ?? 0) - (right.position ?? 0) || left.id.localeCompare(right.id),
              );
            const currentIds = siblings.map((row) => row.id);
            if (
              input.fieldIds.length !== currentIds.length ||
              input.fieldIds.some((id) => !currentIds.includes(id))
            )
              return outcome("conflict");
            if (input.fieldIds.every((id, index) => currentIds[index] === id))
              return outcomeWith("success", { draft: decodeDraftSync(collection, rows) });
            if (siblings[0]?.nodeRole === "list_item") return outcome("conflict");
            await transaction
              .update(cmsCollectionField)
              .set({ removedAt: now, removedByUserId: actorId, position: null })
              .where(inArray(cmsCollectionField.id, currentIds));
            for (const [position, fieldId] of input.fieldIds.entries()) {
              await transaction
                .update(cmsCollectionField)
                .set({
                  removedAt: null,
                  removedByUserId: null,
                  position,
                  changedByUserId: actorId,
                  updatedAt: now,
                })
                .where(eq(cmsCollectionField.id, fieldId));
            }
            await bumpDraft(transaction, collection.id, actorId, now);
            await transaction.insert(auditEvent).values(
              makeAuditValues({
                workspaceId: collection.workspaceId,
                projectId: collection.projectId,
                environmentId: collection.environmentId,
                actorId,
                action: "cms.schema.fields.reordered",
                resourceId: collection.id,
                requestId,
              }),
            );
            const nextCollection = await selectCollection(transaction, input);
            if (!nextCollection) throw new Error("Draft collection could not be reloaded.");
            return outcomeWith("success", {
              draft: decodeDraftSync(
                nextCollection,
                await loadActiveFieldRows(transaction, input.collectionId),
              ),
            });
          }),
        catch: (cause) => databaseFailure("schema.field.reorder", cause),
      });
      if (result.kind === "not_found")
        return yield* NotFoundFailure.make({ resource: "collection" });
      if (result.kind === "forbidden") return yield* ForbiddenFailure.make();
      if (result.kind === "cms_required") return yield* CmsCapabilityRequiredFailure.make();
      if (result.kind === "invalid_state") return yield* InvalidStateTransitionFailure.make();
      if (result.kind === "version_conflict") return yield* VersionConflictFailure.make();
      if (result.kind === "conflict") return yield* ConflictFailure.make();
      return result.draft;
    }),

    updateEditorLayout: Effect.fn("SchemaRepository.updateEditorLayout")(function* (
      actorId: AuthUserId,
      input: UpdateEditorLayoutInput,
      now: Date,
      requestId: string,
    ) {
      const result = yield* Effect.tryPromise({
        try: () =>
          database.transaction(async (transaction) => {
            await lockProjectShared(transaction, input.projectId);
            const authorization = await authorizeEnvironment(
              transaction,
              actorId,
              input.projectId,
              input.environmentId,
              "schema.write",
            );
            if (authorization.kind === "not_found") return outcome("not_found");
            if (authorization.kind === "forbidden") return outcome("forbidden");
            if (authorization.kind === "cms_required") return outcome("cms_required");
            if (authorization.access.project.archivedAt) return outcome("invalid_state");
            await lockCollection(transaction, input.collectionId);
            const collection = await selectCollection(transaction, input);
            if (!collection || collection.workspaceId !== authorization.access.project.workspaceId)
              return outcome("not_found");
            if (collection.draftVersion !== input.draftVersion) return outcome("version_conflict");
            await lockActiveFields(transaction, input.collectionId);
            const rows = await loadActiveFieldRows(transaction, input.collectionId);
            const currentDraft = draftStateSync(collection, rows);
            const prospective: SchemaDraftState = {
              ...currentDraft,
              editorLayout: input.editorLayout,
            };
            const validation = validateCollectionDraft(prospective, "draft");
            if (!validation.valid)
              return outcomeWith("schema_invalid", { issues: validation.issues });
            if (JSON.stringify(currentDraft.editorLayout) === JSON.stringify(input.editorLayout))
              return outcomeWith("success", { draft: decodeDraftSync(collection, rows) });
            await transaction
              .update(cmsCollectionSchemaHead)
              .set({ editorLayout: editorLayoutValue(input.editorLayout) })
              .where(eq(cmsCollectionSchemaHead.collectionId, collection.id));
            await bumpDraft(transaction, collection.id, actorId, now);
            await transaction.insert(auditEvent).values(
              makeAuditValues({
                workspaceId: collection.workspaceId,
                projectId: collection.projectId,
                environmentId: collection.environmentId,
                actorId,
                action: "cms.editor_layout.updated",
                resourceId: collection.id,
                requestId,
              }),
            );
            const nextCollection = await selectCollection(transaction, input);
            if (!nextCollection) throw new Error("Draft collection could not be reloaded.");
            return outcomeWith("success", {
              draft: decodeDraftSync(nextCollection, rows),
            });
          }),
        catch: (cause) => databaseFailure("schema.layout.update", cause),
      });
      if (result.kind === "not_found")
        return yield* NotFoundFailure.make({ resource: "collection" });
      if (result.kind === "forbidden") return yield* ForbiddenFailure.make();
      if (result.kind === "cms_required") return yield* CmsCapabilityRequiredFailure.make();
      if (result.kind === "invalid_state") return yield* InvalidStateTransitionFailure.make();
      if (result.kind === "version_conflict") return yield* VersionConflictFailure.make();
      if (result.kind === "schema_invalid")
        return yield* SchemaInvalidFailure.make({ issues: result.issues });
      return result.draft;
    }),

    getPublishedRevision: Effect.fn("SchemaRepository.getPublishedRevision")(function* (
      actorId: AuthUserId,
      input: GetPublishedSchemaRevisionInput,
    ) {
      const result = yield* Effect.tryPromise({
        try: async () => {
          const authorization = await authorizeEnvironment(
            database,
            actorId,
            input.projectId,
            input.environmentId,
            "schema.read",
          );
          if (authorization.kind === "not_found") return outcome("not_found");
          if (authorization.kind === "forbidden") return outcome("forbidden");
          if (authorization.kind === "cms_required") return outcome("cms_required");
          const collection = await selectCollection(database, input);
          if (!collection || collection.workspaceId !== authorization.access.project.workspaceId)
            return outcome("not_found");
          const rows = await loadPublishedRevisionRows(database, input);
          if (!rows || rows.revision.workspaceId !== collection.workspaceId)
            return outcome("not_found");
          return outcomeWith("success", { revision: decodePublishedSync(rows) });
        },
        catch: (cause) => databaseFailure("schema.published.get_revision", cause),
      });
      if (result.kind === "not_found")
        return yield* NotFoundFailure.make({ resource: "schema_revision" });
      if (result.kind === "forbidden") return yield* ForbiddenFailure.make();
      if (result.kind === "cms_required") return yield* CmsCapabilityRequiredFailure.make();
      return result.revision;
    }),

    getLatestPublished: Effect.fn("SchemaRepository.getLatestPublished")(function* (
      actorId: AuthUserId,
      input: GetLatestPublishedSchemaInput,
    ) {
      const result = yield* Effect.tryPromise({
        try: async () => {
          const authorization = await authorizeEnvironment(
            database,
            actorId,
            input.projectId,
            input.environmentId,
            "schema.read",
          );
          if (authorization.kind === "not_found") return outcome("not_found");
          if (authorization.kind === "forbidden") return outcome("forbidden");
          if (authorization.kind === "cms_required") return outcome("cms_required");
          const collection = await selectCollection(database, input);
          if (
            !collection ||
            collection.workspaceId !== authorization.access.project.workspaceId ||
            collection.currentPublishedRevisionId === null
          )
            return outcome("not_found");
          const rows = await loadPublishedRevisionRows(database, {
            ...input,
            revisionId: collection.currentPublishedRevisionId,
          });
          if (!rows) return outcome("not_found");
          return outcomeWith("success", { revision: decodePublishedSync(rows) });
        },
        catch: (cause) => databaseFailure("schema.published.get_latest", cause),
      });
      if (result.kind === "not_found")
        return yield* NotFoundFailure.make({ resource: "schema_revision" });
      if (result.kind === "forbidden") return yield* ForbiddenFailure.make();
      if (result.kind === "cms_required") return yield* CmsCapabilityRequiredFailure.make();
      return result.revision;
    }),

    getDraftForm: Effect.fn("SchemaRepository.getDraftForm")(function* (
      actorId: AuthUserId,
      input: GetDraftGeneratedFormInput,
    ) {
      const result = yield* Effect.tryPromise({
        try: async () => {
          const authorization = await authorizeEnvironment(
            database,
            actorId,
            input.projectId,
            input.environmentId,
            "schema.write",
          );
          if (authorization.kind === "not_found") return outcome("not_found");
          if (authorization.kind === "forbidden") return outcome("forbidden");
          if (authorization.kind === "cms_required") return outcome("cms_required");
          const collection = await selectCollection(database, input);
          if (!collection || collection.workspaceId !== authorization.access.project.workspaceId)
            return outcome("not_found");
          const draft = decodeDraftSync(
            collection,
            await loadActiveFieldRows(database, input.collectionId),
          );
          return outcomeWith("success", {
            form: generatedFormDefinition({
              source: "draft",
              collectionId: collection.id,
              revisionId: null,
              formatVersion: draft.formatVersion,
              validationProfile: draft.validationProfile,
              currencyRegistryProfile: draft.currencyRegistryProfile,
              contractHash: draft.contractHash,
              role: Schema.decodeUnknownSync(ProjectRole)(authorization.access.role),
              fields: draft.fields,
              editorLayout: draft.editorLayout,
            }),
          });
        },
        catch: (cause) => databaseFailure("schema.form.get_draft", cause),
      });
      if (result.kind === "not_found")
        return yield* NotFoundFailure.make({ resource: "collection" });
      if (result.kind === "forbidden") return yield* ForbiddenFailure.make();
      if (result.kind === "cms_required") return yield* CmsCapabilityRequiredFailure.make();
      return result.form;
    }),

    getPublishedForm: Effect.fn("SchemaRepository.getPublishedForm")(function* (
      actorId: AuthUserId,
      input: GetPublishedGeneratedFormInput,
    ) {
      const result = yield* Effect.tryPromise({
        try: async () => {
          const authorization = await authorizeEnvironment(
            database,
            actorId,
            input.projectId,
            input.environmentId,
            "schema.read",
          );
          if (authorization.kind === "not_found") return outcome("not_found");
          if (authorization.kind === "forbidden") return outcome("forbidden");
          if (authorization.kind === "cms_required") return outcome("cms_required");
          const collection = await selectCollection(database, input);
          if (!collection || collection.workspaceId !== authorization.access.project.workspaceId)
            return outcome("not_found");
          const revisionId = input.revisionId ?? collection.currentPublishedRevisionId;
          if (revisionId === null) return outcome("not_found");
          const rows = await loadPublishedRevisionRows(database, { ...input, revisionId });
          if (!rows || rows.revision.workspaceId !== collection.workspaceId)
            return outcome("not_found");
          const revision = decodePublishedSync(rows);
          return outcomeWith("success", {
            form: generatedFormDefinition({
              source: "published",
              collectionId: collection.id,
              revisionId: revision.id,
              formatVersion: revision.formatVersion,
              validationProfile: revision.validationProfile,
              currencyRegistryProfile: revision.currencyRegistryProfile,
              contractHash: revision.contractHash,
              role: Schema.decodeUnknownSync(ProjectRole)(authorization.access.role),
              fields: revision.fields,
              editorLayout: revision.editorLayout,
            }),
          });
        },
        catch: (cause) => databaseFailure("schema.form.get_published", cause),
      });
      if (result.kind === "not_found")
        return yield* NotFoundFailure.make({ resource: "schema_revision" });
      if (result.kind === "forbidden") return yield* ForbiddenFailure.make();
      if (result.kind === "cms_required") return yield* CmsCapabilityRequiredFailure.make();
      return result.form;
    }),

    validateSchema: Effect.fn("SchemaRepository.validateSchema")(function* (
      actorId: AuthUserId,
      input: ValidateCollectionSchemaInput,
    ) {
      const result = yield* Effect.tryPromise({
        try: async () => {
          const authorization = await authorizeEnvironment(
            database,
            actorId,
            input.projectId,
            input.environmentId,
            "schema.write",
          );
          if (authorization.kind === "not_found") return outcome("not_found");
          if (authorization.kind === "forbidden") return outcome("forbidden");
          if (authorization.kind === "cms_required") return outcome("cms_required");
          const collection = await selectCollection(database, input);
          if (!collection || collection.workspaceId !== authorization.access.project.workspaceId)
            return outcome("not_found");
          const draft = decodeDraftSync(
            collection,
            await loadActiveFieldRows(database, input.collectionId),
          );
          const publishedRows =
            collection.currentPublishedRevisionId === null
              ? null
              : await loadPublishedRevisionRows(database, {
                  ...input,
                  revisionId: collection.currentPublishedRevisionId,
                });
          return outcomeWith("success", {
            draft,
            published: publishedRows === null ? null : decodePublishedSync(publishedRows),
          });
        },
        catch: (cause) => databaseFailure("schema.validate", cause),
      });
      if (result.kind === "not_found")
        return yield* NotFoundFailure.make({ resource: "collection" });
      if (result.kind === "forbidden") return yield* ForbiddenFailure.make();
      if (result.kind === "cms_required") return yield* CmsCapabilityRequiredFailure.make();
      const validation = validateCollectionDraft(result.draft, "publication");
      return CollectionSchemaValidation.make({
        valid: validation.valid,
        issues: validation.issues,
        schemaHash: validation.valid ? hashCollectionDraft(result.draft) : null,
        contractHash: validation.valid ? hashCollectionContract(result.draft) : null,
        changes: classifyCollectionSchemaChanges(result.published, result.draft),
      });
    }),

    publishSchema: Effect.fn("SchemaRepository.publishSchema")(function* (
      actorId: AuthUserId,
      input: PublishCollectionSchemaInput,
      now: Date,
      requestId: string,
    ) {
      const result = yield* Effect.tryPromise({
        try: () =>
          database.transaction(async (transaction) => {
            await lockProjectShared(transaction, input.projectId);
            const authorization = await authorizeEnvironment(
              transaction,
              actorId,
              input.projectId,
              input.environmentId,
              "schema.publish",
            );
            if (authorization.kind === "not_found") return outcome("not_found");
            if (authorization.kind === "forbidden") return outcome("forbidden");
            if (authorization.kind === "cms_required") return outcome("cms_required");
            if (authorization.access.project.archivedAt) return outcome("invalid_state");
            await lockCollection(transaction, input.collectionId);
            const collection = await selectCollection(transaction, input);
            if (!collection || collection.workspaceId !== authorization.access.project.workspaceId)
              return outcome("not_found");

            const [existing] = await transaction
              .select()
              .from(cmsSchemaRevision)
              .where(
                and(
                  eq(cmsSchemaRevision.collectionId, input.collectionId),
                  eq(cmsSchemaRevision.commandId, input.commandId),
                ),
              )
              .limit(1);
            if (existing) {
              const expected = fingerprintSchemaPublication(
                input,
                Schema.decodeUnknownSync(SchemaHash)(existing.schemaHash),
              );
              if (existing.commandFingerprint !== expected) return outcome("conflict");
              const rows = await loadPublishedRevisionRows(transaction, {
                ...input,
                revisionId: existing.id,
              });
              if (!rows) throw new Error("Published command revision could not be loaded.");
              return outcomeWith("success", { revision: decodePublishedSync(rows) });
            }
            if (
              collection.draftVersion !== input.draftVersion ||
              collection.currentPublishedRevisionId !== input.expectedPublishedRevisionId
            )
              return outcome("version_conflict");
            await lockActiveFields(transaction, input.collectionId);
            const draft = decodeDraftSync(
              collection,
              await loadActiveFieldRows(transaction, input.collectionId),
            );
            const validation = validateCollectionDraft(draft, "publication");
            if (!validation.valid)
              return outcomeWith("schema_invalid", { issues: validation.issues });
            const flattenedFields = flattenFieldTree(draft.fields);
            const configuredDeliveryFields =
              collection.currentPublishedRevisionId === null
                ? []
                : await transaction
                    .select({
                      fieldId: cmsCollectionDeliveryField.fieldId,
                      kind: cmsSchemaRevisionField.kind,
                    })
                    .from(cmsCollectionDeliveryField)
                    .innerJoin(
                      cmsSchemaRevisionField,
                      and(
                        eq(
                          cmsSchemaRevisionField.revisionId,
                          collection.currentPublishedRevisionId,
                        ),
                        eq(cmsSchemaRevisionField.fieldId, cmsCollectionDeliveryField.fieldId),
                        eq(cmsSchemaRevisionField.collectionId, collection.id),
                      ),
                    )
                    .where(eq(cmsCollectionDeliveryField.collectionId, collection.id));
            const nextFieldsById = new Map<string, (typeof flattenedFields)[number]>(
              flattenedFields.map((field) => [field.id, field]),
            );
            const deliveryIssues = configuredDeliveryFields.flatMap((configured) => {
              const next = nextFieldsById.get(configured.fieldId);
              return next === undefined || next.nodeRole !== "root" || next.kind !== configured.kind
                ? [
                    SchemaValidationIssue.make({
                      path: "fields",
                      code: "delivery_configured_field_incompatible",
                      message:
                        "Remove the Delivery capability before removing or changing its field kind.",
                    }),
                  ]
                : [];
            });
            if (deliveryIssues.length > 0) {
              return outcomeWith("schema_invalid", { issues: deliveryIssues.slice(0, 50) });
            }
            const schemaHash = hashCollectionDraft(draft);
            const contractHash = hashCollectionContract(draft);
            const publishedRows =
              collection.currentPublishedRevisionId === null
                ? null
                : await loadPublishedRevisionRows(transaction, {
                    ...input,
                    revisionId: collection.currentPublishedRevisionId,
                  });
            const published = publishedRows === null ? null : decodePublishedSync(publishedRows);
            if (published !== null && published.schemaHash === schemaHash)
              return outcomeWith("success", { revision: published });
            const changes = classifyCollectionSchemaChanges(published, draft);
            if (!exactAcknowledgements(changes, input.acknowledgedChangeIds))
              return outcomeWith("acknowledgement_required", {
                changes: requiredAcknowledgementChanges(changes),
              });
            const sequence = collection.currentPublishedSequence + 1;
            const [revisionRow] = await transaction
              .insert(cmsSchemaRevision)
              .values({
                workspaceId: collection.workspaceId,
                projectId: collection.projectId,
                environmentId: collection.environmentId,
                collectionId: collection.id,
                sequence,
                previousRevisionId: collection.currentPublishedRevisionId,
                collectionApiKey: collection.apiKey,
                collectionDisplayName: collection.displayName,
                collectionDescription: collection.description,
                formatVersion: 2,
                validationProfile: draft.validationProfile,
                currencyRegistryProfile: draft.currencyRegistryProfile,
                editorLayout: editorLayoutValue(draft.editorLayout),
                schemaHash,
                commandId: input.commandId,
                commandFingerprint: fingerprintSchemaPublication(input, schemaHash),
                nonBreakingChangeCount: changes.nonBreakingCount,
                potentiallyBreakingChangeCount: changes.potentiallyBreakingCount,
                breakingChangeCount: changes.breakingCount,
                publishedByUserId: actorId,
                publishedAt: now,
              })
              .returning();
            if (!revisionRow) throw new Error("Schema revision insert returned no row.");
            failPublicationAfter("revision");
            if (flattenedFields.length > 0) {
              await transaction.insert(cmsSchemaRevisionField).values(
                flattenedFields.map((field) => ({
                  revisionId: revisionRow.id,
                  fieldId: field.id,
                  workspaceId: collection.workspaceId,
                  projectId: collection.projectId,
                  environmentId: collection.environmentId,
                  collectionId: collection.id,
                  parentFieldId: field.parentFieldId,
                  nodeRole: field.nodeRole,
                  referenceCollectionId:
                    field.kind === "reference" ? field.configuration.targetCollectionId : null,
                  apiKey: field.apiKey,
                  displayLabel: field.displayLabel,
                  kind: field.kind,
                  required: field.required,
                  localization: field.localization,
                  deprecated: field.deprecated,
                  position: field.position,
                  editorMetadata: editorMetadataValue(field.editor),
                  configuration: field.configuration,
                })),
              );
            }
            failPublicationAfter("snapshots");
            await transaction
              .update(cmsCollectionSchemaHead)
              .set({
                draftBaseRevisionId: revisionRow.id,
                currentPublishedRevisionId: revisionRow.id,
                currentPublishedSequence: sequence,
                changedByUserId: actorId,
                updatedAt: now,
              })
              .where(eq(cmsCollectionSchemaHead.collectionId, collection.id));
            failPublicationAfter("head");
            await transaction.insert(auditEvent).values(
              makeAuditValues({
                workspaceId: collection.workspaceId,
                projectId: collection.projectId,
                environmentId: collection.environmentId,
                actorId,
                action: "cms.schema.published",
                resourceId: collection.id,
                requestId,
              }),
            );
            failPublicationAfter("audit");
            const mappings = await transaction
              .select({
                eventTypes: cmsInvalidationRouteMapping.eventTypes,
                entryId: cmsInvalidationRouteMapping.entryId,
                localeId: cmsInvalidationRouteMapping.localeId,
                routePath: cmsInvalidationRouteMapping.routePath,
                semanticTags: cmsInvalidationRouteMapping.semanticTags,
              })
              .from(cmsInvalidationRouteMapping)
              .where(
                and(
                  eq(cmsInvalidationRouteMapping.workspaceId, collection.workspaceId),
                  eq(cmsInvalidationRouteMapping.projectId, collection.projectId),
                  eq(cmsInvalidationRouteMapping.environmentId, collection.environmentId),
                  eq(cmsInvalidationRouteMapping.collectionId, collection.id),
                  eq(cmsInvalidationRouteMapping.state, "enabled"),
                  sql`'cms.schema.published' = any(${cmsInvalidationRouteMapping.eventTypes})`,
                  isNull(cmsInvalidationRouteMapping.entryId),
                  isNull(cmsInvalidationRouteMapping.localeId),
                ),
              )
              .orderBy(cmsInvalidationRouteMapping.id);
            failPublicationAfter("invalidation_mapping_load");
            const invalidationSnapshot = matchInvalidationMappings(mappings, {
              eventType: "cms.schema.published",
              entryId: null,
              localeId: null,
            });
            const changedFieldIds = [
              ...new Set(
                changes.items.flatMap((change) =>
                  change.fieldId === null ? [] : [change.fieldId],
                ),
              ),
            ].sort();
            failPublicationAfter("invalidation_projection");
            const eventPayload = {
              version: 1,
              projectId: collection.projectId,
              environmentId: collection.environmentId,
              collectionId: collection.id,
              schemaRevisionId: revisionRow.id,
              sequence,
              schemaHash,
              contractHash,
              changedFieldIds,
              invalidationTags: [
                `project:${collection.projectId}`,
                `environment:${collection.environmentId}`,
                `collection:${collection.id}`,
                ...changedFieldIds.map((fieldId) => `field:${fieldId}`),
              ],
              semanticTags: invalidationSnapshot.semanticTags,
              routes: invalidationSnapshot.routes,
            };
            if (Buffer.byteLength(canonicalizeEntryValue(eventPayload), "utf8") > 131_072) {
              throw new Error("Schema publication event payload exceeded the fixed M11 limit.");
            }
            failPublicationAfter("event_size_validation");
            failPublicationAfter("pre_outbox");
            await transaction.insert(outboxEvent).values({
              workspaceId: collection.workspaceId,
              projectId: collection.projectId,
              environmentId: collection.environmentId,
              eventType: "cms.schema.published",
              subjectType: "cms.collection",
              subjectId: collection.id,
              schemaRevisionId: revisionRow.id,
              aggregateSequence: sequence,
              payload: eventPayload,
              occurredAt: now,
              availableAt: now,
            });
            failPublicationAfter("outbox");
            const rows = await loadPublishedRevisionRows(transaction, {
              ...input,
              revisionId: revisionRow.id,
            });
            if (!rows) throw new Error("Published revision could not be loaded.");
            return outcomeWith("success", { revision: decodePublishedSync(rows) });
          }),
        catch: (cause) => databaseFailure("schema.publish", cause),
      });
      if (result.kind === "not_found")
        return yield* NotFoundFailure.make({ resource: "collection" });
      if (result.kind === "forbidden") return yield* ForbiddenFailure.make();
      if (result.kind === "cms_required") return yield* CmsCapabilityRequiredFailure.make();
      if (result.kind === "invalid_state") return yield* InvalidStateTransitionFailure.make();
      if (result.kind === "version_conflict") return yield* VersionConflictFailure.make();
      if (result.kind === "conflict") return yield* ConflictFailure.make();
      if (result.kind === "schema_invalid")
        return yield* SchemaInvalidFailure.make({ issues: result.issues });
      if (result.kind === "acknowledgement_required")
        return yield* SchemaChangeAcknowledgementRequiredFailure.make({
          requiredChanges: result.changes,
        });
      return result.revision;
    }),
  };
}

export class SchemaRepository extends Context.Tag("SchemaRepository")<
  SchemaRepository,
  ReturnType<typeof makeSchemaRepository>
>() {}

export const SchemaRepositoryLive = Layer.succeed(SchemaRepository, makeSchemaRepository());
