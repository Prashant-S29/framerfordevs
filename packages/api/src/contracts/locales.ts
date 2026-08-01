import { Schema } from "effect";

import { ApiSuccessSchema } from "./api-response";
import {
  canonicalizeLocaleTag,
  localeTagMaxLength,
  localeTagValidationMessage,
  validateAndCanonicalizeLocaleTag,
} from "./locale-tag";
import { IsoDateTime, ProjectId, ResourceVersion, WorkspaceId } from "./platform";

export { canonicalizeLocaleTag } from "./locale-tag";

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
  Schema.transform(Schema.String, {
    decode: (value) => value.trim(),
    encode: (value) => value,
  }),
  Schema.maxLength(localeTagMaxLength),
  Schema.filter((value) => {
    const result = validateAndCanonicalizeLocaleTag(value);
    return result.ok ? true : localeTagValidationMessage(result.code);
  }),
);

export const LocaleTag = TrimmedLocaleTag.pipe(
  Schema.transform(Schema.String, {
    decode: (value) => canonicalizeLocaleTag(value) ?? value,
    encode: (value) => value,
  }),
  Schema.brand("LocaleTag"),
);
export type LocaleTag = typeof LocaleTag.Type;

const NormalizedString = Schema.String.pipe(
  Schema.transform(Schema.String, {
    decode: (value) => value.trim().normalize("NFC"),
    encode: (value) => value,
  }),
);

export const LocaleDisplayName = NormalizedString.pipe(
  Schema.minLength(1),
  Schema.maxLength(100),
  Schema.filter((value) => !hasControlCharacter(value), {
    message: () => "Locale display names cannot contain control characters.",
  }),
  Schema.brand("LocaleDisplayName"),
);
export type LocaleDisplayName = typeof LocaleDisplayName.Type;

export const ProjectLocaleId = Schema.UUID.pipe(Schema.brand("ProjectLocaleId"));
export type ProjectLocaleId = typeof ProjectLocaleId.Type;

export const ProjectLocaleStatus = Schema.Literal("enabled", "disabled", "removed");
export type ProjectLocaleStatus = typeof ProjectLocaleStatus.Type;

export const ProjectLocaleListView = Schema.Literal("enabled", "settings");
export type ProjectLocaleListView = typeof ProjectLocaleListView.Type;

export const ProjectLocalePosition = Schema.Number.pipe(
  Schema.int(),
  Schema.greaterThanOrEqualTo(0),
);

export const LocaleDependencyCount = Schema.Number.pipe(Schema.int(), Schema.between(0, 100));

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

export const ProjectLocaleOrder = Schema.Array(ProjectLocaleOrderItem).pipe(
  Schema.minItems(1),
  Schema.maxItems(100),
  Schema.filter((items) => new Set(items.map((item) => item.localeId)).size === items.length, {
    message: () => "Locale order must contain unique locale IDs.",
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

export const ListProjectLocalesInputSchema = Schema.standardSchemaV1(ListProjectLocalesInput);
export const CreateProjectLocaleInputSchema = Schema.standardSchemaV1(CreateProjectLocaleInput);
export const UpdateProjectLocaleDisplayNameInputSchema = Schema.standardSchemaV1(
  UpdateProjectLocaleDisplayNameInput,
);
export const ReorderProjectLocalesInputSchema = Schema.standardSchemaV1(ReorderProjectLocalesInput);
export const UpdateProjectLocaleStatusInputSchema = Schema.standardSchemaV1(
  UpdateProjectLocaleStatusInput,
);

export const ProjectLocaleOutputSchema = Schema.standardSchemaV1(ApiSuccessSchema(ProjectLocale));
export const ProjectLocaleListOutputSchema = Schema.standardSchemaV1(
  ApiSuccessSchema(ProjectLocaleList),
);
