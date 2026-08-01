import { Context, Effect, Layer, Option, Schema } from "effect";

import {
  CredentialFamily,
  CredentialScope,
  LocaleAccessMode,
  type CredentialFamily as CredentialFamilyType,
  type CredentialScope as CredentialScopeType,
  type ProjectPermissionAction as ProjectPermissionActionType,
  type ProjectRole as ProjectRoleType,
  ProjectPermissionAction,
  ProjectRole,
  credentialScopeValues,
  projectPermissionActionValues,
} from "../contracts/access";

export type PolicyDecisionReason =
  | "allowed"
  | "unknown_action"
  | "missing_context"
  | "scope_mismatch"
  | "inactive_subject"
  | "role_denied"
  | "family_denied"
  | "scope_denied"
  | "locale_denied"
  | "explicit_deny";

export interface PolicyDecision {
  readonly allowed: boolean;
  readonly reason: PolicyDecisionReason;
}

export interface UserPolicyRequest {
  readonly action: string;
  readonly role: string | null;
  readonly subjectWorkspaceId: string | null;
  readonly subjectProjectId: string | null;
  readonly workspaceId: string | null;
  readonly projectId: string | null;
  readonly localeAccessMode: string | null;
  readonly allowedLocaleIds: ReadonlyArray<string>;
  readonly requestedLocaleId: string | null;
  readonly isActive: boolean;
  readonly hasExplicitDeny?: boolean;
}

export interface CredentialPolicyRequest {
  readonly action: string;
  readonly family: string;
  readonly scopes: ReadonlyArray<string>;
  readonly subjectWorkspaceId: string | null;
  readonly subjectProjectId: string | null;
  readonly subjectEnvironmentId: string | null;
  readonly workspaceId: string | null;
  readonly projectId: string | null;
  readonly environmentId: string | null;
  readonly isActive: boolean;
  readonly hasExplicitDeny?: boolean;
}

const allActions = new Set<ProjectPermissionActionType>(projectPermissionActionValues);
const localeScopedContentActions = new Set<ProjectPermissionActionType>([
  "content.read",
  "content.write",
  "content.review",
  "content.publish",
]);
const unrestrictedLocaleActions = new Set<ProjectPermissionActionType>([
  "locale.manage",
  "project.credential.issue",
  "project.credential.rotate",
]);
const developerActions = new Set<ProjectPermissionActionType>([
  "project.read",
  "project.update",
  "project.capability.manage",
  "project.member.read",
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
]);
const contentAdminActions = new Set<ProjectPermissionActionType>([
  "project.read",
  "locale.read",
  "schema.read",
  "content.read",
  "content.write",
  "content.review",
  "content.publish",
]);
const editorActions = new Set<ProjectPermissionActionType>([
  "project.read",
  "locale.read",
  "schema.read",
  "content.read",
  "content.write",
]);
const reviewerActions = new Set<ProjectPermissionActionType>([
  "project.read",
  "locale.read",
  "schema.read",
  "content.read",
  "content.review",
  "content.publish",
]);
const readOnlyActions = new Set<ProjectPermissionActionType>([
  "project.read",
  "locale.read",
  "schema.read",
  "content.read",
]);

export const projectRolePermissions = {
  owner: allActions,
  developer: developerActions,
  content_admin: contentAdminActions,
  editor: editorActions,
  reviewer: reviewerActions,
  client_editor: editorActions,
  read_only: readOnlyActions,
} satisfies Readonly<Record<ProjectRoleType, ReadonlySet<ProjectPermissionActionType>>>;

const managementScopes = new Set<CredentialScopeType>(
  credentialScopeValues.filter(
    (scope): scope is Exclude<CredentialScopeType, "delivery.read" | "preview.read"> =>
      scope !== "delivery.read" && scope !== "preview.read",
  ),
);
const familyScopes = {
  management: managementScopes,
  delivery: new Set<CredentialScopeType>(["delivery.read"]),
  preview: new Set<CredentialScopeType>(["preview.read"]),
} satisfies Readonly<Record<CredentialFamilyType, ReadonlySet<CredentialScopeType>>>;

const allow = (): PolicyDecision => ({ allowed: true, reason: "allowed" });
const deny = (reason: Exclude<PolicyDecisionReason, "allowed">): PolicyDecision => ({
  allowed: false,
  reason,
});

function decodeOption<A, I>(schema: Schema.Schema<A, I, never>, value: unknown): A | undefined {
  return Option.getOrUndefined(Schema.decodeUnknownOption(schema)(value));
}

export function isRoleAllowed(role: string, action: string): boolean {
  const decodedRole = decodeOption(ProjectRole, role);
  const decodedAction = decodeOption(ProjectPermissionAction, action);
  return decodedRole !== undefined && decodedAction !== undefined
    ? projectRolePermissions[decodedRole].has(decodedAction)
    : false;
}

export function areScopesAllowedForFamily(family: string, scopes: ReadonlyArray<string>): boolean {
  const decodedFamily = decodeOption(CredentialFamily, family);
  if (decodedFamily === undefined || scopes.length === 0) return false;
  const decodedScopes = scopes.map((scope) => decodeOption(CredentialScope, scope));
  if (decodedScopes.some((scope) => scope === undefined)) return false;
  return decodedScopes.every(
    (scope) => scope !== undefined && familyScopes[decodedFamily].has(scope),
  );
}

export function decideUserPolicy(request: UserPolicyRequest): PolicyDecision {
  if (request.hasExplicitDeny) return deny("explicit_deny");
  if (!request.isActive) return deny("inactive_subject");
  if (
    request.workspaceId === null ||
    request.projectId === null ||
    request.subjectWorkspaceId === null ||
    request.subjectProjectId === null ||
    request.role === null
  ) {
    return deny("missing_context");
  }
  if (
    request.workspaceId !== request.subjectWorkspaceId ||
    request.projectId !== request.subjectProjectId
  ) {
    return deny("scope_mismatch");
  }
  const action = decodeOption(ProjectPermissionAction, request.action);
  if (action === undefined) return deny("unknown_action");
  const role = decodeOption(ProjectRole, request.role);
  if (role === undefined || !projectRolePermissions[role].has(action)) return deny("role_denied");
  const localeAccessMode =
    request.localeAccessMode === null
      ? undefined
      : decodeOption(LocaleAccessMode, request.localeAccessMode);
  if (localeAccessMode === undefined) return deny("missing_context");
  if (unrestrictedLocaleActions.has(action) && localeAccessMode !== "all") {
    return deny("locale_denied");
  }
  if (!localeScopedContentActions.has(action)) return allow();
  if (request.requestedLocaleId === null) return deny("missing_context");
  if (localeAccessMode === "all") return allow();
  if (
    localeAccessMode === "selected" &&
    request.allowedLocaleIds.includes(request.requestedLocaleId)
  ) {
    return allow();
  }
  return deny("locale_denied");
}

export function decideCredentialPolicy(request: CredentialPolicyRequest): PolicyDecision {
  if (request.hasExplicitDeny) return deny("explicit_deny");
  if (!request.isActive) return deny("inactive_subject");
  if (
    request.workspaceId === null ||
    request.projectId === null ||
    request.environmentId === null ||
    request.subjectWorkspaceId === null ||
    request.subjectProjectId === null ||
    request.subjectEnvironmentId === null
  ) {
    return deny("missing_context");
  }
  if (
    request.workspaceId !== request.subjectWorkspaceId ||
    request.projectId !== request.subjectProjectId ||
    request.environmentId !== request.subjectEnvironmentId
  ) {
    return deny("scope_mismatch");
  }
  const family = decodeOption(CredentialFamily, request.family);
  if (family === undefined || !areScopesAllowedForFamily(family, request.scopes)) {
    return deny("family_denied");
  }
  const action = decodeOption(CredentialScope, request.action);
  if (action === undefined) return deny("unknown_action");
  if (!familyScopes[family].has(action)) return deny("family_denied");
  return request.scopes.includes(action) ? allow() : deny("scope_denied");
}

export function makePolicyService() {
  return {
    decideUser: Effect.fn("PolicyService.decideUser")((request: UserPolicyRequest) =>
      Effect.succeed(decideUserPolicy(request)),
    ),
    decideCredential: Effect.fn("PolicyService.decideCredential")(
      (request: CredentialPolicyRequest) => Effect.succeed(decideCredentialPolicy(request)),
    ),
  };
}

export class PolicyService extends Context.Tag("PolicyService")<
  PolicyService,
  ReturnType<typeof makePolicyService>
>() {}

export const PolicyServiceLive = Layer.succeed(PolicyService, makePolicyService());
