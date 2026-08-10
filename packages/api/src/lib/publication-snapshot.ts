// Compiles immutable exact-locale delivery snapshots without database, HTTP, or Effect runtime dependencies.

import { createHash } from "node:crypto";

import type { EntryValues } from "../contracts/entries";
import type { CollectionFieldDefinition } from "../contracts/schemas";
import { validateDefinitionTree, validateFieldValue } from "./field-validation";
import { canonicalizeEntryValue, validateEntryDocument } from "./entry-values";

export const publicationSnapshotProfile = "ffd-delivery-snapshot@1" as const;

export const publicationSnapshotLimits = {
  combinedBytes: 1_048_576,
  fixtureHeadroomBytes: 786_432,
  issues: 50,
  uniqueReferences: 1_000,
} as const;

export type PublicationSizeBucket = "small" | "medium" | "large" | "near_limit" | "over_limit";

export interface PublicationCompilationIssue {
  readonly fieldId: string | null;
  readonly path: string;
  readonly code: string;
  readonly message: string;
}

export interface PublicationReferenceUse {
  readonly sourceFieldId: string;
  readonly path: string;
  readonly targetCollectionId: string;
  readonly targetEntryId: string;
}

export interface ResolvedPublicationReference {
  readonly targetCollectionId: string;
  readonly targetEntryId: string;
  readonly targetPublicationId: string;
  readonly targetPublicationSequence: number;
}

export interface PublicationReferenceManifestItem extends PublicationReferenceUse {
  readonly targetPublicationId: string;
  readonly targetPublicationSequence: number;
}

export interface PublicationSnapshotDocument {
  readonly version: 1;
  readonly entryId: string;
  readonly collectionId: string;
  readonly locale: string;
  readonly schemaRevisionId: string;
  readonly contractHash: string;
  readonly publicationId: string;
  readonly publicationSequence: number;
  readonly publishedAt: string;
  readonly data: Readonly<Record<string, unknown>>;
}

export interface PublicationCompilationSize {
  readonly documentBytes: number;
  readonly referenceManifestBytes: number;
  readonly combinedBytes: number;
  readonly maximumBytes: number;
  readonly bucket: PublicationSizeBucket;
}

export interface PublicationCompilationCandidate {
  readonly document: PublicationSnapshotDocument;
  readonly referenceManifest: ReadonlyArray<PublicationReferenceManifestItem>;
  readonly canonicalDocument: string;
  readonly canonicalReferenceManifest: string;
  readonly contentHash: string;
  readonly authorityHash: string;
  readonly documentHash: string;
  readonly referenceManifestHash: string;
  readonly changedFieldIds: ReadonlyArray<string>;
  readonly size: PublicationCompilationSize;
}

export interface PublicationCompilationResult {
  readonly valid: boolean;
  readonly issues: ReadonlyArray<PublicationCompilationIssue>;
  readonly capped: boolean;
  readonly candidate: PublicationCompilationCandidate | null;
}

export interface CompilePublicationSnapshotInput {
  readonly fields: ReadonlyArray<CollectionFieldDefinition>;
  readonly sharedValues: EntryValues;
  readonly localizedValues: EntryValues;
  readonly resolvedReferences: ReadonlyArray<ResolvedPublicationReference>;
  readonly authority: {
    readonly sharedRevisionId: string | null;
    readonly sharedVersion: number;
    readonly localizedRevisionId: string | null;
    readonly localizedVersion: number;
  };
  readonly document: Omit<PublicationSnapshotDocument, "version" | "data">;
  readonly previousData?: Readonly<Record<string, unknown>> | null;
}

interface MutableIssueCollector {
  readonly issues: Array<PublicationCompilationIssue>;
  capped: boolean;
}

const textEncoder = new TextEncoder();

function isPlainRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function addIssue(collector: MutableIssueCollector, issue: PublicationCompilationIssue): void {
  if (collector.issues.length >= publicationSnapshotLimits.issues) {
    collector.capped = true;
    return;
  }
  collector.issues.push(issue);
}

function digest(value: unknown): string {
  return createHash("sha256").update(canonicalizeEntryValue(value)).digest("hex");
}

function localizationFor(
  field: CollectionFieldDefinition,
  inherited: "shared" | "localized" | null,
): "shared" | "localized" | "mixed" | null {
  return inherited ?? field.localization;
}

function childValue(value: unknown, fieldId: string): unknown {
  return isPlainRecord(value) ? Reflect.get(value, fieldId) : undefined;
}

function stableValueToApi(field: CollectionFieldDefinition, value: unknown): unknown {
  if (field.kind === "object" && isPlainRecord(value)) {
    const result: Record<string, unknown> = {};
    for (const child of field.children) {
      if (child.apiKey === null) continue;
      const valueAtChild = Reflect.get(value, child.id);
      if (valueAtChild !== undefined)
        Reflect.set(result, child.apiKey, stableValueToApi(child, valueAtChild));
    }
    return result;
  }
  const item = field.children[0];
  if (field.kind === "list" && item && Array.isArray(value))
    return value.map((itemValue) => stableValueToApi(item, itemValue));
  return value;
}

function selectFieldValue(
  field: CollectionFieldDefinition,
  sharedValue: unknown,
  localizedValue: unknown,
  inherited: "shared" | "localized" | null,
  collector: MutableIssueCollector,
  path: string,
): unknown {
  const effective = localizationFor(field, inherited);
  if (effective === "mixed") {
    if (field.kind !== "object") return undefined;
    for (const [scope, value] of [
      ["shared", sharedValue],
      ["localized", localizedValue],
    ] as const) {
      if (value !== undefined && !isPlainRecord(value)) {
        addIssue(collector, {
          fieldId: field.id,
          path,
          code: "entry_fragment_container_invalid",
          message: `The ${scope} fragment must use an object container at this mixed field.`,
        });
      }
    }
    const result: Record<string, unknown> = {};
    for (const child of field.children) {
      if (child.apiKey === null) continue;
      const selected = selectFieldValue(
        child,
        childValue(sharedValue, child.id),
        childValue(localizedValue, child.id),
        null,
        collector,
        `${path}.${child.apiKey}`,
      );
      if (selected !== undefined) Reflect.set(result, child.apiKey, selected);
    }
    return result;
  }

  if (effective !== "shared" && effective !== "localized") return undefined;
  const selected = effective === "shared" ? sharedValue : localizedValue;
  const unselected = effective === "shared" ? localizedValue : sharedValue;
  if (unselected !== undefined) {
    addIssue(collector, {
      fieldId: field.id,
      path,
      code: selected === undefined ? "entry_fragment_scope_mismatch" : "entry_fragment_collision",
      message:
        selected === undefined
          ? "The value is stored outside the field's current localization partition."
          : "Shared and localized fragments cannot own the same terminal field.",
    });
  }
  return stableValueToApi(field, selected);
}

function pruneEmptyMixedObjects(
  field: CollectionFieldDefinition,
  value: unknown,
  inherited: "shared" | "localized" | null,
): unknown {
  const effective = localizationFor(field, inherited);
  if (field.kind === "object" && isPlainRecord(value)) {
    const result: Record<string, unknown> = {};
    const childInherited = effective === "mixed" ? null : effective;
    for (const child of field.children) {
      if (child.apiKey === null) continue;
      const pruned = pruneEmptyMixedObjects(
        child,
        Reflect.get(value, child.apiKey),
        childInherited === "shared" || childInherited === "localized" ? childInherited : null,
      );
      if (pruned !== undefined) Reflect.set(result, child.apiKey, pruned);
    }
    return effective === "mixed" && Object.keys(result).length === 0 ? undefined : result;
  }
  const item = field.children[0];
  if (field.kind === "list" && item && Array.isArray(value)) {
    const itemInherited = effective === "shared" || effective === "localized" ? effective : null;
    return value.map((itemValue) => pruneEmptyMixedObjects(item, itemValue, itemInherited));
  }
  return value;
}

function collectReferenceUses(
  field: CollectionFieldDefinition,
  value: unknown,
  path: string,
  inherited: "shared" | "localized" | null,
  uses: Array<PublicationReferenceUse>,
): void {
  const effective = localizationFor(field, inherited);
  if (field.kind === "reference" && typeof value === "string") {
    uses.push({
      sourceFieldId: field.id,
      path,
      targetCollectionId: field.configuration.targetCollectionId,
      targetEntryId: value,
    });
    return;
  }
  if (field.kind === "object" && isPlainRecord(value)) {
    const childInherited = effective === "mixed" ? null : effective;
    for (const child of field.children) {
      if (child.apiKey === null) continue;
      collectReferenceUses(
        child,
        Reflect.get(value, child.apiKey),
        `${path}.${child.apiKey}`,
        childInherited === "shared" || childInherited === "localized" ? childInherited : null,
        uses,
      );
    }
    return;
  }
  const item = field.children[0];
  if (field.kind === "list" && item && Array.isArray(value)) {
    const itemInherited = effective === "shared" || effective === "localized" ? effective : null;
    value.forEach((itemValue, index) =>
      collectReferenceUses(item, itemValue, `${path}[${index}]`, itemInherited, uses),
    );
  }
}

function compareManifestItems(
  left: PublicationReferenceManifestItem,
  right: PublicationReferenceManifestItem,
): number {
  return (
    left.path.localeCompare(right.path) ||
    left.sourceFieldId.localeCompare(right.sourceFieldId) ||
    left.targetCollectionId.localeCompare(right.targetCollectionId) ||
    left.targetEntryId.localeCompare(right.targetEntryId) ||
    left.targetPublicationId.localeCompare(right.targetPublicationId)
  );
}

function sizeBucket(combinedBytes: number): PublicationSizeBucket {
  if (combinedBytes <= 262_144) return "small";
  if (combinedBytes <= 524_288) return "medium";
  if (combinedBytes <= publicationSnapshotLimits.fixtureHeadroomBytes) return "large";
  if (combinedBytes <= publicationSnapshotLimits.combinedBytes) return "near_limit";
  return "over_limit";
}

/** Compares delivery roots and reports stable field IDs without exposing content. */
export function changedPublicationFieldIds(
  fields: ReadonlyArray<CollectionFieldDefinition>,
  previousData: Readonly<Record<string, unknown>> | null,
  nextData: Readonly<Record<string, unknown>>,
): ReadonlyArray<string> {
  if (previousData === null)
    return fields
      .filter((field) => field.apiKey !== null && Object.hasOwn(nextData, field.apiKey))
      .map((field) => field.id)
      .sort();
  return fields
    .filter(
      (field) =>
        field.apiKey !== null &&
        canonicalizeEntryValue(Reflect.get(previousData, field.apiKey)) !==
          canonicalizeEntryValue(Reflect.get(nextData, field.apiKey)),
    )
    .map((field) => field.id)
    .sort();
}

/** Strictly validates, defaults, projects, pins references, hashes, and bounds one snapshot. */
export function compilePublicationSnapshot(
  input: CompilePublicationSnapshotInput,
): PublicationCompilationResult {
  const collector: MutableIssueCollector = { issues: [], capped: false };
  const definition = validateDefinitionTree(input.fields);
  for (const issue of definition.issues) {
    addIssue(collector, { fieldId: null, ...issue });
  }
  if (definition.capped) collector.capped = true;
  for (const issue of [
    ...validateEntryDocument(input.sharedValues),
    ...validateEntryDocument(input.localizedValues),
  ]) {
    addIssue(collector, { fieldId: null, ...issue });
  }
  if (collector.issues.length > 0) {
    return { valid: false, issues: collector.issues, capped: collector.capped, candidate: null };
  }

  const data: Record<string, unknown> = {};
  for (const field of input.fields) {
    if (field.apiKey === null) continue;
    const selected = selectFieldValue(
      field,
      Reflect.get(input.sharedValues, field.id),
      Reflect.get(input.localizedValues, field.id),
      null,
      collector,
      field.apiKey,
    );
    const validation = validateFieldValue(field, selected, field.apiKey);
    for (const issue of validation.issues) {
      addIssue(collector, { fieldId: field.id, ...issue });
    }
    if (validation.capped) collector.capped = true;
    const pruned = pruneEmptyMixedObjects(field, validation.value, null);
    if (pruned !== undefined) Reflect.set(data, field.apiKey, pruned);
  }
  if (collector.issues.length > 0) {
    return { valid: false, issues: collector.issues, capped: collector.capped, candidate: null };
  }

  const referenceUses: Array<PublicationReferenceUse> = [];
  for (const field of input.fields) {
    if (field.apiKey !== null)
      collectReferenceUses(
        field,
        Reflect.get(data, field.apiKey),
        field.apiKey,
        null,
        referenceUses,
      );
  }
  const uniqueReferenceKeys = new Set(
    referenceUses.map((use) => `${use.targetCollectionId}:${use.targetEntryId}`),
  );
  if (uniqueReferenceKeys.size > publicationSnapshotLimits.uniqueReferences) {
    addIssue(collector, {
      fieldId: null,
      path: "data",
      code: "entry_references_exceeded",
      message: `One publication cannot exceed ${publicationSnapshotLimits.uniqueReferences} unique references.`,
    });
  }

  const resolved = new Map<string, ResolvedPublicationReference>();
  for (const reference of input.resolvedReferences) {
    const key = `${reference.targetCollectionId}:${reference.targetEntryId}`;
    const existing = resolved.get(key);
    if (
      existing &&
      (existing.targetPublicationId !== reference.targetPublicationId ||
        existing.targetPublicationSequence !== reference.targetPublicationSequence)
    ) {
      addIssue(collector, {
        fieldId: null,
        path: "references",
        code: "reference_resolution_conflict",
        message: "Reference resolution returned conflicting immutable publications.",
      });
      continue;
    }
    resolved.set(key, reference);
  }

  const referenceManifest: Array<PublicationReferenceManifestItem> = [];
  for (const use of referenceUses) {
    const target = resolved.get(`${use.targetCollectionId}:${use.targetEntryId}`);
    if (!target) {
      addIssue(collector, {
        fieldId: use.sourceFieldId,
        path: use.path,
        code: "reference_target_locale_unpublished",
        message: "Publish the referenced entry in this exact locale before publishing this entry.",
      });
      continue;
    }
    referenceManifest.push({
      ...use,
      targetPublicationId: target.targetPublicationId,
      targetPublicationSequence: target.targetPublicationSequence,
    });
  }
  if (collector.issues.length > 0) {
    return { valid: false, issues: collector.issues, capped: collector.capped, candidate: null };
  }
  referenceManifest.sort(compareManifestItems);

  const contentHash = digest({
    profile: publicationSnapshotProfile,
    schemaRevisionId: input.document.schemaRevisionId,
    contractHash: input.document.contractHash,
    data,
    referenceManifest,
  });
  const authorityHash = digest({ contentHash, ...input.authority });
  const document: PublicationSnapshotDocument = { version: 1, ...input.document, data };
  const canonicalDocument = canonicalizeEntryValue(document);
  const canonicalReferenceManifest = canonicalizeEntryValue(referenceManifest);
  const documentBytes = textEncoder.encode(canonicalDocument).byteLength;
  const referenceManifestBytes = textEncoder.encode(canonicalReferenceManifest).byteLength;
  const combinedBytes = documentBytes + referenceManifestBytes;
  const size: PublicationCompilationSize = {
    documentBytes,
    referenceManifestBytes,
    combinedBytes,
    maximumBytes: publicationSnapshotLimits.combinedBytes,
    bucket: sizeBucket(combinedBytes),
  };
  if (combinedBytes > publicationSnapshotLimits.combinedBytes) {
    addIssue(collector, {
      fieldId: null,
      path: "data",
      code: "publication_snapshot_too_large",
      message: `The canonical snapshot and reference manifest cannot exceed ${publicationSnapshotLimits.combinedBytes} bytes.`,
    });
  }

  const candidate: PublicationCompilationCandidate = {
    document,
    referenceManifest,
    canonicalDocument,
    canonicalReferenceManifest,
    contentHash,
    authorityHash,
    documentHash: digest(document),
    referenceManifestHash: digest(referenceManifest),
    changedFieldIds: changedPublicationFieldIds(
      input.fields,
      input.previousData === undefined ? null : input.previousData,
      data,
    ),
    size,
  };
  return {
    valid: collector.issues.length === 0,
    issues: collector.issues,
    capped: collector.capped,
    candidate,
  };
}
