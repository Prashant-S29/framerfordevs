// Merges a complete presentation-only projection into immutable published schema authority.

import { createHash } from "node:crypto";

import { Schema } from "effect";

import { projectRoleValues } from "../contracts/access";
import {
  AuthoringCollectionPresentation,
  AuthoringEnumOptionPresentation,
  AuthoringFieldPresentation,
  type AuthoringFieldPresentations,
} from "../contracts/authoring-presentation";
import type { CmsActor } from "../contracts/authoring";
import type { EditorLayout } from "../contracts/field-system";
import {
  CmsCollection,
  type CollectionFieldDefinition,
  type PublishedSchemaRevision,
  SchemaPublicationFingerprint,
  SchemaValidationIssue,
} from "../contracts/schemas";
import { canonicalizeSchemaDocument } from "./field-system-document";
import { flattenFieldTree } from "./field-tree";
import { generatedFormDefinition } from "./generated-form-definition";
import {
  hashCollectionContract,
  hashCollectionDraft,
  type SchemaDraftState,
  validateCollectionDraft,
} from "../services/schema-engine";

export function fingerprintAuthoringPresentation(options: {
  readonly actor: CmsActor;
  readonly projectId: string;
  readonly environmentId: string;
  readonly collectionKey: string;
  readonly commandId: string;
  readonly expectedRevisionId: string;
  readonly expectedSequence: number;
  readonly presentation: AuthoringCollectionPresentation;
}): SchemaPublicationFingerprint {
  return SchemaPublicationFingerprint.make(
    createHash("sha256")
      .update(
        canonicalizeSchemaDocument({
          version: 1,
          operation: "authoring.presentation.publish",
          ...options,
        }),
        "utf8",
      )
      .digest("hex"),
  );
}

export type AuthoringPresentationBuildResult =
  | {
      readonly valid: true;
      readonly draft: SchemaDraftState;
      readonly presentation: AuthoringCollectionPresentation;
      readonly schemaHash: ReturnType<typeof hashCollectionDraft>;
      readonly contractHash: ReturnType<typeof hashCollectionContract>;
      readonly noOp: boolean;
    }
  | {
      readonly valid: false;
      readonly issues: ReadonlyArray<SchemaValidationIssue>;
    };

function issue(path: string, code: string, message: string): SchemaValidationIssue {
  return SchemaValidationIssue.make({ path, code, message });
}

function structuralConfiguration(field: CollectionFieldDefinition): unknown {
  if (field.kind !== "enum") return field.configuration;
  return {
    options: field.configuration.options
      .map((option) => ({ id: option.id, value: option.value }))
      .sort((left, right) => left.id.localeCompare(right.id)),
    ...(field.configuration.default === undefined ? {} : { default: field.configuration.default }),
  };
}

function structuralField(field: CollectionFieldDefinition): unknown {
  return {
    id: field.id,
    parentFieldId: field.parentFieldId,
    nodeRole: field.nodeRole,
    apiKey: field.apiKey,
    kind: field.kind,
    required: field.required,
    localization: field.localization,
    deprecated: field.deprecated,
    configuration: structuralConfiguration(field),
    children: field.children
      .map(structuralField)
      .sort((left, right) =>
        canonicalizeSchemaDocument(left).localeCompare(canonicalizeSchemaDocument(right)),
      ),
  };
}

/** Compares every code-owned field property while intentionally excluding presentation order. */
export function hasEqualPublishedStructure(
  current: ReadonlyArray<CollectionFieldDefinition>,
  candidate: ReadonlyArray<CollectionFieldDefinition>,
): boolean {
  const project = (fields: ReadonlyArray<CollectionFieldDefinition>) =>
    fields
      .map(structuralField)
      .sort((left, right) =>
        canonicalizeSchemaDocument(left).localeCompare(canonicalizeSchemaDocument(right)),
      );
  return (
    canonicalizeSchemaDocument(project(current)) === canonicalizeSchemaDocument(project(candidate))
  );
}

function mergeFieldPresentation(
  field: CollectionFieldDefinition,
  presentations: ReadonlyMap<string, AuthoringFieldPresentation>,
  issues: Array<SchemaValidationIssue>,
): CollectionFieldDefinition {
  const presentation = presentations.get(field.id);
  if (!presentation) {
    issues.push(
      issue(
        `presentation.fields.${field.id}`,
        "presentation_field_missing",
        "Every published field must have exactly one presentation entry.",
      ),
    );
    return field;
  }
  const children = field.children.map((child) =>
    mergeFieldPresentation(child, presentations, issues),
  );
  if (field.kind === "enum") {
    const options = new Map(
      presentation.enumOptions.map((option) => [option.optionId, option] as const),
    );
    for (const option of field.configuration.options) {
      if (!options.has(option.id)) {
        issues.push(
          issue(
            `presentation.fields.${field.id}.enumOptions.${option.id}`,
            "presentation_enum_option_missing",
            "Every published enum option must have exactly one presentation entry.",
          ),
        );
      }
    }
    for (const optionId of options.keys()) {
      if (!field.configuration.options.some((option) => option.id === optionId)) {
        issues.push(
          issue(
            `presentation.fields.${field.id}.enumOptions.${optionId}`,
            "presentation_enum_option_unknown",
            "Presentation cannot introduce an enum option identity.",
          ),
        );
      }
    }
    const configuration = {
      ...field.configuration,
      options: field.configuration.options
        .map((option) => {
          const next = options.get(option.id);
          return next === undefined
            ? option
            : { ...option, label: next.label, position: next.position };
        })
        .sort((left, right) => left.position - right.position || left.id.localeCompare(right.id)),
    };
    return {
      ...field,
      displayLabel: presentation.displayLabel,
      position: presentation.position,
      editor: presentation.editor,
      configuration,
      children,
    };
  }
  if (presentation.enumOptions.length > 0) {
    issues.push(
      issue(
        `presentation.fields.${field.id}.enumOptions`,
        "presentation_enum_options_unavailable",
        "Only enum fields accept enum option presentation.",
      ),
    );
  }
  return {
    ...field,
    displayLabel: presentation.displayLabel,
    position: presentation.position,
    editor: presentation.editor,
    children,
  };
}

/** Projects one immutable revision back to the complete stable-ID presentation contract. */
export function publishedPresentation(
  revision: PublishedSchemaRevision,
): AuthoringCollectionPresentation {
  return AuthoringCollectionPresentation.make({
    displayName: revision.collectionDisplayName,
    description: revision.collectionDescription,
    fields: flattenFieldTree(revision.fields).map((field) =>
      AuthoringFieldPresentation.make({
        fieldId: field.id,
        displayLabel: field.displayLabel,
        position: field.position,
        editor: field.editor,
        enumOptions:
          field.kind === "enum"
            ? field.configuration.options.map((option) =>
                AuthoringEnumOptionPresentation.make({
                  optionId: option.id,
                  label: option.label,
                  position: option.position,
                }),
              )
            : [],
      }),
    ),
    editorLayout: revision.editorLayout,
  });
}

/** Strictly merges presentation onto current structure and proves hash-contract separation. */
export function buildAuthoringPresentationCandidate(options: {
  readonly current: PublishedSchemaRevision;
  readonly presentation: {
    readonly displayName: AuthoringCollectionPresentation["displayName"];
    readonly description: AuthoringCollectionPresentation["description"];
    readonly fields: AuthoringFieldPresentations;
    readonly editorLayout: EditorLayout;
  };
}): AuthoringPresentationBuildResult {
  if (options.current.formatVersion !== 2 || options.current.validationProfile !== "ffd-fields@1") {
    return {
      valid: false,
      issues: [
        issue(
          "presentation",
          "presentation_format_unsupported",
          "Presentation publication requires the current field-system schema format.",
        ),
      ],
    };
  }
  const issues: Array<SchemaValidationIssue> = [];
  const presentations = new Map(
    options.presentation.fields.map((field) => [field.fieldId, field] as const),
  );
  const currentIds = new Set(flattenFieldTree(options.current.fields).map((field) => field.id));
  for (const fieldId of presentations.keys()) {
    if (!currentIds.has(fieldId)) {
      issues.push(
        issue(
          `presentation.fields.${fieldId}`,
          "presentation_field_unknown",
          "Presentation cannot introduce a field identity.",
        ),
      );
    }
  }
  const fields = options.current.fields.map((field) =>
    mergeFieldPresentation(field, presentations, issues),
  );
  if (issues.length > 0) return { valid: false, issues: issues.slice(0, 50) };
  if (!hasEqualPublishedStructure(options.current.fields, fields)) {
    return {
      valid: false,
      issues: [
        issue(
          "presentation.fields",
          "presentation_structure_changed",
          "Presentation publication cannot change code-owned field structure.",
        ),
      ],
    };
  }
  const draft: SchemaDraftState = {
    formatVersion: 2,
    validationProfile: options.current.validationProfile,
    currencyRegistryProfile: options.current.currencyRegistryProfile,
    collection: Schema.decodeUnknownSync(CmsCollection)({
      id: options.current.collectionId,
      workspaceId: options.current.workspaceId,
      projectId: options.current.projectId,
      environmentId: options.current.environmentId,
      apiKey: options.current.collectionApiKey,
      displayName: options.presentation.displayName,
      description: options.presentation.description,
      version: 1,
      draftVersion: 1,
      draftBaseRevisionId: options.current.id,
      currentPublishedRevisionId: options.current.id,
      currentPublishedSequence: options.current.sequence,
      createdAt: options.current.publishedAt,
      updatedAt: options.current.publishedAt,
    }),
    fields,
    editorLayout: options.presentation.editorLayout,
  };
  const validation = validateCollectionDraft(draft, "publication");
  if (!validation.valid) return { valid: false, issues: validation.issues };
  const contractHash = hashCollectionContract(draft);
  if (contractHash !== options.current.contractHash) {
    return {
      valid: false,
      issues: [
        issue(
          "presentation",
          "presentation_contract_changed",
          "Presentation publication cannot change the content contract.",
        ),
      ],
    };
  }
  for (const role of projectRoleValues) {
    generatedFormDefinition({
      source: "published",
      collectionId: options.current.collectionId,
      revisionId: options.current.id,
      formatVersion: 2,
      validationProfile: options.current.validationProfile,
      currencyRegistryProfile: options.current.currencyRegistryProfile,
      contractHash,
      role,
      canEdit: true,
      fields,
      editorLayout: options.presentation.editorLayout,
    });
  }
  const presentation = AuthoringCollectionPresentation.make({
    ...options.presentation,
    fields: flattenFieldTree(fields).map((field) =>
      AuthoringFieldPresentation.make({
        fieldId: field.id,
        displayLabel: field.displayLabel,
        position: field.position,
        editor: field.editor,
        enumOptions:
          field.kind === "enum"
            ? field.configuration.options.map((option) =>
                AuthoringEnumOptionPresentation.make({
                  optionId: option.id,
                  label: option.label,
                  position: option.position,
                }),
              )
            : [],
      }),
    ),
  });
  const schemaHash = hashCollectionDraft(draft);
  return {
    valid: true,
    draft,
    presentation,
    schemaHash,
    contractHash,
    noOp: schemaHash === options.current.schemaHash,
  };
}
