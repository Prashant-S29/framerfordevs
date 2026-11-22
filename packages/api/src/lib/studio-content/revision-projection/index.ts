import { Schema } from "effect";

import {
  EntryValidationIssue,
  type EntryRevisionComparison,
  type EntryRevisionSummary,
} from "../../../contracts/entry";
import type {
  EntryPublicationPlan,
  EntryPublicationStatus,
  EntryPublicationSummary,
  EntryPublicationValidationIssue,
} from "../../../contracts/publication";
import { ApiErrorDetail } from "../../../contracts/response/api";
import {
  StudioEntryValidation,
  StudioPublicationEntryIssue,
  StudioPublicationPlan,
  StudioPublicationStatus,
  StudioPublicationSummary,
  StudioRevisionComparison,
  StudioRevisionSummary,
  studioContentLimits,
  type StudioFormField,
  type StudioFormProjection,
} from "../../../contracts/studio-content";
import { canonicalizeEntryValue } from "../../entry/values";
import { projectRevisionValues } from "../../entry/revision-comparison";

const hiddenPublicationIssueCode = "hidden_field_blocks_publication";

export function studioFormFieldIds(form: StudioFormProjection): ReadonlySet<string> {
  const ids = new Set<string>();
  const visit = (fields: ReadonlyArray<StudioFormField>) => {
    for (const field of fields) {
      ids.add(field.id);
      visit(field.children);
    }
  };
  visit(form.fields);
  return ids;
}

function studioFieldScopes(
  form: StudioFormProjection,
): ReadonlyMap<string, "shared" | "localized"> {
  const scopes = new Map<string, "shared" | "localized">();
  const visit = (field: StudioFormField, inherited: "shared" | "localized" | null) => {
    const effective = inherited ?? field.localization;
    scopes.set(field.id, effective === "shared" ? "shared" : "localized");
    const childInherited = effective === "shared" || effective === "localized" ? effective : null;
    for (const child of field.children) visit(child, childInherited);
  };
  for (const field of form.fields) visit(field, null);
  return scopes;
}

export function projectStudioRevisionSummary(
  summary: EntryRevisionSummary,
  form: StudioFormProjection,
): StudioRevisionSummary {
  const visibleIds = studioFormFieldIds(form);
  return Schema.decodeUnknownSync(StudioRevisionSummary, { onExcessProperty: "error" })({
    id: summary.id,
    scope: summary.scope,
    sequence: summary.sequence,
    previousRevisionId: summary.previousRevisionId,
    schemaRevisionId: summary.schemaRevisionId,
    contractHash: summary.contractHash,
    changedFieldIds: summary.changedFieldIds.filter((id) => visibleIds.has(id)),
    restoredFromRevisionId: summary.restoredFromRevisionId,
    authoredByUserId: summary.authoredByUserId,
    authoredByCredentialId: summary.authoredByCredentialId,
    authoredAt: summary.authoredAt,
    compatible: summary.contractHash === form.contractHash,
  });
}

function sameValue(left: unknown, right: unknown): boolean {
  if (left === undefined || right === undefined) return left === right;
  return canonicalizeEntryValue(left) === canonicalizeEntryValue(right);
}

export function projectStudioRevisionComparison(
  comparison: EntryRevisionComparison,
  form: StudioFormProjection,
): StudioRevisionComparison {
  const roots = new Map<string, StudioFormField>(form.fields.map((field) => [field.id, field]));
  let restrictedChanges = comparison.restrictedChanges;
  const items: Array<Record<string, unknown>> = [];
  for (const item of comparison.items) {
    if (!item.inCurrentSchema) {
      items.push({ ...item });
      continue;
    }
    const root = roots.get(item.fieldId);
    if (root === undefined) {
      restrictedChanges = true;
      continue;
    }
    const project = (value: unknown) =>
      value === undefined
        ? undefined
        : Reflect.get(
            projectRevisionValues({ [root.id]: value }, [root], () => true),
            root.id,
          );
    const before = project(item.before);
    const after = project(item.after);
    if (sameValue(before, after)) {
      restrictedChanges = true;
      continue;
    }
    if (!sameValue(before, item.before) || !sameValue(after, item.after)) restrictedChanges = true;
    items.push({
      fieldId: item.fieldId,
      change: before === undefined ? "added" : after === undefined ? "removed" : "changed",
      ...(before === undefined ? {} : { before }),
      ...(after === undefined ? {} : { after }),
      inCurrentSchema: true,
    });
  }
  return Schema.decodeUnknownSync(StudioRevisionComparison, { onExcessProperty: "error" })({
    from: projectStudioRevisionSummary(comparison.from, form),
    to: projectStudioRevisionSummary(comparison.to, form),
    items,
    restrictedChanges,
    schemaDiffers: comparison.schemaDiffers,
  });
}

export function projectStudioPublicationSummary(
  summary: EntryPublicationSummary,
  form: StudioFormProjection,
): StudioPublicationSummary {
  const visibleIds = studioFormFieldIds(form);
  return Schema.decodeUnknownSync(StudioPublicationSummary, { onExcessProperty: "error" })({
    id: summary.id,
    sequence: summary.sequence,
    schemaRevisionId: summary.schemaRevisionId,
    contractHash: summary.contractHash,
    changedFieldIds: summary.changedFieldIds.filter((id) => visibleIds.has(id)),
    publishedAt: summary.publishedAt,
    current: summary.current,
  });
}

export function projectStudioPublicationStatus(
  status: EntryPublicationStatus,
  form: StudioFormProjection,
): StudioPublicationStatus {
  return Schema.decodeUnknownSync(StudioPublicationStatus, { onExcessProperty: "error" })({
    state:
      status.state === "published"
        ? "published"
        : status.stateVersion === 0
          ? "never_published"
          : "unpublished",
    stateVersion: status.stateVersion,
    currentPublication:
      status.currentPublication === null
        ? null
        : projectStudioPublicationSummary(status.currentPublication, form),
    sharedChanged: status.sharedChanged,
    localizedChanged: status.localizedChanged,
    schemaChanged: status.schemaChanged,
    changedSincePublication: status.changedSincePublication,
  });
}

interface ProjectedPublicationIssues {
  readonly fieldIssues: ReadonlyArray<EntryValidationIssue>;
  readonly entryIssues: ReadonlyArray<StudioPublicationEntryIssue>;
  readonly restricted: boolean;
}

function projectPublicationIssues(
  issues: ReadonlyArray<EntryPublicationValidationIssue>,
  form: StudioFormProjection,
  locale: {
    readonly localeId: EntryPublicationPlan["localeId"];
    readonly locale: EntryPublicationPlan["locale"];
  },
): ProjectedPublicationIssues {
  const visibleIds = studioFormFieldIds(form);
  const scopes = studioFieldScopes(form);
  const fieldIssues: Array<EntryValidationIssue> = [];
  const entryIssues: Array<StudioPublicationEntryIssue> = [];
  let restricted = false;
  for (const issue of issues) {
    if (issue.code === hiddenPublicationIssueCode) {
      restricted = true;
      continue;
    }
    if (issue.fieldId === null) {
      entryIssues.push(
        StudioPublicationEntryIssue.make({ code: issue.code, message: issue.message }),
      );
      continue;
    }
    if (!visibleIds.has(issue.fieldId)) {
      restricted = true;
      continue;
    }
    const scope = scopes.get(issue.fieldId) ?? "localized";
    fieldIssues.push(
      EntryValidationIssue.make({
        fieldId: issue.fieldId,
        path: `field/${issue.fieldId}`,
        scope,
        localeId: scope === "shared" ? null : locale.localeId,
        locale: scope === "shared" ? null : locale.locale,
        code: issue.code,
        message: "This field value is invalid.",
      }),
    );
  }
  return { fieldIssues, entryIssues, restricted };
}

export function projectStudioPublicationPlan(
  plan: EntryPublicationPlan,
  form: StudioFormProjection,
): StudioPublicationPlan {
  const projected = projectPublicationIssues(plan.issues, form, plan);
  return Schema.decodeUnknownSync(StudioPublicationPlan, { onExcessProperty: "error" })({
    authorityHash: plan.authorityHash,
    stateVersion: plan.stateVersion,
    currentPublicationId: plan.currentPublicationId,
    schemaRevisionId: plan.schemaRevisionId,
    contractHash: plan.contractHash,
    sharedVersion: plan.sharedVersion,
    sharedRevisionId: plan.sharedRevisionId,
    localizedVersion: plan.localizedVersion,
    localizedRevisionId: plan.localizedRevisionId,
    wouldCreatePublication: plan.wouldCreatePublication,
    validation: StudioEntryValidation.make({
      status: plan.valid ? "valid" : projected.restricted ? "restricted_issues" : "invalid",
      issues: projected.fieldIssues,
      capped: plan.capped,
    }),
    entryIssues: projected.entryIssues,
  });
}

export function projectStudioPublicationFailureDetails(
  issues: ReadonlyArray<EntryPublicationValidationIssue>,
  form: StudioFormProjection,
  locale: {
    readonly localeId: EntryPublicationPlan["localeId"];
    readonly locale: EntryPublicationPlan["locale"];
  },
): ReadonlyArray<ApiErrorDetail> {
  const projected = projectPublicationIssues(issues, form, locale);
  const visible = [
    ...projected.fieldIssues.map((issue) =>
      ApiErrorDetail.make({ path: issue.path, code: issue.code, message: issue.message }),
    ),
    ...projected.entryIssues.map((issue) =>
      ApiErrorDetail.make({ path: "entry", code: issue.code, message: issue.message }),
    ),
  ];
  const hidden = ApiErrorDetail.make({
    path: "entry",
    code: hiddenPublicationIssueCode,
    message:
      "A field unavailable to your role blocks publication. Ask an authorized content or schema manager to resolve it.",
  });
  const details = projected.restricted || visible.length === 0 ? [hidden, ...visible] : visible;
  return details.slice(0, studioContentLimits.maximumErrorDetails);
}
