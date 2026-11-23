import { Schema, SchemaTransformation, Effect } from "effect";

import { ApiSuccessSchema } from "../response/api";
import { ProjectLocaleId } from "../locale";
import {
  AuthUserId,
  Cursor,
  EnvironmentId,
  IsoDateTime,
  PageLimit,
  ProjectId,
  ResourceVersion,
  WorkspaceId,
} from "../platform";

import { Uuid } from "../uuid";
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
  "project.restore",
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
  "project.audit.read",
  "locale.read",
  "locale.manage",
  "schema.read",
  "schema.write",
  "schema.publish",
  "presentation.publish",
  "delivery.configure",
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

export const ProjectMembershipId = Uuid.pipe(Schema.brand("ProjectMembershipId"));
export type ProjectMembershipId = typeof ProjectMembershipId.Type;

export const ProjectInvitationId = Uuid.pipe(Schema.brand("ProjectInvitationId"));
export type ProjectInvitationId = typeof ProjectInvitationId.Type;

export const ApiCredentialId = Uuid.pipe(Schema.brand("ApiCredentialId"));
export type ApiCredentialId = typeof ApiCredentialId.Type;

export const ApiCredentialRotationId = Uuid.pipe(Schema.brand("ApiCredentialRotationId"));
export type ApiCredentialRotationId = typeof ApiCredentialRotationId.Type;

export const ProjectActor = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("user"), id: AuthUserId }),
  Schema.Struct({ kind: Schema.Literal("credential"), id: ApiCredentialId }),
]).annotate({ identifier: "ProjectActor" });
export type ProjectActor = typeof ProjectActor.Type;

export const ProjectRole = Schema.Literals(projectRoleValues);
export type ProjectRole = typeof ProjectRole.Type;

export const LocaleAccessMode = Schema.Literals(["all", "selected", "none"]);
export type LocaleAccessMode = typeof LocaleAccessMode.Type;

export const SelectedProjectLocaleIds = Schema.Array(ProjectLocaleId).check(
  Schema.isMinLength(1),
  Schema.isMaxLength(100),
  Schema.makeFilter((localeIds) => new Set(localeIds).size === localeIds.length, {
    message: "Selected locale IDs must be unique.",
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

export const ProjectLocaleAccess = Schema.Union([
  AllProjectLocaleAccess,
  SelectedProjectLocaleAccess,
  NoProjectLocaleAccess,
]);
export type ProjectLocaleAccess = typeof ProjectLocaleAccess.Type;

const ProjectPolicyFields = {
  role: ProjectRole,
  localeAccess: ProjectLocaleAccess,
};

function ownerHasAllLocaleAccess(policy: ProjectLocalePolicyShape): boolean {
  return policy.role !== "owner" || policy.localeAccess.mode === "all";
}

interface ProjectLocalePolicyShape {
  readonly role: ProjectRole;
  readonly localeAccess: ProjectLocaleAccess;
}

export const ProjectMemberPolicy = Schema.Struct(ProjectPolicyFields)
  .check(
    Schema.makeFilter(ownerHasAllLocaleAccess, {
      message: "Project owners must have all-locale access.",
    }),
  )
  .pipe(Schema.annotate({ identifier: "ProjectMemberPolicy" }));
export type ProjectMemberPolicy = typeof ProjectMemberPolicy.Type;

export const ProjectInvitationPolicy = ProjectMemberPolicy.annotate({
  identifier: "ProjectInvitationPolicy",
});
export type ProjectInvitationPolicy = typeof ProjectInvitationPolicy.Type;

export const ProjectPermissionAction = Schema.Literals(projectPermissionActionValues);
export type ProjectPermissionAction = typeof ProjectPermissionAction.Type;

export const ProjectPermissionActions = Schema.Array(ProjectPermissionAction).check(
  Schema.isMaxLength(projectPermissionActionValues.length),
  Schema.makeFilter((actions) => new Set(actions).size === actions.length, {
    message: "Project permission actions must be unique.",
  }),
);
export type ProjectPermissionActions = typeof ProjectPermissionActions.Type;

export class ProjectPolicyProjection extends Schema.Class<ProjectPolicyProjection>(
  "ProjectPolicyProjection",
)({
  role: ProjectRole,
  localeAccess: ProjectLocaleAccess,
  baseRoleActions: ProjectPermissionActions,
  effectiveProjectActions: ProjectPermissionActions,
  configuredLocaleIds: Schema.Array(ProjectLocaleId).check(Schema.isMaxLength(100)),
  effectiveLocaleIds: Schema.Array(ProjectLocaleId).check(Schema.isMaxLength(100)),
  effectiveLocaleActions: ProjectPermissionActions,
}) {}

export const ProjectInvitationStatus = Schema.Literals([
  "pending",
  "accepted",
  "revoked",
  "expired",
]);
export type ProjectInvitationStatus = typeof ProjectInvitationStatus.Type;

export const CredentialFamily = Schema.Literals(["management", "delivery", "preview"]);
export type CredentialFamily = typeof CredentialFamily.Type;

export const CredentialLifecycleStatus = Schema.Literals([
  "pending",
  "active",
  "retiring",
  "expired",
  "revoked",
  "canceled",
]);
export type CredentialLifecycleStatus = typeof CredentialLifecycleStatus.Type;

export const CredentialRotationStatus = Schema.Literals([
  "pending",
  "overlap",
  "canceled",
  "completed",
]);
export type CredentialRotationStatus = typeof CredentialRotationStatus.Type;

export const CredentialScope = Schema.Literals(credentialScopeValues);
export type CredentialScope = typeof CredentialScope.Type;

export const CredentialScopes = Schema.Array(CredentialScope).check(
  Schema.isMinLength(1),
  Schema.isMaxLength(16),
  Schema.makeFilter((scopes) => new Set(scopes).size === scopes.length, {
    message: "Credential scopes must be unique.",
  }),
);
export type CredentialScopes = typeof CredentialScopes.Type;

export const CanonicalEmail = NormalizedString.pipe(
  Schema.decodeTo(
    Schema.String,
    SchemaTransformation.transform({
      decode: (value) => value.toLowerCase(),
      encode: (value) => value,
    }),
  ),
)
  .check(
    Schema.isMinLength(3),
    Schema.isMaxLength(320),
    Schema.isPattern(/^[^\s@]+@[^\s@]+\.[^\s@]+$/u),
    Schema.makeFilter((value) => !hasControlCharacter(value), {
      message: "Email addresses cannot contain control characters.",
    }),
  )
  .pipe(Schema.brand("CanonicalEmail"));
export type CanonicalEmail = typeof CanonicalEmail.Type;

export const ProjectAccessSearch = NormalizedString.pipe(
  Schema.decodeTo(
    Schema.String,
    SchemaTransformation.transform({
      decode: (value) => value.toLowerCase(),
      encode: (value) => value,
    }),
  ),
)
  .check(
    Schema.isMinLength(1),
    Schema.isMaxLength(100),
    Schema.makeFilter((value) => !hasControlCharacter(value), {
      message: "Search text cannot contain control characters.",
    }),
  )
  .pipe(Schema.brand("ProjectAccessSearch"));
export type ProjectAccessSearch = typeof ProjectAccessSearch.Type;

export const ProjectInvitationListStatus = Schema.Literals([
  "all",
  "pending",
  "accepted",
  "revoked",
  "expired",
]);
export type ProjectInvitationListStatus = typeof ProjectInvitationListStatus.Type;

export const InvitationToken = Schema.String.check(
  Schema.isBetweenLength(43, 43),
  Schema.isPattern(/^[A-Za-z0-9_-]+$/u),
).pipe(Schema.brand("InvitationToken"));
export type InvitationToken = typeof InvitationToken.Type;

export const CredentialName = NormalizedString.check(
  Schema.isMinLength(1),
  Schema.isMaxLength(100),
  Schema.makeFilter((value) => !hasControlCharacter(value), {
    message: "Credential names cannot contain control characters.",
  }),
).pipe(Schema.brand("CredentialName"));
export type CredentialName = typeof CredentialName.Type;

export const CredentialKeyPrefix = Schema.String.check(
  Schema.isMinLength(44),
  Schema.isMaxLength(45),
  Schema.isPattern(
    /^ffd_(?:mgmt|del|prev)_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u,
  ),
).pipe(Schema.brand("CredentialKeyPrefix"));
export type CredentialKeyPrefix = typeof CredentialKeyPrefix.Type;

export const CredentialSecret = Schema.String.check(
  Schema.isMinLength(88),
  Schema.isMaxLength(89),
  Schema.isPattern(
    /^ffd_(?:mgmt|del|prev)_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}_[A-Za-z0-9_-]{43}$/u,
  ),
).pipe(Schema.brand("CredentialSecret"));
export type CredentialSecret = typeof CredentialSecret.Type;

export const CreateProjectInvitationInput = Schema.Struct({
  projectId: ProjectId,
  email: CanonicalEmail,
  ...ProjectPolicyFields,
})
  .check(
    Schema.makeFilter(ownerHasAllLocaleAccess, {
      message: "Project owners must have all-locale access.",
    }),
  )
  .pipe(Schema.annotate({ identifier: "CreateProjectInvitationInput" }));
export type CreateProjectInvitationInput = typeof CreateProjectInvitationInput.Type;

export class ListProjectInvitationsInput extends Schema.Class<ListProjectInvitationsInput>(
  "ListProjectInvitationsInput",
)({
  projectId: ProjectId,
  status: ProjectInvitationListStatus.pipe(
    Schema.withDecodingDefaultType(Effect.sync(() => "all")),
  ),
  search: Schema.NullOr(ProjectAccessSearch).pipe(
    Schema.withDecodingDefaultType(Effect.sync(() => null)),
  ),
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
  projectId: ProjectId,
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
  role: Schema.NullOr(ProjectRole).pipe(Schema.withDecodingDefaultType(Effect.sync(() => null))),
  search: Schema.NullOr(ProjectAccessSearch).pipe(
    Schema.withDecodingDefaultType(Effect.sync(() => null)),
  ),
  cursor: Schema.NullOr(Cursor),
  limit: PageLimit,
}) {}

export const UpdateProjectMemberPolicyInput = Schema.Struct({
  projectId: ProjectId,
  membershipId: ProjectMembershipId,
  version: ResourceVersion,
  ...ProjectPolicyFields,
})
  .check(
    Schema.makeFilter(ownerHasAllLocaleAccess, {
      message: "Project owners must have all-locale access.",
    }),
  )
  .pipe(Schema.annotate({ identifier: "UpdateProjectMemberPolicyInput" }));
export type UpdateProjectMemberPolicyInput = typeof UpdateProjectMemberPolicyInput.Type;

export class RemoveProjectMemberInput extends Schema.Class<RemoveProjectMemberInput>(
  "RemoveProjectMemberInput",
)({
  projectId: ProjectId,
  membershipId: ProjectMembershipId,
  version: ResourceVersion,
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
  previewAuthorityAcknowledged: Schema.Boolean.pipe(
    Schema.withDecodingDefaultType(Effect.sync(() => false)),
  ),
  nonExpiringAcknowledged: Schema.Boolean.pipe(
    Schema.withDecodingDefaultType(Effect.sync(() => false)),
  ),
}) {}

export class ListApiCredentialsInput extends Schema.Class<ListApiCredentialsInput>(
  "ListApiCredentialsInput",
)({
  projectId: ProjectId,
  environmentId: EnvironmentId,
  cursor: Schema.NullOr(Cursor),
  limit: PageLimit,
}) {}

export class StartApiCredentialRotationInput extends Schema.Class<StartApiCredentialRotationInput>(
  "StartApiCredentialRotationInput",
)({
  projectId: ProjectId,
  environmentId: EnvironmentId,
  credentialId: ApiCredentialId,
  expectedVersion: ResourceVersion,
  expiresAt: Schema.NullOr(IsoDateTime),
  nonExpiringAcknowledged: Schema.Boolean,
}) {}

export class ChangeApiCredentialRotationInput extends Schema.Class<ChangeApiCredentialRotationInput>(
  "ChangeApiCredentialRotationInput",
)({
  projectId: ProjectId,
  environmentId: EnvironmentId,
  rotationId: ApiCredentialRotationId,
  expectedVersion: ResourceVersion,
  action: Schema.Literals(["activate", "cancel", "complete"]),
}) {}

export class RevokeApiCredentialInput extends Schema.Class<RevokeApiCredentialInput>(
  "RevokeApiCredentialInput",
)({
  projectId: ProjectId,
  environmentId: EnvironmentId,
  credentialId: ApiCredentialId,
  expectedVersion: ResourceVersion,
}) {}

export class CurrentProjectAccess extends Schema.Class<CurrentProjectAccess>(
  "CurrentProjectAccess",
)({
  projectId: ProjectId,
  role: ProjectRole,
  localeAccess: ProjectLocaleAccess,
  baseRoleActions: ProjectPermissionActions,
  effectiveProjectActions: ProjectPermissionActions,
  effectiveLocaleIds: Schema.Array(ProjectLocaleId).check(Schema.isMaxLength(100)),
  effectiveLocaleActions: ProjectPermissionActions,
}) {}

export class ProjectMember extends Schema.Class<ProjectMember>("ProjectMember")({
  id: ProjectMembershipId,
  projectId: ProjectId,
  userId: AuthUserId,
  name: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(255)),
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
  localeAccess: ProjectLocaleAccess,
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
  projectName: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(100)),
  role: ProjectRole,
  localeAccess: ProjectLocaleAccess,
  inviterName: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(255)),
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
  status: CredentialLifecycleStatus,
  version: ResourceVersion,
  activatedAt: Schema.NullOr(IsoDateTime),
  expiresAt: Schema.NullOr(IsoDateTime),
  retireAt: Schema.NullOr(IsoDateTime),
  revokedAt: Schema.NullOr(IsoDateTime),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
}) {}

export class ApiCredentialRotation extends Schema.Class<ApiCredentialRotation>(
  "ApiCredentialRotation",
)({
  id: ApiCredentialRotationId,
  projectId: ProjectId,
  environmentId: EnvironmentId,
  predecessorCredentialId: ApiCredentialId,
  successorCredentialId: ApiCredentialId,
  status: CredentialRotationStatus,
  version: ResourceVersion,
  activatedAt: Schema.NullOr(IsoDateTime),
  retireAt: Schema.NullOr(IsoDateTime),
  completedAt: Schema.NullOr(IsoDateTime),
  canceledAt: Schema.NullOr(IsoDateTime),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
}) {}

export class IssuedApiCredential extends Schema.Class<IssuedApiCredential>("IssuedApiCredential")({
  credential: ApiCredential,
  key: CredentialSecret,
}) {}

export class StartedApiCredentialRotation extends Schema.Class<StartedApiCredentialRotation>(
  "StartedApiCredentialRotation",
)({
  rotation: ApiCredentialRotation,
  successor: ApiCredential,
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

export const CreateProjectInvitationInputSchema = Schema.toStandardSchemaV1(
  CreateProjectInvitationInput,
  { parseOptions: { onExcessProperty: "error" } },
);
export const ListProjectInvitationsInputSchema = Schema.toStandardSchemaV1(
  ListProjectInvitationsInput,
  { parseOptions: { onExcessProperty: "error" } },
);
export const InspectProjectInvitationInputSchema = Schema.toStandardSchemaV1(
  InspectProjectInvitationInput,
  { parseOptions: { onExcessProperty: "error" } },
);
export const AcceptProjectInvitationInputSchema = Schema.toStandardSchemaV1(
  AcceptProjectInvitationInput,
  { parseOptions: { onExcessProperty: "error" } },
);
export const RevokeProjectInvitationInputSchema = Schema.toStandardSchemaV1(
  RevokeProjectInvitationInput,
  { parseOptions: { onExcessProperty: "error" } },
);
export const GetCurrentProjectAccessInputSchema = Schema.toStandardSchemaV1(
  GetCurrentProjectAccessInput,
  { parseOptions: { onExcessProperty: "error" } },
);
export const ListProjectMembersInputSchema = Schema.toStandardSchemaV1(ListProjectMembersInput, {
  parseOptions: { onExcessProperty: "error" },
});
export const UpdateProjectMemberPolicyInputSchema = Schema.toStandardSchemaV1(
  UpdateProjectMemberPolicyInput,
  { parseOptions: { onExcessProperty: "error" } },
);
export const RemoveProjectMemberInputSchema = Schema.toStandardSchemaV1(RemoveProjectMemberInput, {
  parseOptions: { onExcessProperty: "error" },
});
export const IssueApiCredentialInputSchema = Schema.toStandardSchemaV1(IssueApiCredentialInput, {
  parseOptions: { onExcessProperty: "error" },
});
export const ListApiCredentialsInputSchema = Schema.toStandardSchemaV1(ListApiCredentialsInput, {
  parseOptions: { onExcessProperty: "error" },
});
export const StartApiCredentialRotationInputSchema = Schema.toStandardSchemaV1(
  StartApiCredentialRotationInput,
  { parseOptions: { onExcessProperty: "error" } },
);
export const ChangeApiCredentialRotationInputSchema = Schema.toStandardSchemaV1(
  ChangeApiCredentialRotationInput,
  { parseOptions: { onExcessProperty: "error" } },
);
export const RevokeApiCredentialInputSchema = Schema.toStandardSchemaV1(RevokeApiCredentialInput, {
  parseOptions: { onExcessProperty: "error" },
});

export const CurrentProjectAccessOutputSchema = Schema.toStandardSchemaV1(
  ApiSuccessSchema(CurrentProjectAccess),
);
export const ProjectMemberOutputSchema = Schema.toStandardSchemaV1(ApiSuccessSchema(ProjectMember));
export const ProjectMemberPageOutputSchema = Schema.toStandardSchemaV1(
  ApiSuccessSchema(ProjectMemberPage),
);
export const ProjectInvitationOutputSchema = Schema.toStandardSchemaV1(
  ApiSuccessSchema(ProjectInvitation),
);
export const IssuedProjectInvitationOutputSchema = Schema.toStandardSchemaV1(
  ApiSuccessSchema(IssuedProjectInvitation),
);
export const InspectedProjectInvitationOutputSchema = Schema.toStandardSchemaV1(
  ApiSuccessSchema(InspectedProjectInvitation),
);
export const ProjectInvitationPageOutputSchema = Schema.toStandardSchemaV1(
  ApiSuccessSchema(ProjectInvitationPage),
);
export const ApiCredentialOutputSchema = Schema.toStandardSchemaV1(ApiSuccessSchema(ApiCredential));
export const IssuedApiCredentialOutputSchema = Schema.toStandardSchemaV1(
  ApiSuccessSchema(IssuedApiCredential),
);
export const ApiCredentialRotationOutputSchema = Schema.toStandardSchemaV1(
  ApiSuccessSchema(ApiCredentialRotation),
);
export const StartedApiCredentialRotationOutputSchema = Schema.toStandardSchemaV1(
  ApiSuccessSchema(StartedApiCredentialRotation),
);
export const ApiCredentialPageOutputSchema = Schema.toStandardSchemaV1(
  ApiSuccessSchema(ApiCredentialPage),
);
