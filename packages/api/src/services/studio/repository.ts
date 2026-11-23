import {
  STUDIO_SESSION_SCOPE,
  isStudioGrantActive,
  studioGrantExpiresAtEpochSeconds,
  studioSessionAuditRequestId,
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
import {
  environmentPreviewTarget,
  studioRegistration,
} from "@framerfordevs/db/schema/control-plane";
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
  PreviewTargetUrl,
  StudioApplicationOrigin,
  StudioMountPath,
  StudioRegistrationId,
  isPortableStudioMountPath,
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
import type { StudioEditorPrincipal, StudioRequestPrincipal } from "./principal-authenticator";
import type { ApplicationDb } from "../project-access";

interface StudioBootstrapInput {
  readonly principal: StudioRequestPrincipal;
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

  const getEditorBootstrap = Effect.fn("StudioRepository.getEditorBootstrap")(function* (input: {
    readonly principal: StudioEditorPrincipal;
    readonly projectId: ProjectId;
    readonly environmentId: EnvironmentId;
  }) {
    const result = yield* Effect.tryPromise({
      try: () =>
        database.transaction(async (transaction) => {
          const [currentProject] = await transaction
            .select({
              id: project.id,
              workspaceId: project.workspaceId,
              name: project.name,
              archivedAt: project.archivedAt,
            })
            .from(project)
            .where(eq(project.id, input.projectId))
            .limit(1);
          if (!currentProject || currentProject.archivedAt !== null) {
            return { kind: "not_found" as const };
          }
          const [currentEnvironment] = await transaction
            .select({ id: environment.id, key: environment.key, name: environment.name })
            .from(environment)
            .where(
              and(
                eq(environment.id, input.environmentId),
                eq(environment.projectId, currentProject.id),
                eq(environment.workspaceId, currentProject.workspaceId),
                eq(environment.isPrimary, true),
              ),
            )
            .limit(1);
          if (!currentEnvironment) return { kind: "not_found" as const };
          const [workspaceAccess] = await transaction
            .select({ role: workspaceMembership.role })
            .from(workspaceMembership)
            .where(
              and(
                eq(workspaceMembership.workspaceId, currentProject.workspaceId),
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
                eq(projectMembership.workspaceId, currentProject.workspaceId),
                eq(projectMembership.projectId, currentProject.id),
                eq(projectMembership.userId, input.principal.userId),
                isNull(projectMembership.removedAt),
              ),
            )
            .limit(1);
          const role = workspaceAccess?.role === "owner" ? "owner" : projectAccess?.role;
          if (!role) return { kind: "not_found" as const };
          const [cmsCapability] = await transaction
            .select({ status: projectCapability.status })
            .from(projectCapability)
            .where(
              and(
                eq(projectCapability.workspaceId, currentProject.workspaceId),
                eq(projectCapability.projectId, currentProject.id),
                eq(projectCapability.key, "cms"),
              ),
            )
            .limit(1);
          if (cmsCapability?.status !== "enabled") return { kind: "cms_required" as const };
          const [currentUser] = await transaction
            .select({ id: user.id, name: user.name, email: user.email })
            .from(user)
            .where(eq(user.id, input.principal.userId))
            .limit(1);
          if (!currentUser) return { kind: "not_found" as const };
          const [previewTarget] = await transaction
            .select({ previewUrl: environmentPreviewTarget.previewUrl })
            .from(environmentPreviewTarget)
            .where(
              and(
                eq(environmentPreviewTarget.workspaceId, currentProject.workspaceId),
                eq(environmentPreviewTarget.projectId, currentProject.id),
                eq(environmentPreviewTarget.environmentId, currentEnvironment.id),
              ),
            )
            .limit(1);
          return {
            kind: "success" as const,
            project: currentProject,
            environment: currentEnvironment,
            user: currentUser,
            role,
            previewUrl: previewTarget?.previewUrl ?? null,
          };
        }),
      catch: (cause) => failure("studio.editor_bootstrap.get", cause),
    });
    switch (result.kind) {
      case "not_found":
        return yield* NotFoundFailure.make({ resource: "studio" });
      case "cms_required":
        return yield* CmsCapabilityRequiredFailure.make();
      case "success": {
        const role = yield* Schema.decodeUnknownEffect(ProjectRole)(result.role).pipe(
          Effect.mapError((cause) => failure("studio.editor_bootstrap.role.decode", cause)),
        );
        const previewUrl =
          result.previewUrl === null
            ? null
            : yield* Schema.decodeUnknownEffect(PreviewTargetUrl)(result.previewUrl).pipe(
                Effect.mapError((cause) =>
                  failure("studio.editor_bootstrap.preview.decode", cause),
                ),
              );
        const bootstrap = buildStudioBootstrap({
          host: { kind: "local_editor", previewUrl },
          project: {
            id: ProjectId.make(result.project.id),
            name: ProjectName.make(result.project.name),
            workspaceId: WorkspaceId.make(result.project.workspaceId),
          },
          environment: { id: EnvironmentId.make(result.environment.id), key: "main", name: "main" },
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
        return yield* Schema.decodeUnknownEffect(StudioBootstrap)(bootstrap).pipe(
          Effect.mapError((cause) => failure("studio.editor_bootstrap.decode", cause)),
        );
      }
    }
  });

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
            if (
              !registration ||
              !isPortableStudioMountPath(registration.mountPath) ||
              !metadataMatches(client.metadata, registration)
            ) {
              return false;
            }
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
      if (input.principal.kind === "studio_editor_user") {
        return yield* getEditorBootstrap({ ...input, principal: input.principal });
      }
      const principal = input.principal;
      if (
        principal.projectId !== input.projectId ||
        principal.environmentId !== input.environmentId
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
                  eq(studioRegistration.id, principal.registrationId),
                  eq(studioRegistration.projectId, input.projectId),
                  eq(studioRegistration.environmentId, input.environmentId),
                ),
              )
              .limit(1);
            if (!registration) return { kind: "not_found" as const };
            if (registration.runtimeStatus !== "active") {
              return { kind: "inactive" as const };
            }
            if (
              !isPortableStudioMountPath(registration.mountPath) ||
              registration.version !== principal.registrationVersion
            ) {
              return { kind: "authority_changed" as const };
            }

            const now = new Date();
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
                  eq(workspaceMembership.userId, principal.userId),
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
                  eq(projectMembership.userId, principal.userId),
                  isNull(projectMembership.removedAt),
                ),
              )
              .limit(1);
            const [currentUser] = await transaction
              .select({ id: user.id, name: user.name, email: user.email })
              .from(user)
              .where(eq(user.id, principal.userId))
              .limit(1);
            const [client] = await transaction
              .select({
                disabled: oauthClient.disabled,
                referenceId: oauthClient.referenceId,
                metadata: oauthClient.metadata,
              })
              .from(oauthClient)
              .where(eq(oauthClient.clientId, principal.clientId))
              .limit(1);
            const [resourceLink] = await transaction
              .select({ id: oauthClientResource.id })
              .from(oauthClientResource)
              .where(
                and(
                  eq(oauthClientResource.clientId, principal.clientId),
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
                  eq(oauthConsent.clientId, principal.clientId),
                  eq(oauthConsent.userId, principal.userId),
                ),
              )
              .limit(1);
            const grantIdHex = principal.grantId.replaceAll("-", "");
            const [currentGrant] = await transaction
              .select({ id: oauthRefreshToken.id })
              .from(oauthRefreshToken)
              .where(
                and(
                  eq(oauthRefreshToken.clientId, principal.clientId),
                  eq(oauthRefreshToken.userId, principal.userId),
                  isNull(oauthRefreshToken.revoked),
                  gt(oauthRefreshToken.expiresAt, now),
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
              .select({ id: auditEvent.id, occurredAt: auditEvent.occurredAt })
              .from(auditEvent)
              .where(
                and(
                  eq(auditEvent.id, principal.auditMarkerId),
                  eq(auditEvent.workspaceId, registration.workspaceId),
                  eq(auditEvent.projectId, registration.projectId),
                  eq(auditEvent.environmentId, registration.environmentId),
                  eq(auditEvent.actorType, "user"),
                  eq(auditEvent.actorId, principal.userId),
                  eq(auditEvent.action, "studio.session.established"),
                  eq(auditEvent.resourceType, "studio_grant"),
                  eq(auditEvent.resourceId, principal.grantId),
                  eq(
                    auditEvent.requestId,
                    studioSessionAuditRequestId(
                      principal.auditMarkerId,
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
            const exactGrantDeadline =
              auditMarker !== undefined &&
              principal.grantExpiresAtEpochSeconds ===
                studioGrantExpiresAtEpochSeconds(auditMarker.occurredAt) &&
              isStudioGrantActive(principal.grantExpiresAtEpochSeconds, now);
            if (!exactConsent || !currentGrant || !exactGrantDeadline) {
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
          const role = yield* Schema.decodeUnknownEffect(ProjectRole)(result.role).pipe(
            Effect.mapError((cause) => failure("studio.bootstrap.role.decode", cause)),
          );
          const bootstrap = buildStudioBootstrap({
            host: {
              kind: "mounted",
              registration: {
                id: StudioRegistrationId.make(result.registration.id),
                version: ResourceVersion.make(result.registration.version),
                applicationOrigin: StudioApplicationOrigin.make(
                  result.registration.applicationOrigin,
                ),
                mountPath: StudioMountPath.make(result.registration.mountPath),
              },
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
              new Date(principal.expiresAtEpochSeconds * 1_000).toISOString(),
            ),
          });
          return yield* Schema.decodeUnknownEffect(StudioBootstrap)(bootstrap).pipe(
            Effect.mapError((cause) => failure("studio.bootstrap.decode", cause)),
          );
        }
      }
    }),
  };
}

export class StudioRepository extends Context.Service<
  StudioRepository,
  ReturnType<typeof makeStudioRepository>
>()("StudioRepository") {}

export const StudioRepositoryLive = Layer.succeed(StudioRepository, makeStudioRepository());
