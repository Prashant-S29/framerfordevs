// Compiles bounded typed root-scalar projections from an already validated immutable publication snapshot.

import type { DeliveryQueryScalarKind } from "../../../contracts/delivery";
import type { CollectionFieldDefinition } from "../../../contracts/schema";
import { canonicalDateTime, parseExactDecimal, validDate } from "../../field/validation";

export type DeliveryProjectionValue = string | number | boolean;

export interface DeliveryProjectionRow {
  readonly fieldId: string;
  readonly fieldKey: string;
  readonly kind: DeliveryQueryScalarKind;
  readonly value: DeliveryProjectionValue;
  readonly uniqueLookup: boolean;
}

export interface DeliveryProjectionIssue {
  readonly fieldId: string | null;
  readonly path: string;
  readonly code: string;
  readonly message: string;
}

export interface DeliveryProjectionCompilationResult {
  readonly valid: boolean;
  readonly rows: ReadonlyArray<DeliveryProjectionRow>;
  readonly issues: ReadonlyArray<DeliveryProjectionIssue>;
}

export interface DeliveryProjectionCapability {
  readonly fieldId: string;
  readonly uniqueLookup: boolean;
}

const textKinds = new Set<DeliveryQueryScalarKind>(["short_text", "slug", "email", "enum"]);
const supportedKinds = new Set<string>([
  ...textKinds,
  "number",
  "decimal",
  "boolean",
  "date",
  "date_time",
  "reference",
]);

/** Narrows the wider authoring vocabulary to the closed Delivery projection kinds. */
function isDeliveryKind(kind: string): kind is DeliveryQueryScalarKind {
  return supportedKinds.has(kind);
}
const referencePattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;

/** Converts one strict publication value to its exact database comparison representation. */
function projectionValue(
  kind: DeliveryQueryScalarKind,
  value: unknown,
): DeliveryProjectionValue | null {
  if (textKinds.has(kind)) {
    return typeof value === "string" ? value.normalize("NFC") : null;
  }
  if (kind === "number") {
    return typeof value === "number" && Number.isFinite(value) ? value : null;
  }
  if (kind === "decimal") {
    return typeof value === "string" && parseExactDecimal(value) !== null ? value : null;
  }
  if (kind === "boolean") return typeof value === "boolean" ? value : null;
  if (kind === "date") return typeof value === "string" ? validDate(value) : null;
  if (kind === "date_time") return typeof value === "string" ? canonicalDateTime(value) : null;
  if (kind === "reference") {
    if (typeof value !== "string") return null;
    const canonical = value.toLowerCase();
    return referencePattern.test(canonical) ? canonical : null;
  }
  return null;
}

/**
 * Materializes every present supported root terminal, independently of current query capabilities.
 * Unsupported/missing values produce no row; malformed supported values fail closed as invariant drift.
 */
export function compileDeliveryProjections(
  fields: ReadonlyArray<CollectionFieldDefinition>,
  snapshotData: Readonly<Record<string, unknown>>,
  capabilities: ReadonlyArray<DeliveryProjectionCapability>,
): DeliveryProjectionCompilationResult {
  const capabilityByFieldId = new Map(
    capabilities.map((capability) => [capability.fieldId, capability]),
  );
  const rows: Array<DeliveryProjectionRow> = [];
  const issues: Array<DeliveryProjectionIssue> = [];
  const rootFields = [...fields]
    .filter((field) => field.nodeRole === "root")
    .sort((left, right) => left.id.localeCompare(right.id));

  for (const field of rootFields) {
    if (field.apiKey === null || !isDeliveryKind(field.kind)) continue;
    const value = Reflect.get(snapshotData, field.apiKey);
    if (value === undefined) continue;
    const kind = field.kind;
    const projected = projectionValue(kind, value);
    if (projected === null) {
      issues.push({
        fieldId: field.id,
        path: field.apiKey,
        code: "delivery_projection_value_invalid",
        message: "The published value cannot be represented by its Delivery projection kind.",
      });
      continue;
    }
    rows.push({
      fieldId: field.id,
      fieldKey: field.apiKey,
      kind,
      value: projected,
      uniqueLookup: capabilityByFieldId.get(field.id)?.uniqueLookup ?? false,
    });
  }

  return { valid: issues.length === 0, rows, issues };
}
