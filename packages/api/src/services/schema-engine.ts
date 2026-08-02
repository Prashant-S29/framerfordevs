import { createHash } from "node:crypto";

import { Context, Effect, Layer } from "effect";

import {
  SchemaChangeAcknowledgementRequiredFailure,
  SchemaInvalidFailure,
} from "../contracts/errors";
import {
  type AcknowledgedSchemaChangeIds,
  type CmsCollection,
  type CollectionFieldDefinition,
  type PublishedSchemaRevision,
  type PublishCollectionSchemaInput,
  SchemaChange,
  SchemaChangeId,
  SchemaChangeSet,
  type SchemaChangeClassification,
  type SchemaChangeCode,
  type SchemaChanges,
  SchemaHash,
  SchemaPublicationFingerprint,
  SchemaValidationIssue,
} from "../contracts/schemas";

export type SchemaValidationPurpose = "draft" | "publication";

export interface SchemaDraftState {
  readonly collection: CmsCollection;
  readonly fields: ReadonlyArray<CollectionFieldDefinition>;
}

export interface SchemaValidationResult {
  readonly valid: boolean;
  readonly issues: ReadonlyArray<SchemaValidationIssue>;
}

interface PendingChange {
  readonly change: SchemaChange;
  readonly position: number;
}

const classificationRank: Readonly<Record<SchemaChangeClassification, number>> = {
  breaking: 0,
  potentially_breaking: 1,
  non_breaking: 2,
};

function canonicalizeUnknown(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalizeUnknown);
  if (typeof value !== "object" || value === null) return value;

  const canonical: Record<string, unknown> = {};
  for (const key of Object.keys(value).sort()) {
    canonical[key] = canonicalizeUnknown(Reflect.get(value, key));
  }
  return canonical;
}

function canonicalStringify(value: object): string {
  return JSON.stringify(canonicalizeUnknown(value)) ?? "";
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function canonicalDraftDocument(draft: SchemaDraftState): object {
  return {
    formatVersion: 1,
    collection: {
      apiKey: draft.collection.apiKey,
      displayName: draft.collection.displayName,
      description: draft.collection.description,
    },
    fields: [...draft.fields]
      .sort((left, right) => left.position - right.position || left.id.localeCompare(right.id))
      .map((field) => ({
        id: field.id,
        apiKey: field.apiKey,
        displayLabel: field.displayLabel,
        kind: field.kind,
        required: field.required,
        localization: field.localization,
        deprecated: field.deprecated,
        position: field.position,
        configuration: canonicalizeUnknown(field.configuration),
      })),
  };
}

function issue(options: {
  readonly path: string;
  readonly code: SchemaValidationIssue["code"];
  readonly message: string;
}): SchemaValidationIssue {
  return SchemaValidationIssue.make(options);
}

export function validateCollectionDraft(
  draft: SchemaDraftState,
  purpose: SchemaValidationPurpose,
): SchemaValidationResult {
  const issues: Array<SchemaValidationIssue> = [];
  const pushIssue = (value: SchemaValidationIssue) => {
    if (issues.length < 50) issues.push(value);
  };

  if (purpose === "publication" && draft.fields.length === 0) {
    pushIssue(
      issue({
        path: "fields",
        code: "field_count_required",
        message: "A published schema must contain at least one field.",
      }),
    );
  }
  if (draft.fields.length > 100) {
    pushIssue(
      issue({
        path: "fields",
        code: "field_count_exceeded",
        message: "A collection schema can contain at most 100 active fields.",
      }),
    );
  }

  const fieldIds = new Set<string>();
  const apiKeys = new Set<string>();
  const positions = new Set<number>();

  for (const [index, field] of draft.fields.entries()) {
    if (fieldIds.has(field.id)) {
      pushIssue(
        issue({
          path: `fields.${index}.id`,
          code: "field_id_duplicate",
          message: "Active field IDs must be unique within a collection.",
        }),
      );
    }
    fieldIds.add(field.id);

    if (apiKeys.has(field.apiKey)) {
      pushIssue(
        issue({
          path: `fields.${index}.apiKey`,
          code: "field_api_key_duplicate",
          message: "Active field API keys must be unique within a collection.",
        }),
      );
    }
    apiKeys.add(field.apiKey);

    if (positions.has(field.position)) {
      pushIssue(
        issue({
          path: `fields.${index}.position`,
          code: "field_position_duplicate",
          message: "Active field positions must be unique within a collection.",
        }),
      );
    }
    positions.add(field.position);

    if (Object.keys(field.configuration).length > 0) {
      pushIssue(
        issue({
          path: `fields.${index}.configuration`,
          code: "field_configuration_unsupported",
          message: "Field configuration is not available until Milestone 6.",
        }),
      );
    }
  }

  const sortedPositions = [...positions].sort((left, right) => left - right);
  for (const [expected, actual] of sortedPositions.entries()) {
    if (actual !== expected) {
      pushIssue(
        issue({
          path: "fields",
          code: "field_position_not_dense",
          message: "Active field positions must be dense and begin at zero.",
        }),
      );
      break;
    }
  }

  return { valid: issues.length === 0, issues };
}

export function hashCollectionDraft(draft: SchemaDraftState): SchemaHash {
  return SchemaHash.make(sha256(canonicalStringify(canonicalDraftDocument(draft))));
}

export function fingerprintSchemaPublication(
  input: PublishCollectionSchemaInput,
  schemaHash: SchemaHash,
): SchemaPublicationFingerprint {
  return SchemaPublicationFingerprint.make(
    sha256(
      canonicalStringify({
        formatVersion: 1,
        projectId: input.projectId,
        environmentId: input.environmentId,
        collectionId: input.collectionId,
        draftVersion: input.draftVersion,
        expectedPublishedRevisionId: input.expectedPublishedRevisionId,
        commandId: input.commandId,
        acknowledgedChangeIds: [...input.acknowledgedChangeIds].sort(),
        schemaHash,
      }),
    ),
  );
}

function makeChange(options: {
  readonly code: SchemaChangeCode;
  readonly classification: SchemaChangeClassification;
  readonly fieldId: CollectionFieldDefinition["id"] | null;
  readonly summary: string;
  readonly position: number;
  readonly before: unknown;
  readonly after: unknown;
}): PendingChange {
  const changeId = SchemaChangeId.make(
    sha256(
      canonicalStringify({
        formatVersion: 1,
        code: options.code,
        fieldId: options.fieldId,
        before: canonicalizeUnknown(options.before),
        after: canonicalizeUnknown(options.after),
      }),
    ),
  );

  return {
    position: options.position,
    change: SchemaChange.make({
      changeId,
      code: options.code,
      classification: options.classification,
      fieldId: options.fieldId,
      summary: options.summary,
    }),
  };
}

function compareField(
  published: PublishedSchemaRevision["fields"][number],
  draft: CollectionFieldDefinition,
): ReadonlyArray<PendingChange> {
  const changes: Array<PendingChange> = [];
  const base = {
    fieldId: draft.id,
    position: draft.position,
  };

  if (published.apiKey !== draft.apiKey) {
    changes.push(
      makeChange({
        ...base,
        code: "field.api_key.updated",
        classification: "breaking",
        summary: "A published field API key changed.",
        before: published.apiKey,
        after: draft.apiKey,
      }),
    );
  }
  if (published.displayLabel !== draft.displayLabel) {
    changes.push(
      makeChange({
        ...base,
        code: "field.label.updated",
        classification: "non_breaking",
        summary: "A field display label changed.",
        before: published.displayLabel,
        after: draft.displayLabel,
      }),
    );
  }
  if (published.kind !== draft.kind) {
    changes.push(
      makeChange({
        ...base,
        code: "field.kind.updated",
        classification: "breaking",
        summary: "A published field kind changed.",
        before: published.kind,
        after: draft.kind,
      }),
    );
  }
  if (published.required !== draft.required) {
    changes.push(
      makeChange({
        ...base,
        code: draft.required ? "field.required.enabled" : "field.required.disabled",
        classification: draft.required ? "potentially_breaking" : "non_breaking",
        summary: draft.required
          ? "An optional published field became required."
          : "A required published field became optional.",
        before: published.required,
        after: draft.required,
      }),
    );
  }
  if (published.localization !== draft.localization) {
    changes.push(
      makeChange({
        ...base,
        code: "field.localization.updated",
        classification: "breaking",
        summary: "A published field localization mode changed.",
        before: published.localization,
        after: draft.localization,
      }),
    );
  }
  if (published.deprecated !== draft.deprecated) {
    changes.push(
      makeChange({
        ...base,
        code: draft.deprecated ? "field.deprecated" : "field.undeprecated",
        classification: "non_breaking",
        summary: draft.deprecated ? "A field was deprecated." : "A field is no longer deprecated.",
        before: published.deprecated,
        after: draft.deprecated,
      }),
    );
  }
  if (published.position !== draft.position) {
    changes.push(
      makeChange({
        ...base,
        code: "field.position.updated",
        classification: "non_breaking",
        summary: "A field's authoring order changed.",
        before: published.position,
        after: draft.position,
      }),
    );
  }

  return changes;
}

export function classifyCollectionSchemaChanges(
  published: PublishedSchemaRevision | null,
  draft: SchemaDraftState,
): SchemaChangeSet {
  const pending: Array<PendingChange> = [];

  if (
    published !== null &&
    (published.collectionDisplayName !== draft.collection.displayName ||
      published.collectionDescription !== draft.collection.description)
  ) {
    pending.push(
      makeChange({
        code: "collection.metadata.updated",
        classification: "non_breaking",
        fieldId: null,
        summary: "Collection authoring metadata changed.",
        position: -1,
        before: {
          displayName: published.collectionDisplayName,
          description: published.collectionDescription,
        },
        after: {
          displayName: draft.collection.displayName,
          description: draft.collection.description,
        },
      }),
    );
  }

  const publishedById = new Map(published?.fields.map((field) => [field.id, field] as const) ?? []);
  const draftById = new Map(draft.fields.map((field) => [field.id, field] as const));

  for (const field of draft.fields) {
    const previous = publishedById.get(field.id);
    if (previous === undefined) {
      pending.push(
        makeChange({
          code: field.required ? "field.added.required" : "field.added.optional",
          classification: field.required ? "potentially_breaking" : "non_breaking",
          fieldId: field.id,
          summary: field.required ? "A required field was added." : "An optional field was added.",
          position: field.position,
          before: null,
          after: field,
        }),
      );
      continue;
    }
    pending.push(...compareField(previous, field));
  }

  for (const field of published?.fields ?? []) {
    if (!draftById.has(field.id)) {
      pending.push(
        makeChange({
          code: "field.removed",
          classification: "breaking",
          fieldId: field.id,
          summary: "A published field was removed.",
          position: field.position,
          before: field,
          after: null,
        }),
      );
    }
  }

  pending.sort((left, right) => {
    const classificationDifference =
      classificationRank[left.change.classification] -
      classificationRank[right.change.classification];
    if (classificationDifference !== 0) return classificationDifference;
    if (left.position !== right.position) return left.position - right.position;
    const fieldDifference = (left.change.fieldId ?? "").localeCompare(right.change.fieldId ?? "");
    return fieldDifference !== 0
      ? fieldDifference
      : left.change.code.localeCompare(right.change.code);
  });

  const items: SchemaChanges = pending.map(({ change }) => change);
  const nonBreakingCount = items.filter(
    (change) => change.classification === "non_breaking",
  ).length;
  const potentiallyBreakingCount = items.filter(
    (change) => change.classification === "potentially_breaking",
  ).length;
  const breakingCount = items.filter((change) => change.classification === "breaking").length;

  return SchemaChangeSet.make({
    items,
    nonBreakingCount,
    potentiallyBreakingCount,
    breakingCount,
    requiresAcknowledgement: potentiallyBreakingCount + breakingCount > 0,
  });
}

export function requiredAcknowledgementChanges(changes: SchemaChangeSet): SchemaChanges {
  return changes.items.filter((change) => change.classification !== "non_breaking");
}

export function makeSchemaEngine() {
  return {
    validateDraft: Effect.fn("SchemaEngine.validateDraft")(
      (draft: SchemaDraftState, purpose: SchemaValidationPurpose) =>
        Effect.succeed(validateCollectionDraft(draft, purpose)),
    ),
    requirePublishable: Effect.fn("SchemaEngine.requirePublishable")(function* (
      draft: SchemaDraftState,
    ) {
      const result = validateCollectionDraft(draft, "publication");
      if (!result.valid) {
        return yield* SchemaInvalidFailure.make({
          issues: result.issues,
        });
      }
      return result;
    }),
    hashDraft: Effect.fn("SchemaEngine.hashDraft")((draft: SchemaDraftState) =>
      Effect.succeed(hashCollectionDraft(draft)),
    ),
    classifyChanges: Effect.fn("SchemaEngine.classifyChanges")(
      (published: PublishedSchemaRevision | null, draft: SchemaDraftState) =>
        Effect.succeed(classifyCollectionSchemaChanges(published, draft)),
    ),
    fingerprintPublication: Effect.fn("SchemaEngine.fingerprintPublication")(
      (input: PublishCollectionSchemaInput, schemaHash: SchemaHash) =>
        Effect.succeed(fingerprintSchemaPublication(input, schemaHash)),
    ),
    verifyAcknowledgements: Effect.fn("SchemaEngine.verifyAcknowledgements")(function* (
      changes: SchemaChangeSet,
      acknowledgedChangeIds: AcknowledgedSchemaChangeIds,
    ) {
      const required = requiredAcknowledgementChanges(changes);
      const acknowledged = new Set<string>(acknowledgedChangeIds);
      const isExact =
        required.length === acknowledged.size &&
        required.every((change) => acknowledged.has(change.changeId));
      if (!isExact) {
        return yield* SchemaChangeAcknowledgementRequiredFailure.make({
          requiredChanges: required,
        });
      }
      return { accepted: true };
    }),
  };
}

export class SchemaEngine extends Context.Tag("SchemaEngine")<
  SchemaEngine,
  ReturnType<typeof makeSchemaEngine>
>() {}

export const SchemaEngineLive = Layer.succeed(SchemaEngine, makeSchemaEngine());
