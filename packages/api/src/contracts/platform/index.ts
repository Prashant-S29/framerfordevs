import { Schema, SchemaTransformation, Effect } from "effect";

import { ApiSuccessSchema } from "../response/api";

import { Uuid } from "../uuid";
const projectKeyPattern = /^[a-z][a-z0-9-]{0,62}$/u;

function hasControlCharacter(value: string): boolean {
  for (const character of value) {
    const codePoint = character.codePointAt(0);
    if (codePoint !== undefined && (codePoint <= 31 || (codePoint >= 127 && codePoint <= 159))) {
      return true;
    }
  }
  return false;
}

const NormalizedString = Schema.String.pipe(
  Schema.decodeTo(
    Schema.String,
    SchemaTransformation.transform({
      decode: (value) => value.trim().normalize("NFC"),
      encode: (value) => value,
    }),
  ),
);

const SafeName = NormalizedString.check(
  Schema.isMinLength(1),
  Schema.isMaxLength(100),
  Schema.makeFilter((value) => !hasControlCharacter(value), {
    message: "Names cannot contain control characters.",
  }),
);

export const WorkspaceId = Uuid.pipe(Schema.brand("WorkspaceId"));
export type WorkspaceId = typeof WorkspaceId.Type;

export const WorkspaceMembershipId = Uuid.pipe(Schema.brand("WorkspaceMembershipId"));
export type WorkspaceMembershipId = typeof WorkspaceMembershipId.Type;

export const ProjectId = Uuid.pipe(Schema.brand("ProjectId"));
export type ProjectId = typeof ProjectId.Type;

export const EnvironmentId = Uuid.pipe(Schema.brand("EnvironmentId"));
export type EnvironmentId = typeof EnvironmentId.Type;

export const ProjectCapabilityId = Uuid.pipe(Schema.brand("ProjectCapabilityId"));
export type ProjectCapabilityId = typeof ProjectCapabilityId.Type;

export const AuditEventId = Uuid.pipe(Schema.brand("AuditEventId"));
export type AuditEventId = typeof AuditEventId.Type;

export const AuthUserId = Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(255)).pipe(
  Schema.brand("AuthUserId"),
);
export type AuthUserId = typeof AuthUserId.Type;

export const WorkspaceName = SafeName.pipe(Schema.brand("WorkspaceName"));
export type WorkspaceName = typeof WorkspaceName.Type;

export const ProjectName = SafeName.pipe(Schema.brand("ProjectName"));
export type ProjectName = typeof ProjectName.Type;

export const ProjectKey = NormalizedString.check(
  Schema.isMinLength(1),
  Schema.isMaxLength(63),
  Schema.makeFilter(
    (value) => projectKeyPattern.test(value) && !value.includes("--") && !value.endsWith("-"),
    { message: "Use lowercase letters, numbers, and single hyphens." },
  ),
).pipe(Schema.brand("ProjectKey"));
export type ProjectKey = typeof ProjectKey.Type;

export const ProjectDescription = NormalizedString.check(Schema.isMaxLength(500)).pipe(
  Schema.brand("ProjectDescription"),
);
export type ProjectDescription = typeof ProjectDescription.Type;

export const ResourceVersion = Schema.Number.check(
  Schema.isInt(),
  Schema.isGreaterThanOrEqualTo(1),
).pipe(Schema.brand("ResourceVersion"));
export type ResourceVersion = typeof ResourceVersion.Type;

export const PageLimit = Schema.Number.check(
  Schema.isInt(),
  Schema.isBetween({ minimum: 1, maximum: 50 }),
).pipe(Schema.brand("PageLimit"));
export type PageLimit = typeof PageLimit.Type;

export const IsoDateTime = Schema.String.check(
  Schema.isPattern(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u),
).pipe(Schema.brand("IsoDateTime"));
export type IsoDateTime = typeof IsoDateTime.Type;

export const Cursor = Schema.String.check(
  Schema.isMinLength(1),
  Schema.isMaxLength(512),
  Schema.isPattern(/^[A-Za-z0-9_-]+$/u),
).pipe(Schema.brand("Cursor"));
export type Cursor = typeof Cursor.Type;

export const ProjectListStatus = Schema.Literals(["active", "archived"]);
export type ProjectListStatus = typeof ProjectListStatus.Type;

export const CapabilityKey = Schema.Literal("cms");
export type CapabilityKey = typeof CapabilityKey.Type;

export const CapabilityStatus = Schema.Literals(["enabled", "disabled"]);
export type CapabilityStatus = typeof CapabilityStatus.Type;

export const WorkspaceRole = Schema.Literals(["owner", "collaborator"]);
export type WorkspaceRole = typeof WorkspaceRole.Type;

export class CreateWorkspaceInput extends Schema.Class<CreateWorkspaceInput>(
  "CreateWorkspaceInput",
)({
  name: WorkspaceName,
}) {}

export class ListWorkspacesInput extends Schema.Class<ListWorkspacesInput>("ListWorkspacesInput")({
  cursor: Schema.NullOr(Cursor),
  limit: PageLimit,
}) {}

export class CreateProjectInput extends Schema.Class<CreateProjectInput>("CreateProjectInput")({
  workspaceId: WorkspaceId,
  name: ProjectName,
  key: ProjectKey,
  description: Schema.NullOr(ProjectDescription),
  initialCapabilities: Schema.Array(Schema.Literal("cms"))
    .check(
      Schema.isMaxLength(1),
      Schema.makeFilter((capabilities) => new Set(capabilities).size === capabilities.length, {
        message: "Initial capabilities must be unique.",
      }),
    )
    .pipe(Schema.withDecodingDefaultType(Effect.sync(() => []))),
}) {}

export class ListProjectsInput extends Schema.Class<ListProjectsInput>("ListProjectsInput")({
  workspaceId: WorkspaceId,
  status: ProjectListStatus,
  cursor: Schema.NullOr(Cursor),
  limit: PageLimit,
}) {}

export class GetProjectInput extends Schema.Class<GetProjectInput>("GetProjectInput")({
  projectId: ProjectId,
}) {}

export class UpdateProjectInput extends Schema.Class<UpdateProjectInput>("UpdateProjectInput")({
  projectId: ProjectId,
  version: ResourceVersion,
  name: ProjectName,
  description: Schema.NullOr(ProjectDescription),
}) {}

export class ArchiveProjectInput extends Schema.Class<ArchiveProjectInput>("ArchiveProjectInput")({
  projectId: ProjectId,
  version: ResourceVersion,
}) {}

export class RestoreProjectInput extends Schema.Class<RestoreProjectInput>("RestoreProjectInput")({
  projectId: ProjectId,
  version: ResourceVersion,
}) {}

export class EnableCapabilityInput extends Schema.Class<EnableCapabilityInput>(
  "EnableCapabilityInput",
)({
  projectId: ProjectId,
  capability: CapabilityKey,
}) {}

export class Workspace extends Schema.Class<Workspace>("Workspace")({
  id: WorkspaceId,
  name: WorkspaceName,
  version: ResourceVersion,
  role: WorkspaceRole,
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
}) {}

export class Environment extends Schema.Class<Environment>("Environment")({
  id: EnvironmentId,
  key: Schema.Literal("main"),
  name: Schema.Literal("main"),
  isPrimary: Schema.Literal(true),
  createdAt: IsoDateTime,
}) {}

export class Capability extends Schema.Class<Capability>("Capability")({
  id: Schema.NullOr(ProjectCapabilityId),
  key: CapabilityKey,
  status: CapabilityStatus,
  version: Schema.NullOr(ResourceVersion),
  changedAt: Schema.NullOr(IsoDateTime),
}) {}

export class ProjectSummary extends Schema.Class<ProjectSummary>("ProjectSummary")({
  id: ProjectId,
  workspaceId: WorkspaceId,
  name: ProjectName,
  key: ProjectKey,
  description: Schema.NullOr(ProjectDescription),
  version: ResourceVersion,
  archivedAt: Schema.NullOr(IsoDateTime),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
}) {}

export class Project extends Schema.Class<Project>("Project")({
  id: ProjectId,
  workspaceId: WorkspaceId,
  name: ProjectName,
  key: ProjectKey,
  description: Schema.NullOr(ProjectDescription),
  version: ResourceVersion,
  archivedAt: Schema.NullOr(IsoDateTime),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
  environment: Environment,
  capabilities: Schema.Array(Capability),
}) {}

export class WorkspacePage extends Schema.Class<WorkspacePage>("WorkspacePage")({
  items: Schema.Array(Workspace),
  nextCursor: Schema.NullOr(Cursor),
}) {}

export class ProjectPage extends Schema.Class<ProjectPage>("ProjectPage")({
  items: Schema.Array(ProjectSummary),
  nextCursor: Schema.NullOr(Cursor),
}) {}

export const CreateWorkspaceInputSchema = Schema.toStandardSchemaV1(CreateWorkspaceInput, {
  parseOptions: { onExcessProperty: "error" },
});
export const ListWorkspacesInputSchema = Schema.toStandardSchemaV1(ListWorkspacesInput, {
  parseOptions: { onExcessProperty: "error" },
});
export const CreateProjectInputSchema = Schema.toStandardSchemaV1(CreateProjectInput, {
  parseOptions: { onExcessProperty: "error" },
});
export const ListProjectsInputSchema = Schema.toStandardSchemaV1(ListProjectsInput, {
  parseOptions: { onExcessProperty: "error" },
});
export const GetProjectInputSchema = Schema.toStandardSchemaV1(GetProjectInput, {
  parseOptions: { onExcessProperty: "error" },
});
export const UpdateProjectInputSchema = Schema.toStandardSchemaV1(UpdateProjectInput, {
  parseOptions: { onExcessProperty: "error" },
});
export const ArchiveProjectInputSchema = Schema.toStandardSchemaV1(ArchiveProjectInput, {
  parseOptions: { onExcessProperty: "error" },
});
export const RestoreProjectInputSchema = Schema.toStandardSchemaV1(RestoreProjectInput, {
  parseOptions: { onExcessProperty: "error" },
});
export const EnableCapabilityInputSchema = Schema.toStandardSchemaV1(EnableCapabilityInput, {
  parseOptions: { onExcessProperty: "error" },
});

export const WorkspaceOutputSchema = Schema.toStandardSchemaV1(ApiSuccessSchema(Workspace));
export const WorkspacePageOutputSchema = Schema.toStandardSchemaV1(ApiSuccessSchema(WorkspacePage));
export const ProjectOutputSchema = Schema.toStandardSchemaV1(ApiSuccessSchema(Project));
export const ProjectPageOutputSchema = Schema.toStandardSchemaV1(ApiSuccessSchema(ProjectPage));
export const CapabilityOutputSchema = Schema.toStandardSchemaV1(ApiSuccessSchema(Capability));
