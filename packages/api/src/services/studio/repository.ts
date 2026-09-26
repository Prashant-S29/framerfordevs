// Revalidates current Studio registration, grant, and project policy before bootstrap projection.

import {
  STUDIO_SESSION_SCOPE,
  studioSessionAuditRequestId,
  type StudioOAuthPrincipal,
} from "@framerfordevs/auth";
import { db } from "@framerfordevs/db";
import { and, eq, gt, isNull, sql } from "@framerfordevs/db/query";
import { projectMembership } from "@framerfordevs/db/schema/access";
import {
  oauthClient,
  oauthClientResource,
  oauthConsent,
  oauthRefreshToken,
  user,
} from "@framerfordevs/db/schema/auth";
import { studioRegistration } from "@framerfordevs/db/schema/control-plane";
import {
  auditEvent,
  environment,
  project,
  projectCapability,
  workspaceMembership,
} from "@framerfordevs/db/schema/platform";
import { env } from "@framerfordevs/env/server";
import { Context, Effect, Layer, Schema } from "effect";

import { CanonicalEmail, ProjectRole } from "../../contracts/access";
import {
  StudioApplicationOrigin,
  StudioMountPath,
  StudioRegistrationId,
} from "../../contracts/control-plane";
import {
  AuthUserId,
  EnvironmentId,
  IsoDateTime,
  ProjectId,
  ProjectName,
  ResourceVersion,
  WorkspaceId,
} from "../../contracts/platform";
import {
  CmsCapabilityRequiredFailure,
  DatabaseFailure,
  ForbiddenFailure,
  NotFoundFailure,
  StudioAuthorityChangedFailure,
  StudioGrantInvalidFailure,
  StudioRegistrationInactiveFailure,
} from "../../contracts/response/errors";
import { StudioBootstrap } from "../../contracts/studio";
import { studioResource } from "../../lib/studio/authority";
import { buildStudioBootstrap } from "../../lib/studio/bootstrap";
import type { ApplicationDb } from "../project-access";

interface StudioBootstrapInput {
  readonly principal: StudioOAuthPrincipal;
  readonly projectId: ProjectId;
  readonly environmentId: EnvironmentId;
}

interface StudioRepositoryOptions {
  readonly database?: ApplicationDb;
  readonly apiOrigin?: string;
}

function failure(operation: string, cause: unknown) {
  return DatabaseFailure.make({ operation, cause });
}

function metadataMatches(
  metadata: Readonly<Record<string, unknown>> | null,
  registration: {
    readonly id: string;
    readonly version: number;
    readonly projectId: string;
    readonly environmentId: string;
    readonly applicationOrigin: string;
    readonly mountPath: string;
  },
): boolean {
  return (
    metadata?.kind === "studio_v1" &&
    metadata.registrationId === registration.id &&
    metadata.registrationVersion === registration.version &&
    metadata.projectId === registration.projectId &&
    metadata.environmentId === registration.environmentId &&
    metadata.applicationOrigin === registration.applicationOrigin &&
    metadata.mountPath === registration.mountPath
  );
}

export function makeStudioRepository(options: StudioRepositoryOptions = {}) {
  const database = options.database ?? db;
  const audience = studioResource(options.apiOrigin ?? env.BETTER_AUTH_URL);

  return {
    authorizeOAuth: Effect.fn("StudioRepository.authorizeOAuth")(function* (
      clientId: string,
      userId: string,
    ) {
      const allowed = yield* Effect.tryPromise({
        try: () =>
          database.transaction(async (transaction) => {
            const [client] = await transaction
              .select({
                disabled: oauthClient.disabled,
                referenceId: oauthClient.referenceId,
                metadata: oauthClient.metadata,
              })
              .from(oauthClient)
              .where(eq(oauthClient.clientId, clientId))
              .limit(1);
            if (client?.disabled !== false || client.referenceId === null) return false;
            const [registration] = await transaction
              .select()
              .from(studioRegistration)
              .where(
                and(
                  eq(studioRegistration.id, client.referenceId),
                  eq(studioRegistration.runtimeStatus, "active"),
                ),
              )
              .limit(1);
            if (!registration || !metadataMatches(client.metadata, registration)) return false;
            const [currentProject] = await transaction
              .select({ archivedAt: project.archivedAt })
              .from(project)
              .where(
                and(
                  eq(project.id, registration.projectId),
                  eq(project.workspaceId, registration.workspaceId),
                ),
              )
              .limit(1);
            const [cmsCapability] = await transaction
              .select({ status: projectCapability.status })
              .from(projectCapability)
              .where(
                and(
                  eq(projectCapability.workspaceId, registration.workspaceId),
                  eq(projectCapability.projectId, registration.projectId),
                  eq(projectCapability.key, "cms"),
                ),
              )
              .limit(1);
            const [workspaceAccess] = await transaction
              .select({ role: workspaceMembership.role })
              .from(workspaceMembership)
              .where(
                and(
                  eq(workspaceMembership.workspaceId, registration.workspaceId),
                  eq(workspaceMembership.userId, userId),
                  isNull(workspaceMembership.revokedAt),
                ),
              )
              .limit(1);
            const [projectAccess] = await transaction
              .select({ id: projectMembership.id })
              .from(projectMembership)
              .where(
                and(
                  eq(projectMembership.workspaceId, registration.workspaceId),
                  eq(projectMembership.projectId, registration.projectId),
                  eq(projectMembership.userId, userId),
                  isNull(projectMembership.removedAt),
                ),
              )
              .limit(1);
            return (
              currentProject?.archivedAt === null &&
              cmsCapability?.status === "enabled" &&
              (workspaceAccess?.role === "owner" || projectAccess !== undefined)
            );
          }),
        catch: (cause) => failure("studio.oauth.authorize", cause),
      });
      if (!allowed) return yield* ForbiddenFailure.make();
      return { allowed: true as const };
    }),

    getBootstrap: Effect.fn("StudioRepository.getBootstrap")(function* (
      input: StudioBootstrapInput,
    ) {
      if (
        input.principal.projectId !== input.projectId ||
        input.principal.environmentId !== input.environmentId
      ) {
        return yield* NotFoundFailure.make({ resource: "studio" });
      }

      const result = yield* Effect.tryPromise({
        try: () =>
          database.transaction(async (transaction) => {
            const [registration] = await transaction
              .select()
              .from(studioRegistration)
              .where(
                and(
                  eq(studioRegistration.id, input.principal.registrationId),
                  eq(studioRegistration.projectId, input.projectId),
                  eq(studioRegistration.environmentId, input.environmentId),
                ),
              )
              .limit(1);
            if (!registration) return { kind: "not_found" as const };
            if (registration.runtimeStatus !== "active") {
              return { kind: "inactive" as const };
            }
            if (registration.version !== input.principal.registrationVersion) {
              return { kind: "authority_changed" as const };
            }

            const [currentProject] = await transaction
              .select({
                id: project.id,
                workspaceId: project.workspaceId,
                name: project.name,
                archivedAt: project.archivedAt,
              })
              .from(project)
              .where(
                and(
                  eq(project.id, registration.projectId),
                  eq(project.workspaceId, registration.workspaceId),
                ),
              )
              .limit(1);
            const [currentEnvironment] = await transaction
              .select({ id: environment.id, key: environment.key, name: environment.name })
              .from(environment)
              .where(
                and(
                  eq(environment.id, registration.environmentId),
                  eq(environment.projectId, registration.projectId),
                  eq(environment.workspaceId, registration.workspaceId),
                  eq(environment.isPrimary, true),
                ),
              )
              .limit(1);
            const [cmsCapability] = await transaction
              .select({ status: projectCapability.status })
              .from(projectCapability)
              .where(
                and(
                  eq(projectCapability.workspaceId, registration.workspaceId),
                  eq(projectCapability.projectId, registration.projectId),
                  eq(projectCapability.key, "cms"),
                ),
              )
              .limit(1);
            const [workspaceAccess] = await transaction
              .select({ role: workspaceMembership.role })
              .from(workspaceMembership)
              .where(
                and(
                  eq(workspaceMembership.workspaceId, registration.workspaceId),
                  eq(workspaceMembership.userId, input.principal.userId),
                  isNull(workspaceMembership.revokedAt),
                ),
              )
              .limit(1);
            const [projectAccess] = await transaction
              .select({ role: projectMembership.role })
              .from(projectMembership)
              .where(
                and(
                  eq(projectMembership.workspaceId, registration.workspaceId),
                  eq(projectMembership.projectId, registration.projectId),
                  eq(projectMembership.userId, input.principal.userId),
                  isNull(projectMembership.removedAt),
                ),
              )
              .limit(1);
            const [currentUser] = await transaction
              .select({ id: user.id, name: user.name, email: user.email })
              .from(user)
              .where(eq(user.id, input.principal.userId))
              .limit(1);
            const [client] = await transaction
              .select({
                disabled: oauthClient.disabled,
                referenceId: oauthClient.referenceId,
                metadata: oauthClient.metadata,
              })
              .from(oauthClient)
              .where(eq(oauthClient.clientId, input.principal.clientId))
              .limit(1);
            const [resourceLink] = await transaction
              .select({ id: oauthClientResource.id })
              .from(oauthClientResource)
              .where(
                and(
                  eq(oauthClientResource.clientId, input.principal.clientId),
                  eq(oauthClientResource.resourceId, audience),
                ),
              )
              .limit(1);
            const [consent] = await transaction
              .select({
                id: oauthConsent.id,
                resources: oauthConsent.resources,
                scopes: oauthConsent.scopes,
              })
              .from(oauthConsent)
              .where(
                and(
                  eq(oauthConsent.clientId, input.principal.clientId),
                  eq(oauthConsent.userId, input.principal.userId),
                ),
              )
              .limit(1);
            const grantIdHex = input.principal.grantId.replaceAll("-", "");
            const [currentGrant] = await transaction
              .select({ id: oauthRefreshToken.id })
              .from(oauthRefreshToken)
              .where(
                and(
                  eq(oauthRefreshToken.clientId, input.principal.clientId),
                  eq(oauthRefreshToken.userId, input.principal.userId),
                  isNull(oauthRefreshToken.revoked),
                  gt(oauthRefreshToken.expiresAt, new Date()),
                  sql<boolean>`(
                    substring(encode(sha256(convert_to('studio-grant:' || ${oauthRefreshToken.authorizationCodeId}, 'UTF8')), 'hex') from 1 for 12)
                    || '5'
                    || substring(encode(sha256(convert_to('studio-grant:' || ${oauthRefreshToken.authorizationCodeId}, 'UTF8')), 'hex') from 14 for 3)
                    || substring('89ab' from (((get_byte(sha256(convert_to('studio-grant:' || ${oauthRefreshToken.authorizationCodeId}, 'UTF8')), 8) >> 4) & 3) + 1) for 1)
                    || substring(encode(sha256(convert_to('studio-grant:' || ${oauthRefreshToken.authorizationCodeId}, 'UTF8')), 'hex') from 18 for 15)
                  ) = ${grantIdHex}`,
                ),
              )
              .limit(1);
            const [auditMarker] = await transaction
              .select({ id: auditEvent.id })
              .from(auditEvent)
              .where(
                and(
                  eq(auditEvent.id, input.principal.auditMarkerId),
                  eq(auditEvent.workspaceId, registration.workspaceId),
                  eq(auditEvent.projectId, registration.projectId),
                  eq(auditEvent.environmentId, registration.environmentId),
                  eq(auditEvent.actorType, "user"),
                  eq(auditEvent.actorId, input.principal.userId),
                  eq(auditEvent.action, "studio.session.established"),
                  eq(auditEvent.resourceType, "studio_grant"),
                  eq(auditEvent.resourceId, input.principal.grantId),
                  eq(
                    auditEvent.requestId,
                    studioSessionAuditRequestId(
                      input.principal.auditMarkerId,
                      registration.id,
                      registration.version,
                    ),
                  ),
                ),
              )
              .limit(1);

            if (!currentProject || currentProject.archivedAt !== null || !currentEnvironment) {
              return { kind: "not_found" as const };
            }
            if (cmsCapability?.status !== "enabled") return { kind: "cms_required" as const };
            const role = workspaceAccess?.role === "owner" ? "owner" : projectAccess?.role;
            if (!role || !currentUser) return { kind: "forbidden" as const };
            if (
              client?.disabled !== false ||
              client.referenceId !== registration.id ||
              !metadataMatches(client.metadata, registration) ||
              !resourceLink
            ) {
              return { kind: "authority_changed" as const };
            }
            const consentScopes = new Set(consent?.scopes ?? []);
            const consentResources = new Set(consent?.resources ?? []);
            const exactConsent =
              consent !== undefined &&
              consentScopes.size === 2 &&
              consentScopes.has(STUDIO_SESSION_SCOPE) &&
              consentScopes.has("offline_access") &&
              consentResources.size === 1 &&
              consentResources.has(audience);
            if (!exactConsent || !currentGrant || !auditMarker) {
              return { kind: "grant_invalid" as const };
            }
            return {
              kind: "success" as const,
              registration,
              project: currentProject,
              environment: currentEnvironment,
              user: currentUser,
              role,
            };
          }),
        catch: (cause) => failure("studio.bootstrap.get", cause),
      });

      switch (result.kind) {
        case "not_found":
          return yield* NotFoundFailure.make({ resource: "studio" });
        case "inactive":
          return yield* StudioRegistrationInactiveFailure.make();
        case "authority_changed":
          return yield* StudioAuthorityChangedFailure.make();
        case "cms_required":
          return yield* CmsCapabilityRequiredFailure.make();
        case "forbidden":
          return yield* ForbiddenFailure.make();
        case "grant_invalid":
          return yield* StudioGrantInvalidFailure.make();
        case "success": {
          const role = yield* Schema.decodeUnknown(ProjectRole)(result.role).pipe(
            Effect.mapError((cause) => failure("studio.bootstrap.role.decode", cause)),
          );
          const bootstrap = buildStudioBootstrap({
            registration: {
              id: StudioRegistrationId.make(result.registration.id),
              version: ResourceVersion.make(result.registration.version),
              applicationOrigin: StudioApplicationOrigin.make(
                result.registration.applicationOrigin,
              ),
              mountPath: StudioMountPath.make(result.registration.mountPath),
            },
            project: {
              id: ProjectId.make(result.project.id),
              name: ProjectName.make(result.project.name),
              workspaceId: WorkspaceId.make(result.project.workspaceId),
            },
            environment: {
              id: EnvironmentId.make(result.environment.id),
              key: "main",
              name: "main",
            },
            user: {
              id: AuthUserId.make(result.user.id),
              name: result.user.name,
              email: CanonicalEmail.make(result.user.email),
            },
            role,
            expiresAt: IsoDateTime.make(
              new Date(input.principal.expiresAtEpochSeconds * 1_000).toISOString(),
            ),
          });
          return yield* Schema.decodeUnknown(StudioBootstrap)(bootstrap).pipe(
            Effect.mapError((cause) => failure("studio.bootstrap.decode", cause)),
          );
        }
      }
    }),
  };
}

export class StudioRepository extends Context.Tag("StudioRepository")<
  StudioRepository,
  ReturnType<typeof makeStudioRepository>
>() {}

export const StudioRepositoryLive = Layer.succeed(StudioRepository, makeStudioRepository());
