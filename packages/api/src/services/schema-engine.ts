// Owns aggregate M6 schema validation, canonical dual hashes, change classification, and publication authority.

import { createHash } from "node:crypto";

import { Context, Effect, Layer } from "effect";

import {
  SchemaChangeAcknowledgementRequiredFailure,
  SchemaInvalidFailure,
} from "../contracts/errors";
import type { FieldLocalization } from "../contracts/field-system";
import {
  type AcknowledgedSchemaChangeIds,
  type CmsCollection,
  type CollectionFieldDefinition,
  ContractHash,
  currentCurrencyRegistryProfile,
  type CurrencyRegistryProfile,
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
import { validateEditorLayout } from "../lib/editor-layout";
import {
  canonicalizeSchemaDocument,
  validateAggregateSchemaDocument,
} from "../lib/field-system-document";
import { fieldSystemLimits, fieldSystemValidationProfile } from "../lib/field-system-profile";
import { flattenFieldTree } from "../lib/field-tree";
import {
  compareExactDecimals,
  parseExactDecimal,
  validateDefinitionTree,
} from "../lib/field-validation";

export type SchemaValidationPurpose = "draft" | "publication";

export interface SchemaDraftState {
  readonly formatVersion: 2;
  readonly validationProfile: typeof fieldSystemValidationProfile;
  readonly currencyRegistryProfile: CurrencyRegistryProfile | null;
  readonly collection: CmsCollection;
  readonly fields: ReadonlyArray<CollectionFieldDefinition>;
  readonly editorLayout: PublishedSchemaRevision["editorLayout"];
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

/** Hashes canonical UTF-8 text with SHA-256. */
function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

/** Returns deterministic JSON text after the aggregate preflight has rejected unsafe values. */
function canonicalStringify(value: unknown): string {
  return canonicalizeSchemaDocument(value);
}

/** Orders field definitions by authoring position and stable identity. */
function compareFields(left: CollectionFieldDefinition, right: CollectionFieldDefinition): number {
  return left.position - right.position || left.id.localeCompare(right.id);
}

/** Copies decoded schema classes into plain JSON data without invoking serializers. */
function plainJsonData(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(plainJsonData);
  if (typeof value !== "object" || value === null) return value;
  const output: Record<string, unknown> = {};
  for (const key of Object.keys(value)) output[key] = plainJsonData(Reflect.get(value, key));
  return output;
}

/** Produces the complete management document used for the schema hash and aggregate limit. */
function canonicalManagementDocument(draft: SchemaDraftState): object {
  return {
    formatVersion: 2,
    validationProfile: draft.validationProfile,
    currencyRegistryProfile: draft.currencyRegistryProfile,
    collection: {
      apiKey: draft.collection.apiKey,
      displayName: draft.collection.displayName,
      description: draft.collection.description,
    },
    fields: plainJsonData([...draft.fields].sort(compareFields)),
    editorLayout: plainJsonData(draft.editorLayout),
  };
}

/** Normalizes configuration metadata that is presentation-only out of the API contract. */
function contractConfiguration(field: CollectionFieldDefinition): unknown {
  switch (field.kind) {
    case "enum":
      return {
        options: field.configuration.options.map((option) => option.value).sort(),
        default: field.configuration.default,
      };
    case "money":
      return {
        currencies: [...field.configuration.currencies].sort(),
        allowNegative: field.configuration.allowNegative ?? false,
        default: field.configuration.default,
      };
    case "rich_text":
      return {
        ...field.configuration,
        styles:
          field.configuration.styles === undefined
            ? undefined
            : [...field.configuration.styles].sort(),
        decorators:
          field.configuration.decorators === undefined
            ? undefined
            : [...field.configuration.decorators].sort(),
        lists:
          field.configuration.lists === undefined
            ? undefined
            : [...field.configuration.lists].sort(),
      };
    default:
      return field.configuration;
  }
}

/** Compiles one recursive API/value-contract field with effective localization. */
function contractField(
  field: CollectionFieldDefinition,
  inheritedLocalization: Exclude<FieldLocalization, "mixed"> | null,
): object {
  const effectiveLocalization = inheritedLocalization ?? field.localization;
  const childInheritance =
    field.kind === "list" || effectiveLocalization !== "mixed"
      ? effectiveLocalization === "mixed"
        ? null
        : effectiveLocalization
      : null;
  const children = field.children
    .map((child) => contractField(child, childInheritance))
    .sort((left, right) => canonicalStringify(left).localeCompare(canonicalStringify(right)));
  return {
    id: field.id,
    apiKey: field.apiKey,
    kind: field.kind,
    required: field.required,
    localization: effectiveLocalization,
    configuration: contractConfiguration(field),
    children,
  };
}

export interface SchemaContractState {
  readonly formatVersion: number;
  readonly validationProfile: string;
  readonly currencyRegistryProfile: string | null;
  readonly collectionApiKey: string;
  readonly fields: ReadonlyArray<CollectionFieldDefinition>;
}

/** Produces the renderer-independent content contract excluded from layout/editor changes. */
export function compileCollectionContract(state: SchemaContractState): object {
  return {
    formatVersion: state.formatVersion,
    validationProfile: state.validationProfile,
    currencyRegistryProfile: state.currencyRegistryProfile,
    collectionApiKey: state.collectionApiKey,
    fields: state.fields
      .map((field) => contractField(field, null))
      .sort((left, right) => canonicalStringify(left).localeCompare(canonicalStringify(right))),
  };
}

/** Computes the full management schema hash. */
export function hashCollectionDraft(draft: SchemaDraftState): SchemaHash {
  return SchemaHash.make(sha256(canonicalStringify(canonicalManagementDocument(draft))));
}

/** Computes one value/API contract hash independently from editor presentation. */
export function hashSchemaContract(state: SchemaContractState): ContractHash {
  return ContractHash.make(sha256(canonicalStringify(compileCollectionContract(state))));
}

/** Computes the current draft value/API contract hash. */
export function hashCollectionContract(draft: SchemaDraftState): ContractHash {
  return hashSchemaContract({
    formatVersion: draft.formatVersion,
    validationProfile: draft.validationProfile,
    currencyRegistryProfile: draft.currencyRegistryProfile,
    collectionApiKey: draft.collection.apiKey,
    fields: draft.fields,
  });
}

/** Converts a bounded field-kernel issue into the public schema validation contract. */
function schemaIssue(options: {
  readonly path: string;
  readonly code: string;
  readonly message: string;
}): SchemaValidationIssue {
  return SchemaValidationIssue.make(options);
}

/** Validates recursive definitions, profiles, layout, publication completeness, and aggregate size. */
export function validateCollectionDraft(
  draft: SchemaDraftState,
  purpose: SchemaValidationPurpose,
): SchemaValidationResult {
  const issues: Array<SchemaValidationIssue> = [];
  const push = (value: {
    readonly path: string;
    readonly code: string;
    readonly message: string;
  }) => {
    if (issues.length < fieldSystemLimits.issues) issues.push(schemaIssue(value));
  };
  const flattened = flattenFieldTree(draft.fields);

  if (purpose === "publication" && draft.fields.length === 0) {
    push({
      path: "fields",
      code: "field_count_required",
      message: "A published schema must contain at least one root field.",
    });
  }
  const definitions = validateDefinitionTree(draft.fields);
  for (const value of definitions.issues) push(value);

  if (purpose === "publication") {
    for (const field of flattened) {
      if (field.kind === "object" && field.children.length === 0)
        push({
          path: `fields.${field.id}`,
          code: "object_property_required",
          message: "A published object requires at least one property.",
        });
      if (field.kind === "list" && field.children.length !== 1)
        push({
          path: `fields.${field.id}`,
          code: "list_item_required",
          message: "A published list requires exactly one item definition.",
        });
    }
  }

  const hasMoney = flattened.some((field) => field.kind === "money");
  if (hasMoney && draft.currencyRegistryProfile !== currentCurrencyRegistryProfile)
    push({
      path: "currencyRegistryProfile",
      code: "currency_profile_required",
      message: "Money fields require the current supported pinned currency profile.",
    });
  if (!hasMoney && draft.currencyRegistryProfile !== null)
    push({
      path: "currencyRegistryProfile",
      code: "currency_profile_unused",
      message: "A currency profile is only stored while the schema contains money fields.",
    });

  const layout = validateEditorLayout(
    draft.editorLayout,
    flattened.map((field) => ({
      id: field.id,
      nodeRole: field.nodeRole,
      editor: field.editor,
    })),
  );
  for (const value of layout.issues) push(value);

  const aggregate = validateAggregateSchemaDocument(canonicalManagementDocument(draft));
  for (const value of aggregate.issues) push(value);

  return { valid: issues.length === 0, issues };
}

/** Fingerprints exact publication authority and acknowledgement input. */
export function fingerprintSchemaPublication(
  input: PublishCollectionSchemaInput,
  schemaHash: SchemaHash,
): SchemaPublicationFingerprint {
  return SchemaPublicationFingerprint.make(
    sha256(
      canonicalStringify({
        formatVersion: 2,
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

/** Creates one deterministic bounded schema change. */
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
        formatVersion: 2,
        code: options.code,
        fieldId: options.fieldId,
        before: options.before,
        after: options.after,
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

/** Returns the strictest classification from one coalesced configuration change. */
function strictest(values: ReadonlyArray<SchemaChangeClassification>): SchemaChangeClassification {
  return values.reduce<SchemaChangeClassification>(
    (current, value) => (classificationRank[value] < classificationRank[current] ? value : current),
    "non_breaking",
  );
}

/** Compares optional minimum/maximum constraints where a tighter bound is riskier. */
function classifyBounds(
  beforeMinimum: number | string | undefined,
  afterMinimum: number | string | undefined,
  beforeMaximum: number | string | undefined,
  afterMaximum: number | string | undefined,
): SchemaChangeClassification {
  const compare = (left: number | string, right: number | string) =>
    typeof left === "number" && typeof right === "number"
      ? left - right
      : String(left).localeCompare(String(right));
  const minimumTightened =
    afterMinimum !== undefined &&
    (beforeMinimum === undefined || compare(afterMinimum, beforeMinimum) > 0);
  const maximumTightened =
    afterMaximum !== undefined &&
    (beforeMaximum === undefined || compare(afterMaximum, beforeMaximum) < 0);
  return minimumTightened || maximumTightened ? "potentially_breaking" : "non_breaking";
}

/** Coalesces one kind-preserving configuration mutation into a conservative classification. */
function classifyConfiguration(
  before: CollectionFieldDefinition,
  after: CollectionFieldDefinition,
): SchemaChangeClassification {
  if (canonicalStringify(before.configuration) === canonicalStringify(after.configuration))
    return "non_breaking";

  const beforeDefault = Reflect.get(before.configuration, "default");
  const afterDefault = Reflect.get(after.configuration, "default");
  const classifications: Array<SchemaChangeClassification> = [];
  if (beforeDefault !== undefined && afterDefault === undefined && after.required === true)
    classifications.push("potentially_breaking");

  if (before.kind !== after.kind) return "breaking";
  switch (after.kind) {
    case "enum": {
      if (before.kind !== "enum") return "breaking";
      const previous = new Set(before.configuration.options.map((option) => option.value));
      const next = new Set(after.configuration.options.map((option) => option.value));
      if ([...previous].some((value) => !next.has(value))) classifications.push("breaking");
      break;
    }
    case "reference":
      if (
        before.kind !== "reference" ||
        before.configuration.targetCollectionId !== after.configuration.targetCollectionId
      )
        classifications.push("breaking");
      break;
    case "money": {
      if (before.kind !== "money") return "breaking";
      const next = new Set(after.configuration.currencies);
      if (before.configuration.currencies.some((currency) => !next.has(currency)))
        classifications.push("breaking");
      if (before.configuration.allowNegative === true && after.configuration.allowNegative !== true)
        classifications.push("potentially_breaking");
      break;
    }
    case "list":
      if (before.kind !== "list") return "breaking";
      classifications.push(
        classifyBounds(
          before.configuration.minItems,
          after.configuration.minItems,
          before.configuration.maxItems,
          after.configuration.maxItems,
        ),
      );
      if (before.configuration.uniqueItems !== true && after.configuration.uniqueItems === true)
        classifications.push("potentially_breaking");
      break;
    case "decimal": {
      if (before.kind !== "decimal") return "breaking";
      if (
        (after.configuration.precision ?? 38) < (before.configuration.precision ?? 38) ||
        (after.configuration.scale ?? 18) < (before.configuration.scale ?? 18)
      )
        classifications.push("potentially_breaking");
      const beforeMinimum = before.configuration.minimum
        ? parseExactDecimal(before.configuration.minimum)
        : null;
      const afterMinimum = after.configuration.minimum
        ? parseExactDecimal(after.configuration.minimum)
        : null;
      const beforeMaximum = before.configuration.maximum
        ? parseExactDecimal(before.configuration.maximum)
        : null;
      const afterMaximum = after.configuration.maximum
        ? parseExactDecimal(after.configuration.maximum)
        : null;
      if (
        (afterMinimum &&
          (!beforeMinimum || compareExactDecimals(afterMinimum, beforeMinimum) > 0)) ||
        (afterMaximum && (!beforeMaximum || compareExactDecimals(afterMaximum, beforeMaximum) < 0))
      )
        classifications.push("potentially_breaking");
      break;
    }
    case "short_text":
    case "long_text":
    case "slug": {
      if (before.kind !== after.kind) return "breaking";
      classifications.push(
        classifyBounds(
          before.configuration.minLength,
          after.configuration.minLength,
          before.configuration.maxLength,
          after.configuration.maxLength,
        ),
      );
      if (
        after.configuration.pattern !== undefined &&
        after.configuration.pattern !== before.configuration.pattern
      )
        classifications.push("potentially_breaking");
      break;
    }
    case "number":
      if (before.kind !== "number") return "breaking";
      classifications.push(
        classifyBounds(
          before.configuration.minimum,
          after.configuration.minimum,
          before.configuration.maximum,
          after.configuration.maximum,
        ),
      );
      if (before.configuration.mode !== "integer" && after.configuration.mode === "integer")
        classifications.push("potentially_breaking");
      break;
    case "date":
    case "date_time": {
      if (before.kind !== after.kind) return "breaking";
      classifications.push(
        classifyBounds(
          before.configuration.minimum,
          after.configuration.minimum,
          before.configuration.maximum,
          after.configuration.maximum,
        ),
      );
      break;
    }
    case "rich_text":
      if (before.kind !== "rich_text") return "breaking";
      classifications.push(
        classifyBounds(
          before.configuration.minLength,
          after.configuration.minLength,
          before.configuration.maxLength,
          after.configuration.maxLength,
        ),
      );
      if (before.configuration.links !== false && after.configuration.links === false)
        classifications.push("potentially_breaking");
      break;
    case "json":
      if (before.kind !== "json") return "breaking";
      if (
        (after.configuration.maxBytes ?? 65_536) < (before.configuration.maxBytes ?? 65_536) ||
        (after.configuration.maxDepth ?? 10) < (before.configuration.maxDepth ?? 10)
      )
        classifications.push("potentially_breaking");
      break;
    case "boolean":
    case "email":
    case "url":
    case "object":
    case "external_asset":
      break;
  }
  return strictest(classifications);
}

/** Maps every field identity to its effective inherited localization. */
function effectiveLocalizations(
  roots: ReadonlyArray<CollectionFieldDefinition>,
): ReadonlyMap<string, FieldLocalization | null> {
  const values = new Map<string, FieldLocalization | null>();
  const stack: Array<{
    readonly field: CollectionFieldDefinition;
    readonly inherited: Exclude<FieldLocalization, "mixed"> | null;
  }> = roots.map((field) => ({ field, inherited: null }));
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) break;
    const effective = current.inherited ?? current.field.localization;
    values.set(current.field.id, effective);
    const inherited =
      current.field.kind === "list" || effective !== "mixed"
        ? effective === "mixed"
          ? null
          : effective
        : null;
    for (const child of current.field.children) stack.push({ field: child, inherited });
  }
  return values;
}

/** Compares one stable field identity across published and draft contracts. */
function compareField(
  published: CollectionFieldDefinition,
  draft: CollectionFieldDefinition,
  publishedLocalization: FieldLocalization | null,
  draftLocalization: FieldLocalization | null,
): ReadonlyArray<PendingChange> {
  const changes: Array<PendingChange> = [];
  const base = { fieldId: draft.id, position: draft.position };
  const add = (
    code: SchemaChangeCode,
    classification: SchemaChangeClassification,
    summary: string,
    before: unknown,
    after: unknown,
  ) => changes.push(makeChange({ ...base, code, classification, summary, before, after }));

  if (published.parentFieldId !== draft.parentFieldId || published.nodeRole !== draft.nodeRole)
    add(
      "field.structure.updated",
      "breaking",
      "A published field's structural parent changed.",
      { parentFieldId: published.parentFieldId, nodeRole: published.nodeRole },
      { parentFieldId: draft.parentFieldId, nodeRole: draft.nodeRole },
    );
  if (published.apiKey !== draft.apiKey)
    add(
      "field.api_key.updated",
      "breaking",
      "A published field API key changed.",
      published.apiKey,
      draft.apiKey,
    );
  if (published.displayLabel !== draft.displayLabel)
    add(
      "field.label.updated",
      "non_breaking",
      "A field display label changed.",
      published.displayLabel,
      draft.displayLabel,
    );
  if (published.kind !== draft.kind)
    add(
      "field.kind.updated",
      "breaking",
      "A published field kind changed.",
      published.kind,
      draft.kind,
    );
  if (published.required !== draft.required)
    add(
      draft.required === true ? "field.required.enabled" : "field.required.disabled",
      draft.required === true ? "potentially_breaking" : "non_breaking",
      draft.required === true
        ? "An optional published field became required."
        : "A published field no longer requires independent presence.",
      published.required,
      draft.required,
    );
  if (publishedLocalization !== draftLocalization)
    add(
      "field.localization.updated",
      "breaking",
      "A published field's effective localization changed.",
      publishedLocalization,
      draftLocalization,
    );
  if (published.deprecated !== draft.deprecated)
    add(
      draft.deprecated ? "field.deprecated" : "field.undeprecated",
      "non_breaking",
      draft.deprecated ? "A field was deprecated." : "A field is no longer deprecated.",
      published.deprecated,
      draft.deprecated,
    );
  if (published.position !== draft.position)
    add(
      "field.position.updated",
      "non_breaking",
      "A field's authoring order changed.",
      published.position,
      draft.position,
    );
  if (canonicalStringify(published.editor) !== canonicalStringify(draft.editor))
    add(
      "field.editor.updated",
      "non_breaking",
      "A field's editor presentation changed.",
      published.editor,
      draft.editor,
    );
  if (
    published.kind === draft.kind &&
    canonicalStringify(published.configuration) !== canonicalStringify(draft.configuration)
  )
    add(
      "field.configuration.updated",
      classifyConfiguration(published, draft),
      "A field's validation or default configuration changed.",
      published.configuration,
      draft.configuration,
    );

  return changes;
}

/** Classifies all deterministic M6 management-schema changes by stable identity. */
export function classifyCollectionSchemaChanges(
  published: PublishedSchemaRevision | null,
  draft: SchemaDraftState,
): SchemaChangeSet {
  const pending: Array<PendingChange> = [];
  if (published?.formatVersion === 1)
    pending.push(
      makeChange({
        code: "schema.format.upgraded",
        classification: "non_breaking",
        fieldId: null,
        summary: "The schema document format upgraded to version 2.",
        position: -3,
        before: 1,
        after: 2,
      }),
    );
  if (published && published.currencyRegistryProfile !== draft.currencyRegistryProfile)
    pending.push(
      makeChange({
        code: "schema.currency_profile.updated",
        classification: "potentially_breaking",
        fieldId: null,
        summary: "The pinned currency registry profile changed.",
        position: -2,
        before: published.currencyRegistryProfile,
        after: draft.currencyRegistryProfile,
      }),
    );
  if (
    published &&
    canonicalStringify(published.editorLayout) !== canonicalStringify(draft.editorLayout)
  )
    pending.push(
      makeChange({
        code: "editor_layout.updated",
        classification: "non_breaking",
        fieldId: null,
        summary: "The editor layout changed.",
        position: -1,
        before: published.editorLayout,
        after: draft.editorLayout,
      }),
    );
  if (
    published &&
    (published.collectionDisplayName !== draft.collection.displayName ||
      published.collectionDescription !== draft.collection.description)
  )
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

  const publishedFields = published ? flattenFieldTree(published.fields) : [];
  const draftFields = flattenFieldTree(draft.fields);
  const publishedById = new Map(publishedFields.map((field) => [field.id, field]));
  const draftById = new Map(draftFields.map((field) => [field.id, field]));
  const publishedLocalization = effectiveLocalizations(published?.fields ?? []);
  const draftLocalization = effectiveLocalizations(draft.fields);

  for (const field of draftFields) {
    const previous = publishedById.get(field.id);
    if (!previous) {
      pending.push(
        makeChange({
          code: field.required === true ? "field.added.required" : "field.added.optional",
          classification: field.required === true ? "potentially_breaking" : "non_breaking",
          fieldId: field.id,
          summary:
            field.required === true
              ? "A required field was added."
              : "An optional field was added.",
          position: field.position,
          before: null,
          after: field,
        }),
      );
      continue;
    }
    pending.push(
      ...compareField(
        previous,
        field,
        publishedLocalization.get(field.id) ?? null,
        draftLocalization.get(field.id) ?? null,
      ),
    );
  }
  for (const field of publishedFields) {
    if (!draftById.has(field.id))
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

  pending.sort((left, right) => {
    const severity =
      classificationRank[left.change.classification] -
      classificationRank[right.change.classification];
    if (severity !== 0) return severity;
    if (left.position !== right.position) return left.position - right.position;
    const identity = (left.change.fieldId ?? "").localeCompare(right.change.fieldId ?? "");
    return identity !== 0 ? identity : left.change.code.localeCompare(right.change.code);
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

/** Returns only the exact risky changes requiring publication acknowledgement. */
export function requiredAcknowledgementChanges(changes: SchemaChangeSet): SchemaChanges {
  return changes.items.filter((change) => change.classification !== "non_breaking");
}

/** Constructs the replaceable aggregate schema service. */
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
      if (!result.valid) return yield* SchemaInvalidFailure.make({ issues: result.issues });
      return result;
    }),
    hashDraft: Effect.fn("SchemaEngine.hashDraft")((draft: SchemaDraftState) =>
      Effect.succeed(hashCollectionDraft(draft)),
    ),
    hashContract: Effect.fn("SchemaEngine.hashContract")((draft: SchemaDraftState) =>
      Effect.succeed(hashCollectionContract(draft)),
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
      const exact =
        required.length === acknowledged.size &&
        required.every((change) => acknowledged.has(change.changeId));
      if (!exact)
        return yield* SchemaChangeAcknowledgementRequiredFailure.make({
          requiredChanges: required,
        });
      return { accepted: true };
    }),
  };
}

export class SchemaEngine extends Context.Tag("SchemaEngine")<
  SchemaEngine,
  ReturnType<typeof makeSchemaEngine>
>() {}

export const SchemaEngineLive = Layer.succeed(SchemaEngine, makeSchemaEngine());
