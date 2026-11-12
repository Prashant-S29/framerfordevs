import type { CollectionFieldDefinition } from "../../contracts/schema";

export interface EntryDocumentProjectionIssue {
  readonly fieldId: string | null;
  readonly path: string;
  readonly code: string;
  readonly message: string;
}

export interface EntryDocumentProjectionIssueCollector {
  readonly issues: Array<EntryDocumentProjectionIssue>;
  readonly maximumIssues: number;
  capped: boolean;
}

export type InheritedLocalization = "shared" | "localized" | null;

export function makeEntryDocumentProjectionIssueCollector(
  maximumIssues: number,
): EntryDocumentProjectionIssueCollector {
  return { issues: [], maximumIssues, capped: false };
}

export function isPlainEntryRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

export function addEntryDocumentProjectionIssue(
  collector: EntryDocumentProjectionIssueCollector,
  issue: EntryDocumentProjectionIssue,
): void {
  if (collector.issues.length >= collector.maximumIssues) {
    collector.capped = true;
    return;
  }
  collector.issues.push(issue);
}

export function effectiveFieldLocalization(
  field: CollectionFieldDefinition,
  inherited: InheritedLocalization,
): "shared" | "localized" | "mixed" | null {
  return inherited ?? field.localization;
}

export function stableEntryValueToApi(field: CollectionFieldDefinition, value: unknown): unknown {
  if (field.kind === "object" && isPlainEntryRecord(value)) {
    const result: Record<string, unknown> = {};
    for (const child of field.children) {
      if (child.apiKey === null) continue;
      const childValue = Reflect.get(value, child.id);
      if (childValue !== undefined) {
        Reflect.set(result, child.apiKey, stableEntryValueToApi(child, childValue));
      }
    }
    return result;
  }
  const item = field.children[0];
  if (field.kind === "list" && item && Array.isArray(value)) {
    return value.map((itemValue) => stableEntryValueToApi(item, itemValue));
  }
  return value;
}

export function selectEntryFieldValue(
  field: CollectionFieldDefinition,
  sharedValue: unknown,
  localizedValue: unknown,
  inherited: InheritedLocalization,
  collector: EntryDocumentProjectionIssueCollector,
  path: string,
): unknown {
  const effective = effectiveFieldLocalization(field, inherited);
  if (effective === "mixed") {
    if (field.kind !== "object") return undefined;
    if (sharedValue !== undefined && !isPlainEntryRecord(sharedValue)) {
      addEntryDocumentProjectionIssue(collector, {
        fieldId: field.id,
        path,
        code: "entry_fragment_container_invalid",
        message: "The shared fragment must use an object container at this mixed field.",
      });
    }
    if (localizedValue !== undefined && !isPlainEntryRecord(localizedValue)) {
      addEntryDocumentProjectionIssue(collector, {
        fieldId: field.id,
        path,
        code: "entry_fragment_container_invalid",
        message: "The localized fragment must use an object container at this mixed field.",
      });
    }
    const result: Record<string, unknown> = {};
    for (const child of field.children) {
      if (child.apiKey === null) continue;
      const selected = selectEntryFieldValue(
        child,
        isPlainEntryRecord(sharedValue) ? Reflect.get(sharedValue, child.id) : undefined,
        isPlainEntryRecord(localizedValue) ? Reflect.get(localizedValue, child.id) : undefined,
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
    addEntryDocumentProjectionIssue(collector, {
      fieldId: field.id,
      path,
      code: selected === undefined ? "entry_fragment_scope_mismatch" : "entry_fragment_collision",
      message:
        selected === undefined
          ? "The value is stored outside the field's current localization partition."
          : "Shared and localized fragments cannot own the same terminal field.",
    });
  }
  return stableEntryValueToApi(field, selected);
}

export function pruneEmptyProjectedObjects(
  field: CollectionFieldDefinition,
  value: unknown,
  inherited: InheritedLocalization,
): unknown {
  const effective = effectiveFieldLocalization(field, inherited);
  if (field.kind === "object" && isPlainEntryRecord(value)) {
    const result: Record<string, unknown> = {};
    const childInherited = effective === "mixed" ? null : effective;
    for (const child of field.children) {
      if (child.apiKey === null) continue;
      const pruned = pruneEmptyProjectedObjects(
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
    return value.map((itemValue) => pruneEmptyProjectedObjects(item, itemValue, itemInherited));
  }
  return value;
}
