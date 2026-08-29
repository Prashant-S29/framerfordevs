// Reconstructs the complete code-owned project schema from published stable-ID authority.

import type { ProjectSchema } from "@framerfordevs/schema";
import { Either, Schema } from "effect";

import { AuthoringProjectSchemaDocument } from "../../../contracts/authoring/schema";
import type { PublishedSchemaRevision, CollectionFieldDefinition } from "../../../contracts/schema";
import { compareCanonicalText } from "../../field/document";
import type { PersistedProjectSourceIdentities } from "../sources";

export interface AuthoringSchemaExportCollection {
  readonly sourceKey: string;
  readonly collectionId: string;
  readonly apiKey: string;
  readonly published: Pick<PublishedSchemaRevision, "fields">;
}

export interface AuthoringSchemaExportIssue {
  readonly path: string;
  readonly code:
    | "collection_source_identity_missing"
    | "field_source_identity_missing"
    | "enum_option_source_identity_missing"
    | "reference_source_identity_missing"
    | "published_field_shape_invalid"
    | "export_document_invalid";
}

export type BuildAuthoringSchemaExportResult =
  | { readonly valid: true; readonly project: ProjectSchema }
  | { readonly valid: false; readonly issues: ReadonlyArray<AuthoringSchemaExportIssue> };

interface ExportContext {
  readonly collectionSourceKeys: Map<string, string>;
  readonly fieldSourceKeys: Map<string, string>;
  readonly enumOptionSourceKeys: Map<string, string>;
  readonly issues: Array<AuthoringSchemaExportIssue>;
}

function identityKey(...segments: ReadonlyArray<string>): string {
  return JSON.stringify(segments);
}

function configurationForExport(
  collectionSourceKey: string,
  field: CollectionFieldDefinition,
  context: ExportContext,
  path: string,
): unknown {
  if (field.kind === "reference") {
    const targetCollectionSourceKey = context.collectionSourceKeys.get(
      field.configuration.targetCollectionId,
    );
    if (targetCollectionSourceKey === undefined) {
      context.issues.push({
        path: `${path}.configuration.targetCollectionSourceKey`,
        code: "reference_source_identity_missing",
      });
      return { targetCollectionSourceKey: "missing" };
    }
    return { targetCollectionSourceKey };
  }
  if (field.kind === "enum") {
    const fieldSourceKey = context.fieldSourceKeys.get(identityKey(collectionSourceKey, field.id));
    const options = field.configuration.options.map((option) => {
      const sourceKey = context.enumOptionSourceKeys.get(
        identityKey(collectionSourceKey, fieldSourceKey ?? "missing", option.id),
      );
      if (sourceKey === undefined) {
        context.issues.push({
          path: `${path}.configuration.options.${option.id}`,
          code: "enum_option_source_identity_missing",
        });
      }
      return {
        sourceKey: sourceKey ?? "missing",
        value: option.value,
      };
    });
    options.sort((left, right) => compareCanonicalText(left.sourceKey, right.sourceKey));
    return {
      options,
      ...(field.configuration.default === undefined
        ? {}
        : { default: field.configuration.default }),
    };
  }
  return field.configuration;
}

function exportNode(
  collectionSourceKey: string,
  field: CollectionFieldDefinition,
  context: ExportContext,
  path: string,
): unknown {
  const sourceKey = context.fieldSourceKeys.get(identityKey(collectionSourceKey, field.id));
  if (sourceKey === undefined) {
    context.issues.push({ path: `${path}.sourceKey`, code: "field_source_identity_missing" });
  }
  const currentPath = `${path}.${sourceKey ?? field.id}`;
  const base = {
    sourceKey: sourceKey ?? "missing",
    kind: field.kind,
    localization: field.localization,
    ...(field.deprecated ? { deprecated: true } : {}),
    configuration: configurationForExport(collectionSourceKey, field, context, currentPath),
  };
  const children = field.children
    .map((child) => exportNode(collectionSourceKey, child, context, `${currentPath}.fields`))
    .sort((left, right) =>
      compareCanonicalText(
        String(Reflect.get(left as object, "sourceKey")),
        String(Reflect.get(right as object, "sourceKey")),
      ),
    );

  if (field.nodeRole === "list_item") {
    if (field.apiKey !== null || field.required !== null) {
      context.issues.push({ path: currentPath, code: "published_field_shape_invalid" });
    }
    if (field.kind === "object") return { ...base, fields: children };
    if (field.kind === "list") {
      if (children.length !== 1) {
        context.issues.push({ path: `${currentPath}.item`, code: "published_field_shape_invalid" });
      }
      return { ...base, item: children[0] ?? null };
    }
    if (children.length > 0) {
      context.issues.push({ path: `${currentPath}.fields`, code: "published_field_shape_invalid" });
    }
    return base;
  }

  if (field.apiKey === null || field.required === null) {
    context.issues.push({ path: currentPath, code: "published_field_shape_invalid" });
  }
  const named = {
    ...base,
    apiKey: field.apiKey ?? "missing",
    required: field.required ?? false,
  };
  if (field.kind === "object") return { ...named, fields: children };
  if (field.kind === "list") {
    if (children.length !== 1) {
      context.issues.push({ path: `${currentPath}.item`, code: "published_field_shape_invalid" });
    }
    return { ...named, item: children[0] ?? null };
  }
  if (children.length > 0) {
    context.issues.push({ path: `${currentPath}.fields`, code: "published_field_shape_invalid" });
  }
  return named;
}

/** Excludes all hosted presentation while preserving authoritative immutable source mappings. */
export function buildAuthoringSchemaExport(options: {
  readonly collections: ReadonlyArray<AuthoringSchemaExportCollection>;
  readonly persistedIdentities: PersistedProjectSourceIdentities;
}): BuildAuthoringSchemaExportResult {
  const context: ExportContext = {
    collectionSourceKeys: new Map(
      options.persistedIdentities.collections
        .filter((identity) => identity.state === "active")
        .map((identity) => [identity.collectionId, identity.sourceKey]),
    ),
    fieldSourceKeys: new Map(
      options.persistedIdentities.fields.map((identity) => [
        identityKey(identity.collectionSourceKey, identity.fieldId),
        identity.sourceKey,
      ]),
    ),
    enumOptionSourceKeys: new Map(
      options.persistedIdentities.enumOptions.map((identity) => [
        identityKey(identity.collectionSourceKey, identity.fieldSourceKey, identity.optionId),
        identity.sourceKey,
      ]),
    ),
    issues: [],
  };
  const collectionSourceKeysById = context.collectionSourceKeys;
  const collections = options.collections.map((collection) => {
    const sourceKey = collectionSourceKeysById.get(collection.collectionId);
    if (sourceKey === undefined || sourceKey !== collection.sourceKey) {
      context.issues.push({
        path: `$.collections.${collection.collectionId}.sourceKey`,
        code: "collection_source_identity_missing",
      });
    }
    const fields = collection.published.fields
      .map((field) => exportNode(collection.sourceKey, field, context, "$.collections.fields"))
      .sort((left, right) =>
        compareCanonicalText(
          String(Reflect.get(left as object, "sourceKey")),
          String(Reflect.get(right as object, "sourceKey")),
        ),
      );
    return { sourceKey: collection.sourceKey, apiKey: collection.apiKey, fields };
  });
  collections.sort((left, right) => compareCanonicalText(left.sourceKey, right.sourceKey));
  const decoded = Schema.decodeUnknownEither(AuthoringProjectSchemaDocument)({ collections });
  if (Either.isLeft(decoded)) {
    context.issues.push({ path: "$", code: "export_document_invalid" });
  }
  return context.issues.length > 0 || Either.isLeft(decoded)
    ? { valid: false, issues: context.issues.slice(0, 50) }
    : { valid: true, project: decoded.right };
}
