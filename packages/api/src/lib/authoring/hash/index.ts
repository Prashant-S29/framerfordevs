// Projects code-owned schema structure onto persisted stable identities and hashes canonical bytes.

import { createHash } from "node:crypto";

import type { CollectionSchema, FieldSchema, ListItemSchema } from "@framerfordevs/schema";

import {
  ProjectStructureManifestHash,
  type ProjectStructureManifestHash as ProjectStructureManifestHashType,
  StructureHash,
  type StructureHash as StructureHashType,
} from "../../../contracts/authoring";
import type { EnumOptionId } from "../../../contracts/field";
import type { CollectionFieldId, CollectionId, SchemaRevisionId } from "../../../contracts/schema";
import { canonicalizeSchemaDocument, compareCanonicalText } from "../../field/document";

export interface CollectionStructureIdentity {
  readonly sourceKey: string;
  readonly collectionId: CollectionId;
}

export interface FieldStructureIdentity {
  readonly collectionSourceKey: string;
  readonly sourceKey: string;
  readonly fieldId: CollectionFieldId;
}

export interface EnumOptionStructureIdentity {
  readonly collectionSourceKey: string;
  readonly fieldSourceKey: string;
  readonly sourceKey: string;
  readonly optionId: EnumOptionId;
}

export interface StructureIdentityMap {
  readonly collections: ReadonlyArray<CollectionStructureIdentity>;
  readonly fields: ReadonlyArray<FieldStructureIdentity>;
  readonly enumOptions: ReadonlyArray<EnumOptionStructureIdentity>;
}

export interface StructureHashIssue {
  readonly path: string;
  readonly code: "source_identity_duplicate" | "source_identity_missing";
}

export type ComputeStructureHashResult =
  | {
      readonly valid: true;
      readonly structureHash: StructureHashType;
      readonly canonicalJson: string;
    }
  | { readonly valid: false; readonly issues: ReadonlyArray<StructureHashIssue> };

type SchemaNode = FieldSchema | ListItemSchema;

interface ProjectionContext {
  readonly collectionIds: Map<string, CollectionId>;
  readonly fieldIds: Map<string, CollectionFieldId>;
  readonly enumOptionIds: Map<string, EnumOptionId>;
  readonly issues: Array<StructureHashIssue>;
}

function identityKey(...segments: ReadonlyArray<string>): string {
  return JSON.stringify(segments);
}

function addIdentity<Value>(
  target: Map<string, Value>,
  key: string,
  value: Value,
  path: string,
  issues: Array<StructureHashIssue>,
): void {
  if (target.has(key)) {
    issues.push({ path, code: "source_identity_duplicate" });
    return;
  }
  target.set(key, value);
}

function buildContext(identities: StructureIdentityMap): ProjectionContext {
  const context: ProjectionContext = {
    collectionIds: new Map(),
    fieldIds: new Map(),
    enumOptionIds: new Map(),
    issues: [],
  };
  for (const identity of identities.collections) {
    addIdentity(
      context.collectionIds,
      identity.sourceKey,
      identity.collectionId,
      `identities.collections.${identity.sourceKey}`,
      context.issues,
    );
  }
  for (const identity of identities.fields) {
    addIdentity(
      context.fieldIds,
      identityKey(identity.collectionSourceKey, identity.sourceKey),
      identity.fieldId,
      `identities.fields.${identity.collectionSourceKey}.${identity.sourceKey}`,
      context.issues,
    );
  }
  for (const identity of identities.enumOptions) {
    addIdentity(
      context.enumOptionIds,
      identityKey(identity.collectionSourceKey, identity.fieldSourceKey, identity.sourceKey),
      identity.optionId,
      `identities.enumOptions.${identity.collectionSourceKey}.${identity.fieldSourceKey}.${identity.sourceKey}`,
      context.issues,
    );
  }
  return context;
}

function projectConfiguration(
  node: SchemaNode,
  collectionSourceKey: string,
  collectionIds: Map<string, CollectionId>,
  enumOptionIds: Map<string, EnumOptionId>,
  issues: Array<StructureHashIssue>,
  path: string,
): unknown {
  if (node.kind === "reference") {
    const targetCollectionId = collectionIds.get(node.configuration.targetCollectionSourceKey);
    if (!targetCollectionId) {
      issues.push({
        path: `${path}.configuration.targetCollectionSourceKey`,
        code: "source_identity_missing",
      });
      return null;
    }
    return { targetCollectionId };
  }
  if (node.kind !== "enum") return node.configuration;

  const options = node.configuration.options.map((option) => {
    const optionId = enumOptionIds.get(
      identityKey(collectionSourceKey, node.sourceKey, option.sourceKey),
    );
    if (!optionId) {
      issues.push({
        path: `${path}.configuration.options.${option.sourceKey}`,
        code: "source_identity_missing",
      });
    }
    return { id: optionId ?? null, sourceKey: option.sourceKey, value: option.value };
  });
  options.sort((left, right) => compareCanonicalText(left.sourceKey, right.sourceKey));
  return {
    options,
    ...(node.configuration.default === undefined ? {} : { default: node.configuration.default }),
  };
}

function projectNode(
  node: SchemaNode,
  collectionSourceKey: string,
  parentFieldId: CollectionFieldId | null,
  nodeRole: "root" | "property" | "list_item",
  context: ProjectionContext,
  path: string,
): unknown {
  const fieldId = context.fieldIds.get(identityKey(collectionSourceKey, node.sourceKey));
  if (!fieldId) {
    context.issues.push({ path: `${path}.sourceKey`, code: "source_identity_missing" });
    return null;
  }

  const children: Array<unknown> = [];
  if (node.kind === "object") {
    for (const child of node.fields) {
      children.push(
        projectNode(child, collectionSourceKey, fieldId, "property", context, `${path}.fields`),
      );
    }
  } else if (node.kind === "list") {
    children.push(
      projectNode(node.item, collectionSourceKey, fieldId, "list_item", context, `${path}.item`),
    );
  }
  children.sort((left, right) =>
    compareCanonicalText(canonicalizeSchemaDocument(left), canonicalizeSchemaDocument(right)),
  );

  const named = "apiKey" in node;
  return {
    id: fieldId,
    sourceKey: node.sourceKey,
    parentFieldId,
    nodeRole,
    apiKey: named ? node.apiKey : null,
    kind: node.kind,
    required: named ? node.required : null,
    localization: node.localization,
    deprecated: node.deprecated ?? false,
    configuration: projectConfiguration(
      node,
      collectionSourceKey,
      context.collectionIds,
      context.enumOptionIds,
      context.issues,
      path,
    ),
    children,
  };
}

/** Computes one revision's `structureHash` after every source key resolves to a server ID. */
export function computeCollectionStructureHash(
  collection: CollectionSchema,
  identities: StructureIdentityMap,
): ComputeStructureHashResult {
  const context = buildContext(identities);
  const collectionId = context.collectionIds.get(collection.sourceKey);
  if (!collectionId) {
    context.issues.push({
      path: `$.collections.${collection.sourceKey}.sourceKey`,
      code: "source_identity_missing",
    });
  }
  const fields = collection.fields.map((field) =>
    projectNode(
      field,
      collection.sourceKey,
      null,
      "root",
      context,
      `$.collections.${collection.sourceKey}.fields.${field.sourceKey}`,
    ),
  );
  fields.sort((left, right) =>
    compareCanonicalText(canonicalizeSchemaDocument(left), canonicalizeSchemaDocument(right)),
  );
  if (context.issues.length > 0) {
    return { valid: false, issues: context.issues.slice(0, 50) };
  }
  const canonicalJson = canonicalizeSchemaDocument({
    collection: {
      id: collectionId,
      sourceKey: collection.sourceKey,
      apiKey: collection.apiKey,
      fields,
    },
    version: 1,
  });
  return {
    valid: true,
    canonicalJson,
    structureHash: StructureHash.make(
      createHash("sha256").update(canonicalJson, "utf8").digest("hex"),
    ),
  };
}

export interface ProjectStructureManifestItem {
  readonly collectionSourceKey: string;
  readonly collectionId: CollectionId;
  readonly revisionId: SchemaRevisionId;
  readonly structureHash: StructureHashType;
}

/** Hashes current per-collection revision authority into one stale-plan manifest boundary. */
export function computeProjectStructureManifestHash(
  items: ReadonlyArray<ProjectStructureManifestItem>,
): ProjectStructureManifestHashType {
  const canonicalJson = canonicalizeSchemaDocument({
    collections: [...items].sort((left, right) =>
      compareCanonicalText(left.collectionSourceKey, right.collectionSourceKey),
    ),
    version: 1,
  });
  return ProjectStructureManifestHash.make(
    createHash("sha256").update(canonicalJson, "utf8").digest("hex"),
  );
}
