import type { ProjectAuditCategory } from "@framerfordevs/api/contracts/control-plane/index";

export const auditCategories = [
  "all",
  "security",
  "project",
  "governance",
  "schema",
  "content",
  "publication",
  "webhook",
  "tooling",
  "other",
] as const;
export type AuditCategoryFilter = "all" | ProjectAuditCategory;
export type AuditActorKind = "all" | "user" | "credential";

export interface AuditFilters {
  readonly environmentId: string;
  readonly category: AuditCategoryFilter;
  readonly actorKind: AuditActorKind;
  readonly actorId: string;
  readonly action: string;
  readonly from: string;
  readonly to: string;
}

export interface AuditSearch {
  readonly environment?: string;
  readonly category?: ProjectAuditCategory;
  readonly actor?: Exclude<AuditActorKind, "all">;
  readonly actorId?: string;
  readonly action?: string;
  readonly from?: string;
  readonly to?: string;
}

const auditActionPattern = /^[a-z][a-z0-9_.-]{0,127}$/u;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

function validDateSearch(value: unknown): value is string {
  return typeof value === "string" && value.length <= 35 && Number.isFinite(Date.parse(value));
}

export function toLocalDateTime(value: string) {
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 23);
}

export function validateAuditSearch(search: Record<string, unknown>): AuditSearch {
  const actor = search.actor === "user" || search.actor === "credential" ? search.actor : undefined;
  const actorId =
    actor !== undefined &&
    typeof search.actorId === "string" &&
    search.actorId.length >= 1 &&
    search.actorId.length <= 255
      ? search.actorId
      : undefined;
  return {
    ...(typeof search.environment === "string" && uuidPattern.test(search.environment)
      ? { environment: search.environment }
      : {}),
    ...(auditCategories.some((value) => value !== "all" && value === search.category)
      ? { category: search.category as ProjectAuditCategory }
      : {}),
    ...(actor !== undefined && actorId !== undefined ? { actor, actorId } : {}),
    ...(typeof search.action === "string" && auditActionPattern.test(search.action)
      ? { action: search.action }
      : {}),
    ...(validDateSearch(search.from) ? { from: search.from } : {}),
    ...(validDateSearch(search.to) ? { to: search.to } : {}),
  };
}

export function auditFiltersFromSearch(
  search: AuditSearch,
  initial: { readonly from: string; readonly to: string },
): AuditFilters {
  const from = search.from ?? initial.from;
  const to = search.to ?? initial.to;
  const validWindow =
    Date.parse(to) >= Date.parse(from) &&
    Date.parse(to) - Date.parse(from) <= 31 * 24 * 60 * 60 * 1_000;
  return {
    environmentId: search.environment ?? "",
    category: search.category ?? "all",
    actorKind: search.actor ?? "all",
    actorId: search.actorId ?? "",
    action: search.action ?? "",
    from: toLocalDateTime(validWindow ? from : initial.from),
    to: toLocalDateTime(validWindow ? to : initial.to),
  };
}
