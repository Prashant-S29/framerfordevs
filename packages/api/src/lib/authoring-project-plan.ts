// Builds one deterministic read-only complete-project plan without reserving stable IDs.

import { createHash } from "node:crypto";

import type { CollectionSchema } from "@framerfordevs/schema";
import { Schema } from "effect";

import { type AuthoringSchemaAuthority, CollectionSourceKey } from "../contracts/authoring";
import {
  AuthoringSchemaCandidate,
  AuthoringSchemaPlan,
  AuthoringSchemaValidationIssue,
} from "../contracts/authoring-schema";
import { EditorLayoutNodeId, EnumOptionId } from "../contracts/field-system";
import {
  EnvironmentId,
  IsoDateTime,
  ProjectId,
  ResourceVersion,
  WorkspaceId,
} from "../contracts/platform";
import {
  CmsCollection,
  CollectionApiKey,
  CollectionDisplayName,
  CollectionFieldId,
  CollectionId,
  type PublishedSchemaRevision,
} from "../contracts/schemas";
import { qualifyProjectSchemaChanges } from "./authoring-apply-authority";
import { computeSchemaPlanHash, validateCompleteProjectSchema } from "./authoring-schema-document";
import { buildResolvedSchemaCandidate } from "./resolved-schema-candidate";
import {
  type PersistedProjectSourceIdentities,
  reconcileProjectSourceIdentities,
} from "./source-reconciliation";
import type { StructureIdentityMap } from "./structure-hash";

export interface CurrentCollectionPlanState {
  readonly sourceKey: string;
  readonly collection: CmsCollection;
  readonly published: PublishedSchemaRevision | null;
}

export interface AuthoringProjectPlanContext {
  readonly workspaceId: WorkspaceId;
  readonly projectId: ProjectId;
  readonly environmentId: EnvironmentId;
  readonly current: AuthoringSchemaAuthority;
  readonly activeCollectionSourceKeys: ReadonlyArray<CollectionSourceKey>;
  readonly persistedIdentities: PersistedProjectSourceIdentities;
  readonly collections: ReadonlyArray<CurrentCollectionPlanState>;
}

function uuidFromAuthority(...parts: ReadonlyArray<string>): string {
  const bytes = Buffer.from(
    createHash("sha256").update(JSON.stringify(parts), "utf8").digest("hex").slice(0, 32),
    "hex",
  );
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x50;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function displayName(apiKey: string): string {
  return apiKey
    .split("_")
    .map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`)
    .join(" ");
}

function invalidPlan(
  current: AuthoringSchemaAuthority,
  issues: ReadonlyArray<{ readonly path: string; readonly code: string }>,
): AuthoringSchemaPlan {
  return Schema.decodeUnknownSync(AuthoringSchemaPlan)({
    valid: false,
    current,
    planHash: null,
    issues: issues.slice(0, 50).map((issue) =>
      AuthoringSchemaValidationIssue.make({
        path: issue.path.slice(0, 256),
        code: /^[a-z][a-z0-9_]{0,63}$/u.test(issue.code) ? issue.code : "schema_invalid",
        message: "The complete code schema is invalid.",
      }),
    ),
    changes: [],
    candidates: [],
  });
}

function provisionalCollection(
  schema: CollectionSchema,
  context: AuthoringProjectPlanContext,
  collectionId: CollectionId,
): CmsCollection {
  const timestamp = IsoDateTime.make("1970-01-01T00:00:00.000Z");
  return CmsCollection.make({
    id: collectionId,
    workspaceId: context.workspaceId,
    projectId: context.projectId,
    environmentId: context.environmentId,
    apiKey: CollectionApiKey.make(schema.apiKey),
    displayName: CollectionDisplayName.make(displayName(schema.apiKey)),
    description: null,
    version: ResourceVersion.make(1),
    draftVersion: ResourceVersion.make(1),
    draftBaseRevisionId: null,
    currentPublishedRevisionId: null,
    currentPublishedSequence: 0,
    createdAt: timestamp,
    updatedAt: timestamp,
  });
}

/**
 * Uses deterministic ephemeral UUIDs only inside read-only validation/classification. They are not
 * returned as mappings, reserved, persisted, or accepted by apply; apply allocates real server IDs.
 */
export function buildAuthoringProjectPlan(
  value: unknown,
  context: AuthoringProjectPlanContext,
): AuthoringSchemaPlan {
  const document = validateCompleteProjectSchema(value, context.activeCollectionSourceKeys);
  if (!document.valid) return invalidPlan(context.current, document.issues);

  const reconciliation = reconcileProjectSourceIdentities(
    document.project,
    context.persistedIdentities,
  );
  if (!reconciliation.valid) return invalidPlan(context.current, reconciliation.issues);

  const planHash = computeSchemaPlanHash(
    document.canonicalJson,
    context.current.projectManifestHash,
  );
  const collectionStates = new Map(context.collections.map((item) => [item.sourceKey, item]));
  const resolvedCollections = reconciliation.collections.map((identity) => ({
    sourceKey: identity.sourceKey,
    collectionId:
      identity.collectionId ??
      CollectionId.make(uuidFromAuthority(planHash, "collection", identity.sourceKey)),
  }));
  const resolvedFields = reconciliation.fields.map((identity) => ({
    collectionSourceKey: identity.collectionSourceKey,
    sourceKey: identity.sourceKey,
    fieldId:
      identity.fieldId ??
      CollectionFieldId.make(
        uuidFromAuthority(planHash, "field", identity.collectionSourceKey, identity.sourceKey),
      ),
  }));
  const resolvedOptions = reconciliation.enumOptions.map((identity) => ({
    collectionSourceKey: identity.collectionSourceKey,
    fieldSourceKey: identity.fieldSourceKey,
    sourceKey: identity.sourceKey,
    optionId:
      identity.optionId ??
      EnumOptionId.make(
        uuidFromAuthority(
          planHash,
          "enum-option",
          identity.collectionSourceKey,
          identity.fieldSourceKey,
          identity.sourceKey,
        ),
      ),
  }));
  const identities: StructureIdentityMap = {
    collections: resolvedCollections,
    fields: resolvedFields,
    enumOptions: resolvedOptions,
  };

  const issues: Array<{ readonly path: string; readonly code: string }> = [];
  const candidates: Array<typeof AuthoringSchemaCandidate.Type> = [];
  const changes: Array<AuthoringSchemaPlan["changes"][number]> = [];
  for (const schema of document.project.collections) {
    const reconciledCollection = reconciliation.collections.find(
      (identity) => identity.sourceKey === schema.sourceKey,
    );
    const resolvedCollection = resolvedCollections.find(
      (identity) => identity.sourceKey === schema.sourceKey,
    );
    if (!reconciledCollection || !resolvedCollection) {
      issues.push({ path: `$.collections.${schema.sourceKey}`, code: "source_identity_missing" });
      continue;
    }
    const state = collectionStates.get(schema.sourceKey);
    if (reconciledCollection.status === "existing" && !state) {
      issues.push({ path: `$.collections.${schema.sourceKey}`, code: "source_identity_missing" });
      continue;
    }
    const collection =
      state?.collection ?? provisionalCollection(schema, context, resolvedCollection.collectionId);
    const currentPublished = state?.published ?? null;
    const collectionFields = resolvedFields.filter(
      (identity) => identity.collectionSourceKey === schema.sourceKey,
    );
    const placementIds = new Map(
      collectionFields.map((identity) => [
        identity.fieldId,
        EditorLayoutNodeId.make(
          uuidFromAuthority(planHash, "placement", schema.sourceKey, identity.sourceKey),
        ),
      ]),
    );
    const candidate = buildResolvedSchemaCandidate({
      schema,
      collection,
      identities,
      currentPublished,
      layoutAllocations: {
        tabId: EditorLayoutNodeId.make(uuidFromAuthority(planHash, "tab", schema.sourceKey)),
        groupId: EditorLayoutNodeId.make(uuidFromAuthority(planHash, "group", schema.sourceKey)),
        placementIds,
      },
    });
    if (!candidate.valid) {
      issues.push(...candidate.issues.map(({ path, code }) => ({ path, code })));
      continue;
    }
    const fieldSourceKeysById = new Map(
      collectionFields.map((identity) => [identity.fieldId, identity.sourceKey]),
    );
    const qualified = qualifyProjectSchemaChanges(
      schema.sourceKey,
      candidate.candidate.changes,
      fieldSourceKeysById,
    );
    if (!qualified.valid) {
      issues.push(...qualified.issues);
      continue;
    }
    changes.push(...qualified.changes);
    const containsUnallocatedIdentities =
      reconciledCollection.status === "new" ||
      reconciliation.fields.some(
        (identity) =>
          identity.collectionSourceKey === schema.sourceKey && identity.status === "new",
      ) ||
      reconciliation.enumOptions.some(
        (identity) =>
          identity.collectionSourceKey === schema.sourceKey && identity.status === "new",
      );
    candidates.push(
      Schema.decodeUnknownSync(AuthoringSchemaCandidate)({
        collectionSourceKey: schema.sourceKey,
        collectionId: reconciledCollection.collectionId,
        currentRevisionId: state?.published?.id ?? null,
        containsUnallocatedIdentities,
        candidateStructureHash: containsUnallocatedIdentities
          ? null
          : candidate.candidate.structureHash,
        candidateContractHash: containsUnallocatedIdentities
          ? null
          : candidate.candidate.contractHash,
      }),
    );
  }
  if (issues.length > 0) return invalidPlan(context.current, issues);

  return Schema.decodeUnknownSync(AuthoringSchemaPlan)({
    valid: true,
    current: context.current,
    planHash,
    issues: [],
    changes,
    candidates,
  });
}
