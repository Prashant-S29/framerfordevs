// Reconciles immutable code source identities without allocating or accepting client-generated IDs.

import type { FieldSchema, ListItemSchema, ProjectSchema } from "@framerfordevs/schema";

import type { EnumOptionId } from "../../../contracts/field";
import type { CollectionFieldId, CollectionId } from "../../../contracts/schema";

export type SourceIdentityState = "active" | "retired";

export interface PersistedCollectionSourceIdentity {
  readonly sourceKey: string;
  readonly collectionId: CollectionId;
  readonly state: SourceIdentityState;
}

export interface PersistedFieldSourceIdentity {
  readonly collectionSourceKey: string;
  readonly sourceKey: string;
  readonly fieldId: CollectionFieldId;
  readonly parentFieldId: CollectionFieldId | null;
  readonly nodeRole: "root" | "property" | "list_item";
  readonly state: SourceIdentityState;
}

export interface PersistedEnumOptionSourceIdentity {
  readonly collectionSourceKey: string;
  readonly fieldSourceKey: string;
  readonly sourceKey: string;
  readonly optionId: EnumOptionId;
  readonly state: SourceIdentityState;
}

export interface PersistedProjectSourceIdentities {
  readonly collections: ReadonlyArray<PersistedCollectionSourceIdentity>;
  readonly fields: ReadonlyArray<PersistedFieldSourceIdentity>;
  readonly enumOptions: ReadonlyArray<PersistedEnumOptionSourceIdentity>;
}

export interface ReconciledCollectionSourceIdentity {
  readonly sourceKey: string;
  readonly collectionId: CollectionId | null;
  readonly status: "existing" | "new";
}

export interface ReconciledFieldSourceIdentity {
  readonly collectionSourceKey: string;
  readonly sourceKey: string;
  readonly fieldId: CollectionFieldId | null;
  readonly parentSourceKey: string | null;
  readonly nodeRole: "root" | "property" | "list_item";
  readonly status: "existing" | "new";
}

export interface ReconciledEnumOptionSourceIdentity {
  readonly collectionSourceKey: string;
  readonly fieldSourceKey: string;
  readonly sourceKey: string;
  readonly optionId: EnumOptionId | null;
  readonly status: "existing" | "new";
}

export interface SourceReconciliationIssue {
  readonly path: string;
  readonly code:
    | "source_identity_persistence_duplicate"
    | "source_identity_retired"
    | "source_identity_reparented"
    | "active_collection_omitted";
}

export type ReconcileProjectSourceIdentitiesResult =
  | {
      readonly valid: true;
      readonly collections: ReadonlyArray<ReconciledCollectionSourceIdentity>;
      readonly fields: ReadonlyArray<ReconciledFieldSourceIdentity>;
      readonly enumOptions: ReadonlyArray<ReconciledEnumOptionSourceIdentity>;
      readonly removedFieldIds: ReadonlyArray<CollectionFieldId>;
      readonly removedEnumOptionIds: ReadonlyArray<EnumOptionId>;
    }
  | { readonly valid: false; readonly issues: ReadonlyArray<SourceReconciliationIssue> };

type SchemaNode = FieldSchema | ListItemSchema;

interface SubmittedField {
  readonly collectionSourceKey: string;
  readonly sourceKey: string;
  readonly parentSourceKey: string | null;
  readonly nodeRole: "root" | "property" | "list_item";
  readonly path: string;
  readonly enumOptions: ReadonlyArray<string>;
}

function key(...segments: ReadonlyArray<string>): string {
  return JSON.stringify(segments);
}

function collectFields(
  collectionSourceKey: string,
  nodes: ReadonlyArray<SchemaNode>,
  parentSourceKey: string | null,
  nodeRole: "root" | "property" | "list_item",
  path: string,
  output: Array<SubmittedField>,
): void {
  for (const node of nodes) {
    const nodePath = `${path}.${node.sourceKey}`;
    output.push({
      collectionSourceKey,
      sourceKey: node.sourceKey,
      parentSourceKey,
      nodeRole,
      path: nodePath,
      enumOptions:
        node.kind === "enum" ? node.configuration.options.map((option) => option.sourceKey) : [],
    });
    if (node.kind === "object") {
      collectFields(
        collectionSourceKey,
        node.fields,
        node.sourceKey,
        "property",
        `${nodePath}.fields`,
        output,
      );
    } else if (node.kind === "list") {
      collectFields(
        collectionSourceKey,
        [node.item],
        node.sourceKey,
        "list_item",
        `${nodePath}.item`,
        output,
      );
    }
  }
}

function checkDuplicateStableIds<Value>(
  values: ReadonlyArray<Value>,
  idOf: (value: Value) => string,
  pathOf: (value: Value) => string,
  issues: Array<SourceReconciliationIssue>,
): void {
  const ids = new Set<string>();
  for (const value of values) {
    const id = idOf(value);
    if (ids.has(id)) {
      issues.push({ path: pathOf(value), code: "source_identity_persistence_duplicate" });
    } else {
      ids.add(id);
    }
  }
}

function indexPersisted<Value>(
  values: ReadonlyArray<Value>,
  keyOf: (value: Value) => string,
  pathOf: (value: Value) => string,
  issues: Array<SourceReconciliationIssue>,
): Map<string, Value> {
  const indexed = new Map<string, Value>();
  for (const value of values) {
    const identityKey = keyOf(value);
    if (indexed.has(identityKey)) {
      issues.push({
        path: pathOf(value),
        code: "source_identity_persistence_duplicate",
      });
    } else {
      indexed.set(identityKey, value);
    }
  }
  return indexed;
}

/**
 * Resolves persisted identities for planning. New nodes intentionally retain `null` IDs until the
 * apply transaction allocates server IDs under lock.
 */
export function reconcileProjectSourceIdentities(
  project: ProjectSchema,
  persisted: PersistedProjectSourceIdentities,
): ReconcileProjectSourceIdentitiesResult {
  const issues: Array<SourceReconciliationIssue> = [];
  const collectionIndex = indexPersisted(
    persisted.collections,
    (identity) => identity.sourceKey,
    (identity) => `identities.collections.${identity.sourceKey}`,
    issues,
  );
  const fieldIndex = indexPersisted(
    persisted.fields,
    (identity) => key(identity.collectionSourceKey, identity.sourceKey),
    (identity) => `identities.fields.${identity.collectionSourceKey}.${identity.sourceKey}`,
    issues,
  );
  const optionIndex = indexPersisted(
    persisted.enumOptions,
    (identity) => key(identity.collectionSourceKey, identity.fieldSourceKey, identity.sourceKey),
    (identity) =>
      `identities.enumOptions.${identity.collectionSourceKey}.${identity.fieldSourceKey}.${identity.sourceKey}`,
    issues,
  );
  checkDuplicateStableIds(
    persisted.collections,
    (identity) => identity.collectionId,
    (identity) => `identities.collections.${identity.sourceKey}.collectionId`,
    issues,
  );
  checkDuplicateStableIds(
    persisted.fields,
    (identity) => identity.fieldId,
    (identity) => `identities.fields.${identity.collectionSourceKey}.${identity.sourceKey}.fieldId`,
    issues,
  );
  checkDuplicateStableIds(
    persisted.enumOptions,
    (identity) => identity.optionId,
    (identity) =>
      `identities.enumOptions.${identity.collectionSourceKey}.${identity.fieldSourceKey}.${identity.sourceKey}.optionId`,
    issues,
  );

  const submittedCollectionKeys = new Set(
    project.collections.map((collection) => collection.sourceKey),
  );
  for (const identity of persisted.collections) {
    if (identity.state === "active" && !submittedCollectionKeys.has(identity.sourceKey)) {
      issues.push({
        path: `$.collections[sourceKey=${identity.sourceKey}]`,
        code: "active_collection_omitted",
      });
    }
  }

  const collections: Array<ReconciledCollectionSourceIdentity> = [];
  const submittedFields: Array<SubmittedField> = [];
  for (const collection of project.collections) {
    const existing = collectionIndex.get(collection.sourceKey);
    if (existing?.state === "retired") {
      issues.push({
        path: `$.collections.${collection.sourceKey}.sourceKey`,
        code: "source_identity_retired",
      });
    }
    collections.push({
      sourceKey: collection.sourceKey,
      collectionId: existing?.state === "active" ? existing.collectionId : null,
      status: existing?.state === "active" ? "existing" : "new",
    });
    collectFields(
      collection.sourceKey,
      collection.fields,
      null,
      "root",
      `$.collections.${collection.sourceKey}.fields`,
      submittedFields,
    );
  }

  const fields: Array<ReconciledFieldSourceIdentity> = [];
  const enumOptions: Array<ReconciledEnumOptionSourceIdentity> = [];
  const submittedFieldKeys = new Set<string>();
  const submittedOptionKeys = new Set<string>();

  for (const field of submittedFields) {
    const fieldKey = key(field.collectionSourceKey, field.sourceKey);
    submittedFieldKeys.add(fieldKey);
    const existing = fieldIndex.get(fieldKey);
    if (existing?.state === "retired") {
      issues.push({ path: `${field.path}.sourceKey`, code: "source_identity_retired" });
    }

    const intendedParent =
      field.parentSourceKey === null
        ? null
        : fieldIndex.get(key(field.collectionSourceKey, field.parentSourceKey));
    if (
      existing?.state === "active" &&
      (existing.nodeRole !== field.nodeRole ||
        existing.parentFieldId !==
          (intendedParent?.state === "active" ? intendedParent.fieldId : null))
    ) {
      issues.push({ path: `${field.path}.sourceKey`, code: "source_identity_reparented" });
    }

    fields.push({
      collectionSourceKey: field.collectionSourceKey,
      sourceKey: field.sourceKey,
      fieldId: existing?.state === "active" ? existing.fieldId : null,
      parentSourceKey: field.parentSourceKey,
      nodeRole: field.nodeRole,
      status: existing?.state === "active" ? "existing" : "new",
    });

    for (const optionSourceKey of field.enumOptions) {
      const optionKey = key(field.collectionSourceKey, field.sourceKey, optionSourceKey);
      submittedOptionKeys.add(optionKey);
      const option = optionIndex.get(optionKey);
      if (option?.state === "retired") {
        issues.push({
          path: `${field.path}.configuration.options.${optionSourceKey}.sourceKey`,
          code: "source_identity_retired",
        });
      }
      enumOptions.push({
        collectionSourceKey: field.collectionSourceKey,
        fieldSourceKey: field.sourceKey,
        sourceKey: optionSourceKey,
        optionId: option?.state === "active" ? option.optionId : null,
        status: option?.state === "active" ? "existing" : "new",
      });
    }
  }

  if (issues.length > 0) return { valid: false, issues: issues.slice(0, 50) };

  return {
    valid: true,
    collections,
    fields,
    enumOptions,
    removedFieldIds: persisted.fields
      .filter(
        (identity) =>
          identity.state === "active" &&
          submittedCollectionKeys.has(identity.collectionSourceKey) &&
          !submittedFieldKeys.has(key(identity.collectionSourceKey, identity.sourceKey)),
      )
      .map((identity) => identity.fieldId),
    removedEnumOptionIds: persisted.enumOptions
      .filter(
        (identity) =>
          identity.state === "active" &&
          submittedCollectionKeys.has(identity.collectionSourceKey) &&
          !submittedOptionKeys.has(
            key(identity.collectionSourceKey, identity.fieldSourceKey, identity.sourceKey),
          ),
      )
      .map((identity) => identity.optionId),
  };
}
