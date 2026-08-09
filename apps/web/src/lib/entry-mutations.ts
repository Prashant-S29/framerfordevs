// Builds stable-ID draft mutations without crossing mixed-object partition boundaries.

interface MutationField {
  readonly id: string;
  readonly kind: string;
  readonly localization: "shared" | "localized" | "mixed" | null;
  readonly children: ReadonlyArray<MutationField>;
}

type DraftMutationPath = readonly [string, ...ReadonlyArray<string>];

export type DraftMutation =
  | { readonly operation: "set"; readonly path: DraftMutationPath; readonly value: unknown }
  | { readonly operation: "unset"; readonly path: DraftMutationPath };

function cleanJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(cleanJson).filter((item) => item !== undefined);
  if (typeof value !== "object" || value === null) return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .map(([key, item]) => [key, cleanJson(item)]),
  );
}

function childValue(value: unknown, fieldId: string): unknown {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? Reflect.get(value, fieldId)
    : undefined;
}

function appendChangedValue(
  mutations: Array<DraftMutation>,
  path: DraftMutationPath,
  current: unknown,
  baseline: unknown,
): void {
  const value = cleanJson(current);
  const previous = cleanJson(baseline);
  if (JSON.stringify(value) === JSON.stringify(previous)) return;
  mutations.push(
    value === undefined ? { operation: "unset", path } : { operation: "set", path, value },
  );
}

function appendFieldMutations(
  mutations: Array<DraftMutation>,
  field: MutationField,
  path: DraftMutationPath,
  current: unknown,
  baseline: unknown,
): void {
  if (field.kind !== "object" || field.localization !== "mixed") {
    appendChangedValue(mutations, path, current, baseline);
    return;
  }
  for (const child of field.children) {
    appendFieldMutations(
      mutations,
      child,
      [...path, child.id],
      childValue(current, child.id),
      childValue(baseline, child.id),
    );
  }
}

/** Emits atomic root mutations except where mixed objects require partition-safe descendant paths. */
export function fieldMutations(
  current: Readonly<Record<string, unknown>>,
  baseline: Readonly<Record<string, unknown>>,
  fields: ReadonlyArray<MutationField>,
): ReadonlyArray<DraftMutation> {
  const mutations: Array<DraftMutation> = [];
  for (const field of fields) {
    appendFieldMutations(
      mutations,
      field,
      [field.id],
      Reflect.get(current, field.id),
      Reflect.get(baseline, field.id),
    );
  }
  return mutations;
}
