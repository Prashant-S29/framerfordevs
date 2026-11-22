import { canonicalizeEntryValue } from "../values";

export interface RevisionFieldNode<F> {
  readonly id: string;
  readonly kind: string;
  readonly children: ReadonlyArray<F>;
}

export type RevisionComparisonChange = "added" | "removed" | "changed";

export interface RevisionComparisonItem {
  readonly fieldId: string;
  readonly change: RevisionComparisonChange;
  readonly before?: unknown;
  readonly after?: unknown;
  readonly inCurrentSchema: boolean;
}

export interface ProjectedRevisionComparison {
  readonly items: ReadonlyArray<RevisionComparisonItem>;
  readonly restrictedChanges: boolean;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isTrivialResidue(value: unknown): boolean {
  return value === undefined || (isRecord(value) && Object.keys(value).length === 0);
}

function projectFieldValue<F extends RevisionFieldNode<F>>(
  field: F,
  value: unknown,
  visible: (field: F) => boolean,
  inList: boolean,
): unknown {
  if (!visible(field)) return undefined;
  if (field.kind === "object" && isRecord(value)) {
    const projected: Record<string, unknown> = {};
    for (const child of field.children) {
      const childValue = projectFieldValue(child, Reflect.get(value, child.id), visible, false);
      if (childValue !== undefined) Reflect.set(projected, child.id, childValue);
    }
    return inList || Object.keys(projected).length > 0 ? projected : undefined;
  }
  const item = field.children[0];
  if (field.kind === "list" && Array.isArray(value)) {
    if (item === undefined || !visible(item)) return undefined;
    return value.map((entry) => projectFieldValue(item, entry, visible, true) ?? null);
  }
  return value;
}

export function projectRevisionValues<F extends RevisionFieldNode<F>>(
  values: Readonly<Record<string, unknown>>,
  roots: ReadonlyArray<F>,
  visible: (field: F) => boolean,
): Record<string, unknown> {
  const projected: Record<string, unknown> = {};
  for (const field of roots) {
    const value = Reflect.get(values, field.id);
    if (value === undefined) continue;
    const projectedValue = projectFieldValue(field, value, visible, false);
    if (projectedValue !== undefined) Reflect.set(projected, field.id, projectedValue);
  }
  return projected;
}

function fieldResidue<F extends RevisionFieldNode<F>>(
  field: F,
  value: unknown,
  visible: (field: F) => boolean,
): unknown {
  if (!visible(field)) return value;
  if (field.kind === "object" && isRecord(value)) {
    return recordResidue(value, field.children, visible);
  }
  const item = field.children[0];
  if (field.kind === "list" && Array.isArray(value)) {
    if (item === undefined) return value;
    const items = value.map((entry) => fieldResidue(item, entry, visible));
    return items.every(isTrivialResidue) ? undefined : items.map((entry) => entry ?? null);
  }
  return undefined;
}

function recordResidue<F extends RevisionFieldNode<F>>(
  values: Readonly<Record<string, unknown>>,
  fields: ReadonlyArray<F>,
  visible: (field: F) => boolean,
): Record<string, unknown> {
  const byId = new Map<string, F>(fields.map((field) => [field.id, field]));
  const residue: Record<string, unknown> = {};
  for (const key of Object.keys(values)) {
    const value = Reflect.get(values, key);
    const field = byId.get(key);
    const hidden = field === undefined ? value : fieldResidue(field, value, visible);
    if (!isTrivialResidue(hidden)) Reflect.set(residue, key, hidden);
  }
  return residue;
}

/**
 * Returns the parts of a value document that the visibility predicate hides. Unknown keys count
 * as hidden, so two documents that differ only in hidden parts produce different residues.
 */
export function hiddenRevisionResidue<F extends RevisionFieldNode<F>>(
  values: Readonly<Record<string, unknown>>,
  roots: ReadonlyArray<F>,
  visible: (field: F) => boolean,
): Record<string, unknown> {
  return recordResidue(values, roots, visible);
}

export function compareRevisionValues(
  before: Readonly<Record<string, unknown>>,
  after: Readonly<Record<string, unknown>>,
  currentRootIds: ReadonlyArray<string>,
): ReadonlyArray<RevisionComparisonItem> {
  const current = new Set(currentRootIds);
  const others = [...new Set([...Object.keys(before), ...Object.keys(after)])]
    .filter((id) => !current.has(id))
    .sort();
  const items: Array<RevisionComparisonItem> = [];
  for (const fieldId of [...currentRootIds, ...others]) {
    const beforeValue = Reflect.get(before, fieldId);
    const afterValue = Reflect.get(after, fieldId);
    const inCurrentSchema = current.has(fieldId);
    if (beforeValue === undefined && afterValue === undefined) continue;
    if (beforeValue === undefined) {
      items.push({ fieldId, change: "added", after: afterValue, inCurrentSchema });
      continue;
    }
    if (afterValue === undefined) {
      items.push({ fieldId, change: "removed", before: beforeValue, inCurrentSchema });
      continue;
    }
    if (canonicalizeEntryValue(beforeValue) === canonicalizeEntryValue(afterValue)) continue;
    items.push({
      fieldId,
      change: "changed",
      before: beforeValue,
      after: afterValue,
      inCurrentSchema,
    });
  }
  return items;
}

/**
 * Compares two stored value documents for one caller. Items include only visible fields, and
 * `restrictedChanges` reports any difference inside hidden fields without naming or counting it.
 */
export function projectRevisionComparison<F extends RevisionFieldNode<F>>(options: {
  readonly before: Readonly<Record<string, unknown>>;
  readonly after: Readonly<Record<string, unknown>>;
  readonly roots: ReadonlyArray<F>;
  readonly currentRootIds: ReadonlyArray<string>;
  readonly visible: (field: F) => boolean;
}): ProjectedRevisionComparison {
  const items = compareRevisionValues(
    projectRevisionValues(options.before, options.roots, options.visible),
    projectRevisionValues(options.after, options.roots, options.visible),
    options.currentRootIds,
  );
  const restrictedChanges =
    canonicalizeEntryValue(
      hiddenRevisionResidue(options.before, options.roots, options.visible),
    ) !==
    canonicalizeEntryValue(hiddenRevisionResidue(options.after, options.roots, options.visible));
  return { items, restrictedChanges };
}

export function visibleFieldIds<F extends RevisionFieldNode<F>>(
  roots: ReadonlyArray<F>,
  visible: (field: F) => boolean,
): ReadonlySet<string> {
  const ids = new Set<string>();
  const visit = (field: F) => {
    if (!visible(field)) return;
    ids.add(field.id);
    for (const child of field.children) visit(child);
  };
  for (const root of roots) visit(root);
  return ids;
}

export function projectChangedFieldIds<Id extends string>(
  changedFieldIds: ReadonlyArray<Id>,
  visibleIds: ReadonlySet<string>,
): ReadonlyArray<Id> {
  return changedFieldIds.filter((id) => visibleIds.has(id));
}
