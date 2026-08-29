// Translates one fully identity-resolved code collection into existing M6 field definitions.

import type { CollectionSchema, FieldSchema, ListItemSchema } from "@framerfordevs/schema";
import { Either, ParseResult, Schema } from "effect";

import {
  CollectionFieldDefinition,
  CollectionFieldDisplayLabel,
  defaultFieldEditorMetadata,
  type PublishedSchemaRevision,
} from "../contracts/schemas";
import { flattenFieldTree } from "./field-tree";
import type { StructureIdentityMap } from "./structure-hash";

export interface CodeSchemaCandidateIssue {
  readonly path: string;
  readonly code: "source_identity_missing" | "candidate_field_invalid";
  readonly message: string;
}

export type CompileCodeCollectionFieldsResult =
  | { readonly valid: true; readonly fields: ReadonlyArray<CollectionFieldDefinition> }
  | { readonly valid: false; readonly issues: ReadonlyArray<CodeSchemaCandidateIssue> };

type SchemaNode = FieldSchema | ListItemSchema;

interface CompileContext {
  readonly collectionSourceKey: string;
  readonly collectionIds: Map<string, string>;
  readonly fieldIds: Map<string, string>;
  readonly optionIds: Map<string, string>;
  readonly previousFields: Map<string, CollectionFieldDefinition>;
  readonly issues: Array<CodeSchemaCandidateIssue>;
}

function key(...segments: ReadonlyArray<string>): string {
  return JSON.stringify(segments);
}

function defaultLabel(value: string): string {
  return value
    .split("_")
    .filter((part) => part.length > 0)
    .map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`)
    .join(" ");
}

function orderedNodes(nodes: ReadonlyArray<SchemaNode>, context: CompileContext) {
  return [...nodes].sort((left, right) => {
    const leftId = context.fieldIds.get(key(context.collectionSourceKey, left.sourceKey));
    const rightId = context.fieldIds.get(key(context.collectionSourceKey, right.sourceKey));
    const leftPosition = leftId ? context.previousFields.get(leftId)?.position : undefined;
    const rightPosition = rightId ? context.previousFields.get(rightId)?.position : undefined;
    if (leftPosition !== undefined && rightPosition !== undefined)
      return leftPosition - rightPosition || left.sourceKey.localeCompare(right.sourceKey);
    if (leftPosition !== undefined) return -1;
    if (rightPosition !== undefined) return 1;
    return left.sourceKey.localeCompare(right.sourceKey);
  });
}

function compileConfiguration(
  node: SchemaNode,
  fieldId: string,
  context: CompileContext,
  path: string,
): unknown {
  if (node.kind === "reference") {
    const targetCollectionId = context.collectionIds.get(
      node.configuration.targetCollectionSourceKey,
    );
    if (!targetCollectionId) {
      context.issues.push({
        path: `${path}.configuration.targetCollectionSourceKey`,
        code: "source_identity_missing",
        message: "The reference target source identity is unresolved.",
      });
      return { targetCollectionId: "00000000-0000-0000-0000-000000000000" };
    }
    return { targetCollectionId };
  }
  if (node.kind !== "enum") return node.configuration;

  const previous = context.previousFields.get(fieldId);
  const previousOptions =
    previous?.kind === "enum"
      ? new Map(previous.configuration.options.map((option) => [option.id, option]))
      : new Map();
  const projected = node.configuration.options.map((option) => {
    const optionId = context.optionIds.get(
      key(context.collectionSourceKey, node.sourceKey, option.sourceKey),
    );
    if (!optionId) {
      context.issues.push({
        path: `${path}.configuration.options.${option.sourceKey}`,
        code: "source_identity_missing",
        message: "The enum option source identity is unresolved.",
      });
    }
    const prior = optionId ? previousOptions.get(optionId) : undefined;
    return {
      id: optionId ?? "00000000-0000-0000-0000-000000000000",
      value: option.value,
      label: prior?.label ?? defaultLabel(option.value),
      priorPosition: prior?.position,
      sourceKey: option.sourceKey,
    };
  });
  projected.sort((left, right) => {
    if (left.priorPosition !== undefined && right.priorPosition !== undefined)
      return (
        left.priorPosition - right.priorPosition || left.sourceKey.localeCompare(right.sourceKey)
      );
    if (left.priorPosition !== undefined) return -1;
    if (right.priorPosition !== undefined) return 1;
    return left.sourceKey.localeCompare(right.sourceKey);
  });
  return {
    options: projected.map(({ id, value, label }, position) => ({ id, value, label, position })),
    ...(node.configuration.default === undefined ? {} : { default: node.configuration.default }),
  };
}

function compileSiblings(
  nodes: ReadonlyArray<SchemaNode>,
  parentFieldId: string | null,
  nodeRole: "root" | "property" | "list_item",
  context: CompileContext,
  path: string,
): Array<CollectionFieldDefinition> {
  const compiled: Array<CollectionFieldDefinition> = [];
  for (const [position, node] of orderedNodes(nodes, context).entries()) {
    const nodePath = `${path}.${node.sourceKey}`;
    const fieldId = context.fieldIds.get(key(context.collectionSourceKey, node.sourceKey));
    if (!fieldId) {
      context.issues.push({
        path: `${nodePath}.sourceKey`,
        code: "source_identity_missing",
        message: "The field source identity is unresolved.",
      });
      continue;
    }
    const previous = context.previousFields.get(fieldId);
    const named = "apiKey" in node;
    const children =
      node.kind === "object"
        ? compileSiblings(node.fields, fieldId, "property", context, `${nodePath}.fields`)
        : node.kind === "list"
          ? compileSiblings([node.item], fieldId, "list_item", context, `${nodePath}.item`)
          : [];
    const candidate = {
      id: fieldId,
      parentFieldId,
      nodeRole,
      apiKey: named ? node.apiKey : null,
      displayLabel: named
        ? (previous?.displayLabel ?? CollectionFieldDisplayLabel.make(defaultLabel(node.apiKey)))
        : null,
      kind: node.kind,
      required: named ? node.required : null,
      localization: node.localization,
      deprecated: node.deprecated ?? false,
      position,
      editor: previous?.editor ?? defaultFieldEditorMetadata,
      configuration: compileConfiguration(node, fieldId, context, nodePath),
      children,
    };
    const decoded = Schema.decodeUnknownEither(CollectionFieldDefinition, {
      errors: "all",
      onExcessProperty: "error",
    })(candidate);
    if (Either.isLeft(decoded)) {
      context.issues.push({
        path: nodePath,
        code: "candidate_field_invalid",
        message: ParseResult.TreeFormatter.formatErrorSync(decoded.left).slice(0, 512),
      });
    } else {
      compiled.push(decoded.right);
    }
  }
  return compiled;
}

/**
 * Preserves current field/enum presentation while replacing only code-owned structure. All source
 * identities must already have server IDs, so this runs after allocation in apply or for fully
 * resolved read-only candidates.
 */
export function compileCodeCollectionFields(
  collection: CollectionSchema,
  identities: StructureIdentityMap,
  currentPublished: PublishedSchemaRevision | null,
): CompileCodeCollectionFieldsResult {
  const context: CompileContext = {
    collectionSourceKey: collection.sourceKey,
    collectionIds: new Map(
      identities.collections.map((identity) => [identity.sourceKey, identity.collectionId]),
    ),
    fieldIds: new Map(
      identities.fields.map((identity) => [
        key(identity.collectionSourceKey, identity.sourceKey),
        identity.fieldId,
      ]),
    ),
    optionIds: new Map(
      identities.enumOptions.map((identity) => [
        key(identity.collectionSourceKey, identity.fieldSourceKey, identity.sourceKey),
        identity.optionId,
      ]),
    ),
    previousFields: new Map(
      flattenFieldTree(currentPublished?.fields ?? []).map((field) => [field.id, field]),
    ),
    issues: [],
  };
  const fields = compileSiblings(collection.fields, null, "root", context, "$.fields");
  return context.issues.length > 0
    ? { valid: false, issues: context.issues.slice(0, 50) }
    : { valid: true, fields };
}
