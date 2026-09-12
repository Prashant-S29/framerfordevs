import { Schema } from "effect";

import { ApiSuccessSchema } from "../response/api";

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
  Schema.transform(Schema.String, {
    decode: (value) => value.trim().normalize("NFC"),
    encode: (value) => value,
  }),
);

const SafeName = NormalizedString.pipe(
  Schema.minLength(1),
  Schema.maxLength(100),
  Schema.filter((value) => !hasControlCharacter(value), {
    message: () => "Names cannot contain control characters.",
  }),
);

export const WorkspaceId = Schema.UUID.pipe(Schema.brand("WorkspaceId"));
export type WorkspaceId = typeof WorkspaceId.Type;

export const WorkspaceMembershipId = Schema.UUID.pipe(Schema.brand("WorkspaceMembershipId"));
export type WorkspaceMembershipId = typeof WorkspaceMembershipId.Type;

export const ProjectId = Schema.UUID.pipe(Schema.brand("ProjectId"));
export type ProjectId = typeof ProjectId.Type;

export const EnvironmentId = Schema.UUID.pipe(Schema.brand("EnvironmentId"));
export type EnvironmentId = typeof EnvironmentId.Type;

export const ProjectCapabilityId = Schema.UUID.pipe(Schema.brand("ProjectCapabilityId"));
export type ProjectCapabilityId = typeof ProjectCapabilityId.Type;

export const AuditEventId = Schema.UUID.pipe(Schema.brand("AuditEventId"));
export type AuditEventId = typeof AuditEventId.Type;

export const AuthUserId = Schema.String.pipe(
  Schema.minLength(1),
  Schema.maxLength(255),
  Schema.brand("AuthUserId"),
);
export type AuthUserId = typeof AuthUserId.Type;

export const WorkspaceName = SafeName.pipe(Schema.brand("WorkspaceName"));
export type WorkspaceName = typeof WorkspaceName.Type;

export const ProjectName = SafeName.pipe(Schema.brand("ProjectName"));
export type ProjectName = typeof ProjectName.Type;

export const ProjectKey = NormalizedString.pipe(
  Schema.minLength(1),
  Schema.maxLength(63),
  Schema.filter(
    (value) => projectKeyPattern.test(value) && !value.includes("--") && !value.endsWith("-"),
    { message: () => "Use lowercase letters, numbers, and single hyphens." },
  ),
  Schema.brand("ProjectKey"),
);
export type ProjectKey = typeof ProjectKey.Type;

export const ProjectDescription = NormalizedString.pipe(
  Schema.maxLength(500),
  Schema.brand("ProjectDescription"),
);
export type ProjectDescription = typeof ProjectDescription.Type;

export const ResourceVersion = Schema.Number.pipe(
  Schema.int(),
  Schema.greaterThanOrEqualTo(1),
  Schema.brand("ResourceVersion"),
);
export type ResourceVersion = typeof ResourceVersion.Type;

export const PageLimit = Schema.Number.pipe(
  Schema.int(),
  Schema.between(1, 50),
  Schema.brand("PageLimit"),
);
export type PageLimit = typeof PageLimit.Type;

export const IsoDateTime = Schema.String.pipe(
  Schema.pattern(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u),
  Schema.brand("IsoDateTime"),
);
export type IsoDateTime = typeof IsoDateTime.Type;

export const Cursor = Schema.String.pipe(
  Schema.minLength(1),
  Schema.maxLength(512),
  Schema.pattern(/^[A-Za-z0-9_-]+$/u),
  Schema.brand("Cursor"),
);
export type Cursor = typeof Cursor.Type;

export const ProjectListStatus = Schema.Literal("active", "archived");
export type ProjectListStatus = typeof ProjectListStatus.Type;

export const CapabilityKey = Schema.Literal("cms");
export type CapabilityKey = typeof CapabilityKey.Type;

export const CapabilityStatus = Schema.Literal("enabled", "disabled");
export type CapabilityStatus = typeof CapabilityStatus.Type;

export const WorkspaceRole = Schema.Literal("owner", "collaborator");
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
  initialCapabilities: Schema.optionalWith(
    Schema.Array(Schema.Literal("cms")).pipe(
      Schema.maxItems(1),
      Schema.filter((capabilities) => new Set(capabilities).size === capabilities.length, {
        message: () => "Initial capabilities must be unique.",
      }),
    ),
    { default: () => [] },
  ),
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

export const CreateWorkspaceInputSchema = Schema.standardSchemaV1(CreateWorkspaceInput);
export const ListWorkspacesInputSchema = Schema.standardSchemaV1(ListWorkspacesInput);
export const CreateProjectInputSchema = Schema.standardSchemaV1(CreateProjectInput);
export const ListProjectsInputSchema = Schema.standardSchemaV1(ListProjectsInput);
export const GetProjectInputSchema = Schema.standardSchemaV1(GetProjectInput);
export const UpdateProjectInputSchema = Schema.standardSchemaV1(UpdateProjectInput);
export const ArchiveProjectInputSchema = Schema.standardSchemaV1(ArchiveProjectInput);
export const RestoreProjectInputSchema = Schema.standardSchemaV1(RestoreProjectInput);
export const EnableCapabilityInputSchema = Schema.standardSchemaV1(EnableCapabilityInput);

export const WorkspaceOutputSchema = Schema.standardSchemaV1(ApiSuccessSchema(Workspace));
export const WorkspacePageOutputSchema = Schema.standardSchemaV1(ApiSuccessSchema(WorkspacePage));
export const ProjectOutputSchema = Schema.standardSchemaV1(ApiSuccessSchema(Project));
export const ProjectPageOutputSchema = Schema.standardSchemaV1(ApiSuccessSchema(ProjectPage));
export const CapabilityOutputSchema = Schema.standardSchemaV1(ApiSuccessSchema(Capability));
