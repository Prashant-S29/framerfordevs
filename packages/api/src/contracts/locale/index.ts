import { Schema, SchemaTransformation } from "effect";

import { ApiSuccessSchema } from "../response/api";
import {
  canonicalizeLocaleTag,
  localeTagMaxLength,
  localeTagValidationMessage,
  validateAndCanonicalizeLocaleTag,
} from "./tag";
import { IsoDateTime, ProjectId, ResourceVersion, WorkspaceId } from "../platform";

import * as SchemaStrict from "../../lib/schema-strict";
import { UuidValue } from "../uuid";
export { canonicalizeLocaleTag } from "./tag";

function hasControlCharacter(value: string): boolean {
  for (const character of value) {
    const codePoint = character.codePointAt(0);
    if (codePoint !== undefined && (codePoint <= 31 || (codePoint >= 127 && codePoint <= 159))) {
      return true;
    }
  }
  return false;
}

const TrimmedLocaleTag = Schema.String.pipe(
  Schema.decodeTo(
    Schema.String,
    SchemaTransformation.transform({ decode: (value) => value.trim(), encode: (value) => value }),
  ),
).check(
  Schema.isMaxLength(localeTagMaxLength),
  Schema.makeFilter((value) => {
    const result = validateAndCanonicalizeLocaleTag(value);
    return result.ok ? true : localeTagValidationMessage(result.code);
  }),
);

export const LocaleTag = TrimmedLocaleTag.pipe(
  Schema.decodeTo(
    Schema.String,
    SchemaTransformation.transform({
      decode: (value) => canonicalizeLocaleTag(value) ?? value,
      encode: (value) => value,
    }),
  ),
  Schema.brand("LocaleTag"),
);
export type LocaleTag = typeof LocaleTag.Type;

const NormalizedString = Schema.String.pipe(
  Schema.decodeTo(
    Schema.String,
    SchemaTransformation.transform({
      decode: (value) => value.trim().normalize("NFC"),
      encode: (value) => value,
    }),
  ),
);

export const LocaleDisplayName = NormalizedString.check(
  Schema.isMinLength(1),
  Schema.isMaxLength(100),
  Schema.makeFilter((value) => !hasControlCharacter(value), {
    message: "Locale display names cannot contain control characters.",
  }),
).pipe(Schema.brand("LocaleDisplayName"));
export type LocaleDisplayName = typeof LocaleDisplayName.Type;

export const ProjectLocaleId = UuidValue.pipe(Schema.brand("ProjectLocaleId"));
export type ProjectLocaleId = typeof ProjectLocaleId.Type;

export const ProjectLocaleStatus = Schema.Literals(["enabled", "disabled", "removed"]);
export type ProjectLocaleStatus = typeof ProjectLocaleStatus.Type;

export const ProjectLocaleListView = Schema.Literals(["enabled", "settings"]);
export type ProjectLocaleListView = typeof ProjectLocaleListView.Type;

export const ProjectLocalePosition = Schema.Number.check(
  Schema.isInt(),
  Schema.isGreaterThanOrEqualTo(0),
);

export const LocaleDependencyCount = Schema.Number.check(
  Schema.isInt(),
  Schema.isBetween({ minimum: 0, maximum: 100 }),
);

export const ExplicitLocaleContextFields = {
  locale: LocaleTag,
};

export class ExplicitLocaleContext extends Schema.Class<ExplicitLocaleContext>(
  "ExplicitLocaleContext",
)(ExplicitLocaleContextFields) {}

export class ListProjectLocalesInput extends Schema.Class<ListProjectLocalesInput>(
  "ListProjectLocalesInput",
)({
  projectId: ProjectId,
  view: ProjectLocaleListView,
  includeRemoved: Schema.Boolean,
}) {}

export class CreateProjectLocaleInput extends Schema.Class<CreateProjectLocaleInput>(
  "CreateProjectLocaleInput",
)({
  projectId: ProjectId,
  tag: LocaleTag,
  displayName: LocaleDisplayName,
}) {}

export class UpdateProjectLocaleDisplayNameInput extends Schema.Class<UpdateProjectLocaleDisplayNameInput>(
  "UpdateProjectLocaleDisplayNameInput",
)({
  projectId: ProjectId,
  localeId: ProjectLocaleId,
  version: ResourceVersion,
  displayName: LocaleDisplayName,
}) {}

export class ProjectLocaleOrderItem extends Schema.Class<ProjectLocaleOrderItem>(
  "ProjectLocaleOrderItem",
)({
  localeId: ProjectLocaleId,
  version: ResourceVersion,
}) {}

export const ProjectLocaleOrder = Schema.Array(ProjectLocaleOrderItem).check(
  Schema.isMinLength(1),
  Schema.isMaxLength(100),
  Schema.makeFilter((items) => new Set(items.map((item) => item.localeId)).size === items.length, {
    message: "Locale order must contain unique locale IDs.",
  }),
);
export type ProjectLocaleOrder = typeof ProjectLocaleOrder.Type;

export class ReorderProjectLocalesInput extends Schema.Class<ReorderProjectLocalesInput>(
  "ReorderProjectLocalesInput",
)({
  projectId: ProjectId,
  locales: ProjectLocaleOrder,
}) {}

export class UpdateProjectLocaleStatusInput extends Schema.Class<UpdateProjectLocaleStatusInput>(
  "UpdateProjectLocaleStatusInput",
)({
  projectId: ProjectId,
  localeId: ProjectLocaleId,
  version: ResourceVersion,
  status: ProjectLocaleStatus,
  confirmDraftImpact: Schema.Boolean,
}) {}

export class ProjectLocale extends Schema.Class<ProjectLocale>("ProjectLocale")({
  id: ProjectLocaleId,
  workspaceId: WorkspaceId,
  projectId: ProjectId,
  tag: LocaleTag,
  displayName: LocaleDisplayName,
  status: ProjectLocaleStatus,
  position: Schema.NullOr(ProjectLocalePosition),
  version: ResourceVersion,
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
}) {}

export class ProjectLocaleList extends Schema.Class<ProjectLocaleList>("ProjectLocaleList")({
  items: Schema.Array(ProjectLocale),
}) {}

export class LocaleDependencySummary extends Schema.Class<LocaleDependencySummary>(
  "LocaleDependencySummary",
)({
  draftCount: LocaleDependencyCount,
  currentPublicationCount: LocaleDependencyCount,
  draftCountCapped: Schema.Boolean,
  currentPublicationCountCapped: Schema.Boolean,
}) {}

export class ResolvedProjectLocale extends Schema.Class<ResolvedProjectLocale>(
  "ResolvedProjectLocale",
)({
  id: ProjectLocaleId,
  workspaceId: WorkspaceId,
  projectId: ProjectId,
  tag: LocaleTag,
}) {}

export const ListProjectLocalesInputSchema =
  SchemaStrict.toStandardSchemaV1(ListProjectLocalesInput);
export const CreateProjectLocaleInputSchema =
  SchemaStrict.toStandardSchemaV1(CreateProjectLocaleInput);
export const UpdateProjectLocaleDisplayNameInputSchema = SchemaStrict.toStandardSchemaV1(
  UpdateProjectLocaleDisplayNameInput,
);
export const ReorderProjectLocalesInputSchema = SchemaStrict.toStandardSchemaV1(
  ReorderProjectLocalesInput,
);
export const UpdateProjectLocaleStatusInputSchema = SchemaStrict.toStandardSchemaV1(
  UpdateProjectLocaleStatusInput,
);

export const ProjectLocaleOutputSchema = SchemaStrict.toStandardSchemaV1(
  ApiSuccessSchema(ProjectLocale),
);
export const ProjectLocaleListOutputSchema = SchemaStrict.toStandardSchemaV1(
  ApiSuccessSchema(ProjectLocaleList),
);
