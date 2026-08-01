import { Schema } from "effect";

import { ApiSuccessSchema } from "./api-response";
import { ProjectLocaleId } from "./locales";
import {
  AuthUserId,
  Cursor,
  EnvironmentId,
  IsoDateTime,
  PageLimit,
  ProjectId,
  ResourceVersion,
  WorkspaceId,
} from "./platform";

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

export const projectRoleValues = [
  "owner",
  "developer",
  "content_admin",
  "editor",
  "reviewer",
  "client_editor",
  "read_only",
] as const;

export const projectPermissionActionValues = [
  "project.read",
  "project.update",
  "project.archive",
  "project.capability.manage",
  "project.member.read",
  "project.member.invite",
  "project.member.role.update",
  "project.member.locale.update",
  "project.member.remove",
  "project.credential.read",
  "project.credential.issue",
  "project.credential.rotate",
  "project.credential.revoke",
  "locale.read",
  "locale.manage",
  "schema.read",
  "schema.write",
  "schema.publish",
  "content.read",
  "content.write",
  "content.review",
  "content.publish",
  "webhook.read",
  "webhook.manage",
] as const;

export const credentialScopeValues = [
  "project.read",
  "project.update",
  "project.capability.manage",
  "locale.read",
  "locale.manage",
  "schema.read",
  "schema.write",
  "schema.publish",
  "content.read",
  "content.write",
  "content.review",
  "content.publish",
  "webhook.read",
  "webhook.manage",
  "delivery.read",
  "preview.read",
] as const;

export const ProjectMembershipId = Schema.UUID.pipe(Schema.brand("ProjectMembershipId"));
export type ProjectMembershipId = typeof ProjectMembershipId.Type;

export const ProjectInvitationId = Schema.UUID.pipe(Schema.brand("ProjectInvitationId"));
export type ProjectInvitationId = typeof ProjectInvitationId.Type;

export const ApiCredentialId = Schema.UUID.pipe(Schema.brand("ApiCredentialId"));
export type ApiCredentialId = typeof ApiCredentialId.Type;

export const ProjectRole = Schema.Literal(...projectRoleValues);
export type ProjectRole = typeof ProjectRole.Type;

export const LocaleAccessMode = Schema.Literal("all", "selected", "none");
export type LocaleAccessMode = typeof LocaleAccessMode.Type;

export const SelectedProjectLocaleIds = Schema.Array(ProjectLocaleId).pipe(
  Schema.minItems(1),
  Schema.maxItems(100),
  Schema.filter((localeIds) => new Set(localeIds).size === localeIds.length, {
    message: () => "Selected locale IDs must be unique.",
  }),
);
export type SelectedProjectLocaleIds = typeof SelectedProjectLocaleIds.Type;

export class AllProjectLocaleAccess extends Schema.Class<AllProjectLocaleAccess>(
  "AllProjectLocaleAccess",
)({
  mode: Schema.Literal("all"),
}) {}

export class SelectedProjectLocaleAccess extends Schema.Class<SelectedProjectLocaleAccess>(
  "SelectedProjectLocaleAccess",
)({
  mode: Schema.Literal("selected"),
  localeIds: SelectedProjectLocaleIds,
}) {}

export class NoProjectLocaleAccess extends Schema.Class<NoProjectLocaleAccess>(
  "NoProjectLocaleAccess",
)({
  mode: Schema.Literal("none"),
}) {}

export const ProjectLocaleAccess = Schema.Union(
  AllProjectLocaleAccess,
  SelectedProjectLocaleAccess,
  NoProjectLocaleAccess,
);
export type ProjectLocaleAccess = typeof ProjectLocaleAccess.Type;

export const ProjectPermissionAction = Schema.Literal(...projectPermissionActionValues);
export type ProjectPermissionAction = typeof ProjectPermissionAction.Type;

export const ProjectInvitationStatus = Schema.Literal("pending", "accepted", "revoked", "expired");
export type ProjectInvitationStatus = typeof ProjectInvitationStatus.Type;

export const CredentialFamily = Schema.Literal("management", "delivery", "preview");
export type CredentialFamily = typeof CredentialFamily.Type;

export const CredentialScope = Schema.Literal(...credentialScopeValues);
export type CredentialScope = typeof CredentialScope.Type;

export const CredentialScopes = Schema.Array(CredentialScope).pipe(
  Schema.minItems(1),
  Schema.maxItems(16),
  Schema.filter((scopes) => new Set(scopes).size === scopes.length, {
    message: () => "Credential scopes must be unique.",
  }),
);
export type CredentialScopes = typeof CredentialScopes.Type;

export const CanonicalEmail = NormalizedString.pipe(
  Schema.transform(Schema.String, {
    decode: (value) => value.toLowerCase(),
    encode: (value) => value,
  }),
  Schema.minLength(3),
  Schema.maxLength(320),
  Schema.pattern(/^[^\s@]+@[^\s@]+\.[^\s@]+$/u),
  Schema.filter((value) => !hasControlCharacter(value), {
    message: () => "Email addresses cannot contain control characters.",
  }),
  Schema.brand("CanonicalEmail"),
);
export type CanonicalEmail = typeof CanonicalEmail.Type;

export const InvitationToken = Schema.String.pipe(
  Schema.length(43),
  Schema.pattern(/^[A-Za-z0-9_-]+$/u),
  Schema.brand("InvitationToken"),
);
export type InvitationToken = typeof InvitationToken.Type;

export const CredentialName = NormalizedString.pipe(
  Schema.minLength(1),
  Schema.maxLength(100),
  Schema.filter((value) => !hasControlCharacter(value), {
    message: () => "Credential names cannot contain control characters.",
  }),
  Schema.brand("CredentialName"),
);
export type CredentialName = typeof CredentialName.Type;

export const CredentialKeyPrefix = Schema.String.pipe(
  Schema.minLength(44),
  Schema.maxLength(45),
  Schema.pattern(
    /^ffd_(?:mgmt|del|prev)_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u,
  ),
  Schema.brand("CredentialKeyPrefix"),
);
export type CredentialKeyPrefix = typeof CredentialKeyPrefix.Type;

export const CredentialSecret = Schema.String.pipe(
  Schema.minLength(88),
  Schema.maxLength(89),
  Schema.pattern(
    /^ffd_(?:mgmt|del|prev)_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}_[A-Za-z0-9_-]{43}$/u,
  ),
  Schema.brand("CredentialSecret"),
);
export type CredentialSecret = typeof CredentialSecret.Type;

export class CreateProjectInvitationInput extends Schema.Class<CreateProjectInvitationInput>(
  "CreateProjectInvitationInput",
)({
  projectId: ProjectId,
  email: CanonicalEmail,
  role: ProjectRole,
}) {}

export class ListProjectInvitationsInput extends Schema.Class<ListProjectInvitationsInput>(
  "ListProjectInvitationsInput",
)({
  projectId: ProjectId,
  cursor: Schema.NullOr(Cursor),
  limit: PageLimit,
}) {}

export class InspectProjectInvitationInput extends Schema.Class<InspectProjectInvitationInput>(
  "InspectProjectInvitationInput",
)({
  token: InvitationToken,
}) {}

export class AcceptProjectInvitationInput extends Schema.Class<AcceptProjectInvitationInput>(
  "AcceptProjectInvitationInput",
)({
  token: InvitationToken,
}) {}

export class RevokeProjectInvitationInput extends Schema.Class<RevokeProjectInvitationInput>(
  "RevokeProjectInvitationInput",
)({
  invitationId: ProjectInvitationId,
  version: ResourceVersion,
}) {}

export class GetCurrentProjectAccessInput extends Schema.Class<GetCurrentProjectAccessInput>(
  "GetCurrentProjectAccessInput",
)({
  projectId: ProjectId,
}) {}

export class ListProjectMembersInput extends Schema.Class<ListProjectMembersInput>(
  "ListProjectMembersInput",
)({
  projectId: ProjectId,
  cursor: Schema.NullOr(Cursor),
  limit: PageLimit,
}) {}

export class UpdateProjectMemberRoleInput extends Schema.Class<UpdateProjectMemberRoleInput>(
  "UpdateProjectMemberRoleInput",
)({
  membershipId: ProjectMembershipId,
  version: ResourceVersion,
  role: ProjectRole,
}) {}

export class RemoveProjectMemberInput extends Schema.Class<RemoveProjectMemberInput>(
  "RemoveProjectMemberInput",
)({
  membershipId: ProjectMembershipId,
  version: ResourceVersion,
}) {}

export class UpdateProjectMemberLocaleAccessInput extends Schema.Class<UpdateProjectMemberLocaleAccessInput>(
  "UpdateProjectMemberLocaleAccessInput",
)({
  membershipId: ProjectMembershipId,
  version: ResourceVersion,
  access: ProjectLocaleAccess,
}) {}

export class IssueApiCredentialInput extends Schema.Class<IssueApiCredentialInput>(
  "IssueApiCredentialInput",
)({
  projectId: ProjectId,
  environmentId: EnvironmentId,
  family: CredentialFamily,
  name: CredentialName,
  scopes: CredentialScopes,
  expiresAt: Schema.NullOr(IsoDateTime),
}) {}

export class ListApiCredentialsInput extends Schema.Class<ListApiCredentialsInput>(
  "ListApiCredentialsInput",
)({
  projectId: ProjectId,
  environmentId: EnvironmentId,
  cursor: Schema.NullOr(Cursor),
  limit: PageLimit,
}) {}

export class RotateApiCredentialInput extends Schema.Class<RotateApiCredentialInput>(
  "RotateApiCredentialInput",
)({
  credentialId: ApiCredentialId,
  version: ResourceVersion,
}) {}

export class RevokeApiCredentialInput extends Schema.Class<RevokeApiCredentialInput>(
  "RevokeApiCredentialInput",
)({
  credentialId: ApiCredentialId,
  version: ResourceVersion,
}) {}

export class CurrentProjectAccess extends Schema.Class<CurrentProjectAccess>(
  "CurrentProjectAccess",
)({
  projectId: ProjectId,
  role: ProjectRole,
  localeAccess: ProjectLocaleAccess,
  allowedActions: Schema.Array(ProjectPermissionAction).pipe(
    Schema.minItems(1),
    Schema.maxItems(projectPermissionActionValues.length),
  ),
}) {}

export class ProjectMember extends Schema.Class<ProjectMember>("ProjectMember")({
  id: ProjectMembershipId,
  projectId: ProjectId,
  userId: AuthUserId,
  name: Schema.String.pipe(Schema.minLength(1), Schema.maxLength(255)),
  email: CanonicalEmail,
  role: ProjectRole,
  localeAccess: ProjectLocaleAccess,
  version: ResourceVersion,
  removedAt: Schema.NullOr(IsoDateTime),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
}) {}

export class ProjectInvitation extends Schema.Class<ProjectInvitation>("ProjectInvitation")({
  id: ProjectInvitationId,
  projectId: ProjectId,
  email: CanonicalEmail,
  role: ProjectRole,
  status: ProjectInvitationStatus,
  version: ResourceVersion,
  expiresAt: IsoDateTime,
  acceptedAt: Schema.NullOr(IsoDateTime),
  revokedAt: Schema.NullOr(IsoDateTime),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
}) {}

export class IssuedProjectInvitation extends Schema.Class<IssuedProjectInvitation>(
  "IssuedProjectInvitation",
)({
  invitation: ProjectInvitation,
  token: InvitationToken,
}) {}

export class InspectedProjectInvitation extends Schema.Class<InspectedProjectInvitation>(
  "InspectedProjectInvitation",
)({
  projectId: ProjectId,
  projectName: Schema.String.pipe(Schema.minLength(1), Schema.maxLength(100)),
  role: ProjectRole,
  inviterName: Schema.String.pipe(Schema.minLength(1), Schema.maxLength(255)),
  expiresAt: IsoDateTime,
}) {}

export class ApiCredential extends Schema.Class<ApiCredential>("ApiCredential")({
  id: ApiCredentialId,
  workspaceId: WorkspaceId,
  projectId: ProjectId,
  environmentId: EnvironmentId,
  family: CredentialFamily,
  name: CredentialName,
  keyPrefix: CredentialKeyPrefix,
  scopes: CredentialScopes,
  version: ResourceVersion,
  expiresAt: Schema.NullOr(IsoDateTime),
  revokedAt: Schema.NullOr(IsoDateTime),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
}) {}

export class IssuedApiCredential extends Schema.Class<IssuedApiCredential>("IssuedApiCredential")({
  credential: ApiCredential,
  key: CredentialSecret,
}) {}

export class CredentialPrincipal extends Schema.Class<CredentialPrincipal>("CredentialPrincipal")({
  credentialId: ApiCredentialId,
  workspaceId: WorkspaceId,
  projectId: ProjectId,
  environmentId: EnvironmentId,
  family: CredentialFamily,
  scopes: CredentialScopes,
}) {}

export class ProjectMemberPage extends Schema.Class<ProjectMemberPage>("ProjectMemberPage")({
  items: Schema.Array(ProjectMember),
  nextCursor: Schema.NullOr(Cursor),
}) {}

export class ProjectInvitationPage extends Schema.Class<ProjectInvitationPage>(
  "ProjectInvitationPage",
)({
  items: Schema.Array(ProjectInvitation),
  nextCursor: Schema.NullOr(Cursor),
}) {}

export class ApiCredentialPage extends Schema.Class<ApiCredentialPage>("ApiCredentialPage")({
  items: Schema.Array(ApiCredential),
  nextCursor: Schema.NullOr(Cursor),
}) {}

export const CreateProjectInvitationInputSchema = Schema.standardSchemaV1(
  CreateProjectInvitationInput,
);
export const ListProjectInvitationsInputSchema = Schema.standardSchemaV1(
  ListProjectInvitationsInput,
);
export const InspectProjectInvitationInputSchema = Schema.standardSchemaV1(
  InspectProjectInvitationInput,
);
export const AcceptProjectInvitationInputSchema = Schema.standardSchemaV1(
  AcceptProjectInvitationInput,
);
export const RevokeProjectInvitationInputSchema = Schema.standardSchemaV1(
  RevokeProjectInvitationInput,
);
export const GetCurrentProjectAccessInputSchema = Schema.standardSchemaV1(
  GetCurrentProjectAccessInput,
);
export const ListProjectMembersInputSchema = Schema.standardSchemaV1(ListProjectMembersInput);
export const UpdateProjectMemberRoleInputSchema = Schema.standardSchemaV1(
  UpdateProjectMemberRoleInput,
);
export const RemoveProjectMemberInputSchema = Schema.standardSchemaV1(RemoveProjectMemberInput);
export const UpdateProjectMemberLocaleAccessInputSchema = Schema.standardSchemaV1(
  UpdateProjectMemberLocaleAccessInput,
);
export const IssueApiCredentialInputSchema = Schema.standardSchemaV1(IssueApiCredentialInput);
export const ListApiCredentialsInputSchema = Schema.standardSchemaV1(ListApiCredentialsInput);
export const RotateApiCredentialInputSchema = Schema.standardSchemaV1(RotateApiCredentialInput);
export const RevokeApiCredentialInputSchema = Schema.standardSchemaV1(RevokeApiCredentialInput);

export const CurrentProjectAccessOutputSchema = Schema.standardSchemaV1(
  ApiSuccessSchema(CurrentProjectAccess),
);
export const ProjectMemberOutputSchema = Schema.standardSchemaV1(ApiSuccessSchema(ProjectMember));
export const ProjectMemberPageOutputSchema = Schema.standardSchemaV1(
  ApiSuccessSchema(ProjectMemberPage),
);
export const ProjectInvitationOutputSchema = Schema.standardSchemaV1(
  ApiSuccessSchema(ProjectInvitation),
);
export const IssuedProjectInvitationOutputSchema = Schema.standardSchemaV1(
  ApiSuccessSchema(IssuedProjectInvitation),
);
export const InspectedProjectInvitationOutputSchema = Schema.standardSchemaV1(
  ApiSuccessSchema(InspectedProjectInvitation),
);
export const ProjectInvitationPageOutputSchema = Schema.standardSchemaV1(
  ApiSuccessSchema(ProjectInvitationPage),
);
export const ApiCredentialOutputSchema = Schema.standardSchemaV1(ApiSuccessSchema(ApiCredential));
export const IssuedApiCredentialOutputSchema = Schema.standardSchemaV1(
  ApiSuccessSchema(IssuedApiCredential),
);
export const ApiCredentialPageOutputSchema = Schema.standardSchemaV1(
  ApiSuccessSchema(ApiCredentialPage),
);
